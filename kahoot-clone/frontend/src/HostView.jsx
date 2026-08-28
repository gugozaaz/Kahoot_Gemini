import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from './lib/api';
import { useGameState } from './lib/useGameState';
import { useCountUp } from './lib/useCountUp';
import { sfx } from './lib/sound';
import Confetti from './components/Confetti';
import SoundToggle from './components/SoundToggle';
import CountdownRing from './components/CountdownRing';

const CHOICE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#2eb8a6', '#8e44ad'];
const CHOICE_SYMBOLS = ['▲', '◆', '●', '■', '★', '⬟'];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function HostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState(null);
  const [hostId, setHostId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(0);
  const [playerBump, setPlayerBump] = useState(false);
  const [answerBump, setAnswerBump] = useState(false);

  const { state, injectState } = useGameState({ pin, role: 'host', token: hostId, enabled: !!pin });

  // Derived from server state (was: socket event handlers + local mirrors)
  const gameState = !pin ? 'INIT' : state?.status || 'LOBBY'; // INIT, LOBBY, QUESTION_PREVIEW, QUESTION_ACTIVE, QUESTION_RESULT, QUESTION_LEADERBOARD, GAME_OVER
  const players = state?.players || [];
  const currentQuestion = state?.question;
  const answersCount = state?.answersCount || 0;
  const resultData = state?.result;
  const leaderboard = state?.finalLeaderboard;
  const questionTotal = currentQuestion?.timeLimit || 30;

  useEffect(() => {
    let timer;
    if (gameState === 'QUESTION_ACTIVE' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  useEffect(() => {
    let timer;
    if (gameState === 'QUESTION_PREVIEW' && previewTimeLeft > 0) {
      timer = setInterval(() => {
        setPreviewTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, previewTimeLeft]);

  // Seed countdowns from server timestamps whenever a phase/question changes
  useEffect(() => {
    if (!state) return;
    if (state.status === 'QUESTION_ACTIVE') {
      setTimeLeft(Math.ceil((state.timeLeftMs || 0) / 1000));
    } else if (state.status === 'QUESTION_PREVIEW') {
      setPreviewTimeLeft(Math.ceil((state.previewTimeLeftMs || 0) / 1000));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.currentIndex]);

  // --- Audio: one cue per phase transition, plus the matching music bed -----
  const prevPhase = useRef(null);
  useEffect(() => {
    if (prevPhase.current === gameState) return;
    prevPhase.current = gameState;

    switch (gameState) {
      case 'LOBBY':
        sfx.music('lobby');
        break;
      case 'QUESTION_PREVIEW':
        sfx.stopMusic();
        break;
      case 'QUESTION_ACTIVE':
        sfx.go();
        sfx.music('question');
        break;
      case 'QUESTION_RESULT':
        sfx.stopMusic();
        sfx.reveal();
        break;
      case 'QUESTION_LEADERBOARD':
        sfx.leaderboard();
        break;
      case 'GAME_OVER':
        sfx.stopMusic();
        sfx.fanfare();
        break;
      default:
        break;
    }
  }, [gameState]);

  useEffect(() => () => sfx.stopMusic(), []);

  // Clock ticks: steady until the last five seconds, then urgent.
  const prevTick = useRef(null);
  useEffect(() => {
    if (gameState !== 'QUESTION_ACTIVE' || timeLeft <= 0) return;
    if (prevTick.current === timeLeft) return;
    prevTick.current = timeLeft;
    if (timeLeft <= 5) sfx.urgentTick();
    else if (timeLeft % 2 === 0) sfx.tick();
  }, [gameState, timeLeft]);

  // Preview 3-2-1 beeps
  const prevPreviewTick = useRef(null);
  useEffect(() => {
    if (gameState !== 'QUESTION_PREVIEW') return;
    if (previewTimeLeft > 3 || previewTimeLeft <= 0) return;
    if (prevPreviewTick.current === previewTimeLeft) return;
    prevPreviewTick.current = previewTimeLeft;
    sfx.countdown();
  }, [gameState, previewTimeLeft]);

  // A player joins the lobby -> blip + counter bump
  const prevPlayerCount = useRef(0);
  useEffect(() => {
    if (players.length > prevPlayerCount.current && gameState === 'LOBBY') {
      sfx.join();
      setPlayerBump(true);
      const t = setTimeout(() => setPlayerBump(false), 400);
      prevPlayerCount.current = players.length;
      return () => clearTimeout(t);
    }
    prevPlayerCount.current = players.length;
    return undefined;
  }, [players.length, gameState]);

  // An answer lands -> counter bump
  const prevAnswers = useRef(0);
  useEffect(() => {
    if (answersCount > prevAnswers.current) {
      setAnswerBump(true);
      const t = setTimeout(() => setAnswerBump(false), 360);
      prevAnswers.current = answersCount;
      return () => clearTimeout(t);
    }
    prevAnswers.current = answersCount;
    return undefined;
  }, [answersCount]);

  useEffect(() => {
    createGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runHostAction = async (action) => {
    try {
      const res = await api.hostAction(pin, hostId, action);
      if (res.state) injectState(res.state); // fresh state without waiting for the next poll
    } catch (err) {
      alert(err.message);
    }
  };

  const createGame = () => {
    const saved = localStorage.getItem('kamooy_presentations');
    if (!saved) { alert('No presentations found'); return navigate('/dashboard'); }
    const parsed = JSON.parse(saved);
    const presentation = parsed.find(p => p.id === id);
    if (!presentation || !presentation.slides) { alert('Presentation not found'); return navigate('/dashboard'); }

    // Map creator slides to backend format
    const questions = presentation.slides.map(slide => {
      const validAnswers = slide.answers.filter(a => a.text.trim() !== '');
      const choices = validAnswers.map(a => a.text);
      const correctAnswers = validAnswers.map((a, i) => a.isCorrect ? i : -1).filter(i => i !== -1);

      return {
        text: slide.question,
        image: slide.image,
        isFullScreenImage: slide.isFullScreenImage,
        choices,
        correctAnswers,
        timeLimit: slide.timeLimit || 30,
        scoreMultiplier: slide.scoreMultiplier !== undefined ? slide.scoreMultiplier : 1
      };
    });

    api.createGame(questions)
      .then(res => {
        setPin(res.pin);
        setHostId(res.hostId);
      })
      .catch(err => {
        alert(`Could not create game: ${err.message}`);
        navigate('/dashboard');
      });
  };

  if (gameState === 'INIT') {
    return (
      <div className="host-container game-bg">
        <SoundToggle />
        <h1 style={{ fontSize: '4rem', marginBottom: '20px', color: '#fff', textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}>Kamooy!</h1>
        <p>Loading...</p>
        <div className="spinner" style={{ borderTopColor: '#333' }}></div>
      </div>
    );
  }

  if (gameState === 'LOBBY') {
    return (
      <div className="host-container game-bg">
        <SoundToggle />
        <div className="lobby-header">
          <h2>Join at {window.location.origin}</h2>
          <div className="pin-display pin-pop" style={{ marginBottom: '20px' }}>PIN: {pin}</div>
          <div style={{ background: 'white', padding: '10px', display: 'inline-block', borderRadius: '8px' }}>
            <QRCodeSVG value={`${window.location.origin}/play?pin=${pin}`} size={200} />
          </div>
          <p style={{ marginTop: '10px' }}>Scan to join</p>
        </div>
        <div style={{ marginBottom: '20px', fontSize: '1.5rem' }}>
          <span className={`player-count${playerBump ? ' bump' : ''}`}>
            <span role="img" aria-label="players">👥</span> Players: {players.length}
          </span>
        </div>
        <div className="players-grid">
          {players.map((p, i) => (
            <div key={i} className="player-badge">{p.nickname}</div>
          ))}
        </div>
        {players.length > 0 && (
          <button
            className="btn-primary btn-glow"
            onClick={() => { sfx.unlock(); sfx.start(); runHostAction('start-game'); }}
          >
            Start Game
          </button>
        )}
      </div>
    );
  }

  if (gameState === 'QUESTION_PREVIEW') {
    return (
      <div className="host-container game-bg" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', overflow: 'hidden', backgroundColor: 'var(--theme-yellow)' }}>
        <SoundToggle />
        <div style={{ position: 'relative', top: '-10vh', textAlign: 'center' }}>
          <div className="preview-question" style={{ backgroundColor: '#ffffff', padding: '20px 40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '4rem', fontWeight: 'bold', color: '#333', marginBottom: '40px', display: 'inline-block' }}>
            {currentQuestion?.text}
          </div>
          <div style={{ fontSize: '6rem', fontWeight: 'bold', color: '#333', minHeight: '150px' }}>
            {previewTimeLeft <= 3 && previewTimeLeft > 0
              ? <span key={previewTimeLeft} className="preview-count">{previewTimeLeft}</span>
              : <div className="preview-dots"><span /><span /><span /></div>}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_ACTIVE') {
    return (
      <div className="host-container game-bg" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', overflow: 'hidden' }}>
        <SoundToggle />
        {currentQuestion?.image && currentQuestion?.isFullScreenImage && (
          <img src={currentQuestion.image} alt="Background" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 0, opacity: 0.8 }} />
        )}

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <CountdownRing value={timeLeft} total={questionTotal} />
            <span className={`answer-counter${answerBump ? ' bump' : ''}`} style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333', background: 'white', padding: '10px 20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
              Answers: {answersCount} / {players.length}
            </span>
          </div>

          <div className="question-headline" style={{ textAlign: 'center', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', fontSize: '2.5rem', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
            {currentQuestion?.text}
          </div>

          {/* Middle (Image) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0', minHeight: 0 }}>
            {currentQuestion?.image && !currentQuestion?.isFullScreenImage && (
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', padding: '15px', borderRadius: '8px', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img src={currentQuestion.image} alt="Slide" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              </div>
            )}
          </div>

          {/* Answers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {currentQuestion?.choices.map((choice, i) => (
              <div
                key={i}
                className="choice-anim"
                style={{ animationDelay: `${i * 0.09}s`, backgroundColor: CHOICE_COLORS[i % CHOICE_COLORS.length], color: 'white', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', fontWeight: 'bold', fontSize: '1.8rem', minHeight: '80px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
              >
                <span style={{ fontSize: '2rem', opacity: 0.9 }}>{CHOICE_SYMBOLS[i % CHOICE_SYMBOLS.length]}</span>
                <div style={{ flex: 1 }}>{choice}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_RESULT') {
    const totalVotes = Object.values(resultData?.answersStats || {}).reduce((a, b) => a + b, 0);

    return (
      <div className="host-container game-bg" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', overflow: 'hidden' }}>
        <SoundToggle />
        {currentQuestion?.image && currentQuestion?.isFullScreenImage && (
          <img src={currentQuestion.image} alt="Background" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 0, opacity: 0.2 }} />
        )}

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button className="btn-primary btn-glow" onClick={() => runHostAction('show-leaderboard')}>Next</button>
          </div>

          <div className="question-headline" style={{ textAlign: 'center', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', fontSize: '2.5rem', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
            Results: {currentQuestion?.text}
          </div>

          {/* Middle (Bar Chart) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '20px 0', minHeight: 0, gap: '40px' }}>
            {currentQuestion?.choices.map((choice, i) => {
              const votes = resultData?.answersStats[i] || 0;
              const percent = totalVotes === 0 ? 0 : Math.round((votes / totalVotes) * 100);
              const height = Math.max(percent, 5);
              const isCorrect = resultData?.correctAnswers.includes(i);

              return (
                <div key={`poll-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100px', height: '100%' }}>
                  <VoteCount value={votes} />
                  <div
                    className={`c-${i} poll-bar${isCorrect ? ' correct' : ''}`}
                    style={{ width: '100%', height: `${height}%`, opacity: isCorrect ? 1 : 0.4, borderRadius: '8px 8px 0 0', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
                  ></div>
                </div>
              );
            })}
          </div>

          {/* Answers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {currentQuestion?.choices.map((choice, i) => {
              const isCorrect = resultData?.correctAnswers.includes(i);
              return (
                <div
                  key={i}
                  className={isCorrect ? 'choice-correct' : 'choice-wrong'}
                  style={{ backgroundColor: CHOICE_COLORS[i % CHOICE_COLORS.length], color: 'white', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', fontWeight: 'bold', fontSize: '1.8rem', minHeight: '80px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                >
                  <span style={{ fontSize: '2rem', opacity: 0.9 }}>{CHOICE_SYMBOLS[i % CHOICE_SYMBOLS.length]}</span>
                  <div style={{ flex: 1 }}>{choice}</div>
                  {isCorrect && <span className="check-mark" style={{ fontSize: '2.5rem' }}>✔</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_LEADERBOARD') {
    return (
      <div className="host-container game-bg">
        <SoundToggle />
        <div className="leaderboard">
          <h2>Top 5 Players</h2>
          {resultData?.leaderboard.map((p, i) => (
            <LeaderRow key={i} player={p} index={i} />
          ))}
          <button className="btn-primary btn-glow" onClick={() => runHostAction('next-question')} style={{ width: '100%', marginTop: '20px' }}>Next Question</button>
        </div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="host-container game-bg">
        <SoundToggle />
        <Confetti count={220} duration={8000} />
        <span className="trophy" role="img" aria-label="trophy">🏆</span>
        <div className="leaderboard">
          <h2>Final Leaderboard</h2>
          {leaderboard?.map((p, i) => (
            <LeaderRow key={i} player={p} index={i} showRankChange={false} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// Vote tally that counts up as the bar grows.
function VoteCount({ value }) {
  const shown = useCountUp(value, 900);
  return <span style={{ fontWeight: 'bold', fontSize: '2rem', marginBottom: '10px', color: '#333' }}>{shown}</span>;
}

// One leaderboard row: slides in on a stagger, medal for the podium,
// score ticking up, and a beep when a player has climbed the board.
function LeaderRow({ player, index, showRankChange = true }) {
  const score = useCountUp(player.score, 1100);

  useEffect(() => {
    if (showRankChange && player.rankChange === 'up' && index < 3) {
      const t = setTimeout(() => sfx.rankUp(), 400 + index * 120);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`lb-row rank-anim${index === 0 ? ' is-leader' : ''}`}
      style={{ animationDelay: `${index * 0.14}s` }}
    >
      <span>
        {MEDALS[index] ? <span className="medal">{MEDALS[index]}</span> : null}
        {index + 1}. {player.nickname}
      </span>
      <span style={{ flex: 1 }}></span>
      <span>{score} pts</span>
      {showRankChange && (
        <span className={`rank-indicator ${player.rankChange || 'same'}`}>
          {player.rankChange === 'up' ? '▲' : player.rankChange === 'down' ? '▼' : '-'}
        </span>
      )}
    </div>
  );
}
