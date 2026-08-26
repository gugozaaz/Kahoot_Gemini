// Pure game engine ported from the original Socket.IO backend (backend/index.js).
// Differences from the socket version:
//   - Timers are timestamp-based: phase transitions are computed lazily by
//     advance(game, now) instead of setTimeout, so serverless cold starts
//     and polling clients can never miss a transition.
//   - Events are replaced by role-filtered state projections that clients poll.

import { ApiError } from './http.js';

export const PREVIEW_MS = 5000;

export function generatePIN() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export function newGame(pin, hostId, questions, now) {
    return {
        pin,
        hostId,
        status: 'LOBBY',
        players: {},            // playerId -> { id, nickname, score }
        questions: questions || [],
        currentQuestionIndex: 0,
        answers: {},            // playerId -> { choice, time }
        phaseStartedAt: now,
        questionStartedAt: 0
    };
}

export function currentQuestion(game) {
    return game.questions[game.currentQuestionIndex];
}

// Lazy phase transitions driven by elapsed time.
export function advance(game, now) {
    const q = currentQuestion(game);
    if (!q) return;

    if (game.status === 'QUESTION_PREVIEW' && now - game.phaseStartedAt >= PREVIEW_MS) {
        game.status = 'QUESTION_ACTIVE';
        game.answers = {};
        game.questionStartedAt = now;
        game.phaseStartedAt = now;
    }

    if (game.status === 'QUESTION_ACTIVE' && now - game.questionStartedAt >= q.timeLimit * 1000) {
        showResult(game, now);
    }
}

function getAnswerStats(game) {
    const stats = {};
    const q = currentQuestion(game);
    if (q && q.choices) {
        q.choices.forEach((_, i) => stats[i] = 0);
    }
    for (const answerData of Object.values(game.answers)) {
        if (stats[answerData.choice] !== undefined) {
            stats[answerData.choice]++;
        } else {
            stats[answerData.choice] = 1;
        }
    }
    return stats;
}

function sortedPlayers(game) {
    return Object.values(game.players).sort((a, b) => b.score - a.score);
}

// Exact port of triggerShowResult() from the socket backend.
export function showResult(game, now) {
    const q = currentQuestion(game);
    if (game.status !== 'QUESTION_ACTIVE') return;

    game.status = 'QUESTION_RESULT';
    game.phaseStartedAt = now;

    // Calculate previous ranks
    const previousSorted = sortedPlayers(game);
    const previousRanks = {};
    previousSorted.forEach((p, idx) => {
        previousRanks[p.id] = idx;
    });

    for (const [playerId, answerData] of Object.entries(game.answers)) {
        const { choice, time } = answerData;
        const isCorrect = q.correctAnswers.includes(choice);
        if (isCorrect) {
            // Calculate time taken in ms
            const timeTakenMs = time - game.questionStartedAt;
            const maxTimeMs = q.timeLimit * 1000;

            // Kahoot-style points formula based on speed
            let points = Math.round((1 - (timeTakenMs / maxTimeMs) / 2) * 1000);
            if (points < 0) points = 0;
            if (points > 1000) points = 1000;

            const multiplier = q.scoreMultiplier !== undefined ? q.scoreMultiplier : 1;
            points = points * multiplier;

            game.players[playerId].score += points;
        }
    }

    const scoresMap = {};
    for (const pId in game.players) {
        scoresMap[pId] = game.players[pId].score;
    }

    const currentSorted = sortedPlayers(game);
    const top5 = currentSorted.slice(0, 5).map((p, idx) => {
        let rankChange = 'same';
        if (previousRanks[p.id] > idx) rankChange = 'up';
        else if (previousRanks[p.id] < idx) rankChange = 'down';
        return { ...p, rankChange };
    });

    game.lastResult = {
        correctAnswers: q.correctAnswers,
        leaderboard: top5,
        answersStats: getAnswerStats(game),
        scores: scoresMap
    };
}

// --- Mutations used by API routes (throw ApiError on invalid requests) ---

export function assertHost(game, hostId) {
    if (game.hostId !== hostId) {
        throw new ApiError(403, 'Not the host of this game');
    }
}

export function joinPlayer(game, playerId, nickname, now) {
    if (game.status !== 'LOBBY') {
        throw new ApiError(400, 'Game already started');
    }
    const nameExists = Object.values(game.players).some(p => p.nickname === nickname);
    if (nameExists) {
        throw new ApiError(400, 'Nickname taken');
    }
    game.players[playerId] = { id: playerId, nickname, score: 0 };
}

export function hostAction(game, action, now) {
    switch (action) {
        case 'start-game':
            if (game.status !== 'LOBBY') throw new ApiError(400, 'Game already started');
            game.currentQuestionIndex = 0;
            beginPreview(game, now);
            break;
        case 'next-question': {
            if (game.status !== 'QUESTION_LEADERBOARD' && game.status !== 'QUESTION_RESULT') {
                throw new ApiError(400, 'Not between questions');
            }
            game.currentQuestionIndex++;
            if (game.currentQuestionIndex < game.questions.length) {
                beginPreview(game, now);
            } else {
                game.status = 'GAME_OVER';
                game.phaseStartedAt = now;
            }
            break;
        }
        case 'show-result':
            if (game.status !== 'QUESTION_ACTIVE') {
                throw new ApiError(400, 'No active question');
            }
            showResult(game, now);
            break;
        case 'show-leaderboard':
            if (game.status !== 'QUESTION_RESULT') {
                throw new ApiError(400, 'No result to show');
            }
            game.status = 'QUESTION_LEADERBOARD';
            game.phaseStartedAt = now;
            break;
        default:
            throw new ApiError(400, `Unknown action: ${action}`);
    }
}

function beginPreview(game, now) {
    game.status = 'QUESTION_PREVIEW';
    game.answers = {};
    game.phaseStartedAt = now;
    game.questionStartedAt = 0;
    delete game.lastResult;
}

export function submitAnswer(game, playerId, choice, now) {
    if (game.status !== 'QUESTION_ACTIVE') {
        throw new ApiError(400, 'Question is not active');
    }
    if (!game.players[playerId]) {
        throw new ApiError(403, 'Not a player in this game');
    }
    // Record answer and timestamp
    game.answers[playerId] = { choice, time: now };

    // Auto-trigger result if everyone has answered
    const totalPlayers = Object.keys(game.players).length;
    if (Object.keys(game.answers).length >= totalPlayers) {
        showResult(game, now);
    }
}

// --- Read-only projections served to polling clients ---

function questionForHost(game) {
    const q = currentQuestion(game);
    if (!q) return null;
    return {
        text: q.text,
        image: q.image,
        isFullScreenImage: q.isFullScreenImage,
        choices: q.choices,
        timeLimit: q.timeLimit
    };
}

export function hostProjection(row, now) {
    const { version, game } = row;
    const q = currentQuestion(game);
    const base = {
        version,
        serverNow: now,
        pin: game.pin,
        status: game.status,
        currentIndex: game.currentQuestionIndex,
        playersCount: Object.keys(game.players).length,
        players: Object.values(game.players),
        question: ['QUESTION_PREVIEW', 'QUESTION_ACTIVE', 'QUESTION_RESULT', 'QUESTION_LEADERBOARD'].includes(game.status)
            ? questionForHost(game)
            : null,
        previewTimeLeftMs: game.status === 'QUESTION_PREVIEW'
            ? Math.max(0, PREVIEW_MS - (now - game.phaseStartedAt))
            : null,
        timeLeftMs: game.status === 'QUESTION_ACTIVE'
            ? Math.max(0, q.timeLimit * 1000 - (now - game.questionStartedAt))
            : null,
        answersCount: game.status === 'QUESTION_ACTIVE' || game.status === 'QUESTION_RESULT'
            ? Object.keys(game.answers).length
            : null,
        result: game.status === 'QUESTION_RESULT' || game.status === 'QUESTION_LEADERBOARD'
            ? game.lastResult || null
            : null,
        finalLeaderboard: game.status === 'GAME_OVER'
            ? sortedPlayers(game)
            : null
    };
    return base;
}

export function playerProjection(row, playerId, now) {
    const { version, game } = row;
    const me = game.players[playerId];
    if (!me) throw new ApiError(403, 'Not a player in this game');
    const q = currentQuestion(game);
    const base = {
        version,
        serverNow: now,
        pin: game.pin,
        status: game.status,
        currentIndex: game.currentQuestionIndex,
        myScore: me.score,
        question: game.status === 'QUESTION_PREVIEW'
            ? { text: q.text, timeLimit: q.timeLimit }
            : game.status === 'QUESTION_ACTIVE'
                ? { text: q.text, choicesCount: q.choices ? q.choices.length : 4, timeLimit: q.timeLimit }
                : null,
        previewTimeLeftMs: game.status === 'QUESTION_PREVIEW'
            ? Math.max(0, PREVIEW_MS - (now - game.phaseStartedAt))
            : null,
        timeLeftMs: game.status === 'QUESTION_ACTIVE'
            ? Math.max(0, q.timeLimit * 1000 - (now - game.questionStartedAt))
            : null,
        result: game.status === 'QUESTION_RESULT'
            ? { correctAnswers: game.lastResult?.correctAnswers || [], myScore: me.score }
            : null,
        finalLeaderboard: game.status === 'GAME_OVER'
            ? { myScore: me.score, myRank: sortedPlayers(game).findIndex(p => p.id === playerId) + 1 }
            : null
    };
    return base;
}
