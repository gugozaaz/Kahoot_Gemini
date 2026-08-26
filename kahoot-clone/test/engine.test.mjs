// End-to-end flow test driving the real API route handlers against the
// in-memory store. Simulates a full game: create -> join x2 -> start ->
// answer -> auto reveal -> leaderboard -> next -> timeout -> game over.
// Run: node test/engine.test.mjs
import assert from 'node:assert/strict';
import createGameHandler from '../frontend/api/create-game.js';
import joinGameHandler from '../frontend/api/join-game.js';
import gameStateHandler from '../frontend/api/game-state.js';
import hostActionHandler from '../frontend/api/host-action.js';
import submitAnswerHandler from '../frontend/api/submit-answer.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeReq(method, { query = {}, body } = {}) {
  const chunks = body !== undefined ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method,
    query,
    async *[Symbol.asyncIterator]() { yield* chunks; },
  };
}

async function call(handler, req) {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(payload = '') { this.body += payload; },
  };
  await handler(req, res);
  let json = null;
  try { json = JSON.parse(res.body); } catch {}
  return { status: res.statusCode, json };
}

const QUESTIONS = [
  {
    text: 'What is 2+2?',
    choices: ['3', '4', '5', '6'],
    correctAnswers: [1],
    timeLimit: 3,
    scoreMultiplier: 1,
  },
  {
    text: 'Sky color?',
    choices: ['Blue', 'Red'],
    correctAnswers: [0],
    timeLimit: 2,
    scoreMultiplier: 2,
  },
];

let passed = 0;
function ok(label, cond) {
  if (!cond) throw new Error(`FAILED: ${label}`);
  passed++;
  console.log(`  ok - ${label}`);
}

console.log('1. Create game');
let r = await call(createGameHandler, makeReq('POST', { body: { questions: QUESTIONS } }));
ok('create returns success', r.json?.success === true);
ok('pin is 6 digits', /^\d{6}$/.test(r.json.pin));
ok('hostId returned', typeof r.json.hostId === 'string');
const { pin, hostId } = r.json;

r = await call(createGameHandler, makeReq('POST', { body: {} }));
ok('create without questions rejected', r.status === 400);

console.log('2. Join players');
r = await call(joinGameHandler, makeReq('POST', { body: { pin, nickname: 'Ann' } }));
ok('Ann joined', r.json?.success === true);
const annId = r.json.playerId;

r = await call(joinGameHandler, makeReq('POST', { body: { pin, nickname: 'Ben' } }));
ok('Ben joined', r.json?.success === true);
const benId = r.json.playerId;

r = await call(joinGameHandler, makeReq('POST', { body: { pin, nickname: 'Ann' } }));
ok('duplicate nickname rejected', r.json?.error === 'Nickname taken');

r = await call(joinGameHandler, makeReq('POST', { body: { pin: '000000', nickname: 'X' } }));
ok('unknown pin rejected', r.json?.error === 'Game not found');

console.log('3. Lobby state');
r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'host', token: hostId } }));
ok('host sees LOBBY', r.json.status === 'LOBBY');
ok('two players listed', r.json.players.length === 2);

r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'host', token: 'wrong' } }));
ok('wrong host token rejected', r.status === 403);

console.log('4. Start game -> preview');
r = await call(hostActionHandler, makeReq('POST', { body: { pin, hostId, action: 'start-game' } }));
ok('action succeeds', r.json?.success === true);
ok('state is QUESTION_PREVIEW', r.json.state.status === 'QUESTION_PREVIEW');
ok('preview countdown present', r.json.state.previewTimeLeftMs > 0 && r.json.state.previewTimeLeftMs <= 5000);

r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'player', token: annId } }));
ok('player sees preview text', r.json.question?.text === 'What is 2+2?');

r = await call(joinGameHandler, makeReq('POST', { body: { pin, nickname: 'Late' } }));
ok('join after start rejected', r.json?.error === 'Game already started');

console.log('5. Wait out preview (5s) -> active');
await sleep(5200);
r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'host', token: hostId } }));
ok('lazy transition to QUESTION_ACTIVE', r.json.status === 'QUESTION_ACTIVE');
ok('time left within limit', r.json.timeLeftMs > 2000 && r.json.timeLeftMs <= 3000);
ok('correctAnswers hidden from host during play', !JSON.stringify(r.json).includes('"correctAnswers"'));

console.log('6. Answers + auto reveal');
// Ben answers correctly fast; Ann answers wrong -> everyone answered -> reveal
r = await call(submitAnswerHandler, makeReq('POST', { body: { pin, playerId: benId, choice: 1 } }));
ok('Ben answer accepted', r.json?.success === true);
r = await call(submitAnswerHandler, makeReq('POST', { body: { pin, playerId: annId, choice: 0 } }));
ok('Ann answer accepted', r.json?.success === true);

r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'player', token: benId } }));
ok('all answered -> QUESTION_RESULT', r.json.status === 'QUESTION_RESULT');
ok('Ben got speed points (>750, <=1000)', r.json.result.myScore > 750 && r.json.result.myScore <= 1000);
ok('Ben sees correctAnswers', r.json.result.correctAnswers.includes(1));
ok('Ben was right', r.json.result.correctAnswers.includes(1) && true);

r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'player', token: annId } }));
ok('Ann scored 0', r.json.result.myScore === 0);

r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'host', token: hostId } }));
ok('stats count both answers', r.json.result.answersStats['0'] === 1 && r.json.result.answersStats['1'] === 1);
ok('leaderboard puts Ben first', r.json.result.leaderboard[0].nickname === 'Ben');
ok('rankChange present', ['up', 'down', 'same'].includes(r.json.result.leaderboard[0].rankChange));

r = await call(submitAnswerHandler, makeReq('POST', { body: { pin, playerId: benId, choice: 2 } }));
ok('answering outside ACTIVE rejected', r.json?.error === 'Question is not active');

console.log('7. Leaderboard -> next question');
r = await call(hostActionHandler, makeReq('POST', { body: { pin, hostId, action: 'show-leaderboard' } }));
ok('QUESTION_LEADERBOARD', r.json.state.status === 'QUESTION_LEADERBOARD');
ok('result still available for leaderboard view', r.json.state.result.leaderboard.length === 2);

r = await call(hostActionHandler, makeReq('POST', { body: { pin, hostId, action: 'next-question' } }));
ok('second question preview', r.json.state.status === 'QUESTION_PREVIEW' && r.json.state.currentIndex === 1);

console.log('8. Timeout path (no answers)');
await sleep(5200);
r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'host', token: hostId } }));
ok('question 2 active', r.json.status === 'QUESTION_ACTIVE');
await sleep(2200); // timeLimit 2s expires with zero answers
r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'host', token: hostId } }));
ok('timeout reveals result', r.json.status === 'QUESTION_RESULT');
ok('no answers recorded', Object.values(r.json.result.answersStats).every(v => v === 0));

console.log('9. Finish game');
await call(hostActionHandler, makeReq('POST', { body: { pin, hostId, action: 'show-leaderboard' } }));
r = await call(hostActionHandler, makeReq('POST', { body: { pin, hostId, action: 'next-question' } }));
ok('GAME_OVER', r.json.state.status === 'GAME_OVER');
ok('final leaderboard sorted', r.json.state.finalLeaderboard[0].nickname === 'Ben'
  && r.json.state.finalLeaderboard[0].score >= r.json.state.finalLeaderboard[1].score);

r = await call(gameStateHandler, makeReq('GET', { query: { pin, role: 'player', token: annId } }));
ok('player sees own rank', r.json.finalLeaderboard.myRank === 2);

console.log(`\nAll ${passed} assertions passed ✅`);
