import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './lib/api';
import { useGameState } from './lib/useGameState';
import { useCountUp } from './lib/useCountUp';
import { sfx } from './lib/sound';
import Confetti from './components/Confetti';
import SoundToggle from './components/SoundToggle';

const CHOICE_SYMBOLS = ['▲', '◆', '●', '■', '★', '⬟'];

export default function PlayerView() {
  const [searchParams] = useSearchParams();
  const initialPin = searchParams.get('pin') || '';
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(0);
  const [tappedIndex, setTappedIndex] = useState(null);
  const [pointsGained, setPointsGained] = useState(0);
  const [streak, setStreak] = useState(0);

  const { state } = useGameState({ pin, role: 'player', token: playerId, enabled: !!playerId });

  // Derived from server state (was: socket event handlers + local mirrors)
  const gameState = state?.status || 'LOBBY'; // LOBBY, QUESTION_PREVIEW, QUESTION_ACTIVE, QUESTION_RESULT, QUESTION_LEADERBOARD, GAME_OVER
  const currentQuestion = state?.question;
  const myScore = state?.myScore || 0;
  const resultData = state?.result;
  const finalResult = state?.finalLeaderboard;

  useEffect(() => {
    let timer;
    if (gameState === 'QUESTION_PREVIEW' && previewTimeLeft > 0) {
      timer = setInterval(() => {
        setPreviewTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, previewTimeLeft]);

  // Seed the preview countdown from the server timestamp
  useEffect(() => {
    if (state?.status === 'QUESTION_PREVIEW') {
      setPreviewTimeLeft(Math.ceil((state.previewTimeLeftMs || 0) / 1000));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.currentIndex]);

  // New question -> allow answering again
  useEffect(() => {
    setSelectedIndex(null);
    setSubmitted(false);
    setTappedIndex(null);
  }, [state?.currentIndex]);

  // Survive a page refresh within the same game
  useEffect(() => {
    const savedPin = initialPin || pin;
    if (!savedPin) return;
    const savedId = sessionStorage.getItem(`kamooy:${savedPin}`);
    if (savedId) {
      setPin(savedPin);
      setPlayerId(savedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Audio + reward feedback on every phase change ------------------------
  const prevPhase = useRef(null);
  const scoreBeforeResult = useRef(0);
  const wasCorrect = resultData?.correctAnswers?.includes(selectedIndex);

  useEffect(() => {
    if (!playerId) return;
    if (prevPhase.current === gameState) return;
    const leaving = prevPhase.current;
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
      case 'QUESTION_RESULT': {
        sfx.stopMusic();
        const gained = Math.max(0, (resultData?.myScore ?? myScore) - scoreBeforeResult.current);
        setPointsGained(gained);
        if (wasCorrect) {
          const nextStreak = streak + 1;
          setStreak(nextStreak);
          if (nextStreak >= 2) sfx.streak(nextStreak);
          else sfx.correct();
        } else {
          setStreak(0);
          sfx.wrong();
        }
        break;
      }
      case 'QUESTION_LEADERBOARD':
        // Remember the score we start the next question with.
        scoreBeforeResult.current = myScore;
        if (leaving) sfx.leaderboard();
        break;
      case 'GAME_OVER':
        sfx.stopMusic();
        sfx.fanfare();
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, playerId]);

  useEffect(() => () => sfx.stopMusic(), []);

  // Preview 3-2-1 beeps
  const prevPreviewTick = useRef(null);
  useEffect(() => {
    if (gameState !== 'QUESTION_PREVIEW') return;
    if (previewTimeLeft > 3 || previewTimeLeft <= 0) return;
    if (prevPreviewTick.current === previewTimeLeft) return;
    prevPreviewTick.current = previewTimeLeft;
    sfx.countdown();
  }, [gameState, previewTimeLeft]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!pin || !nickname) return;
    sfx.unlock(); // real click: the browser now lets us play audio
    try {
      const res = await api.joinGame(pin.trim(), nickname.trim());
      sessionStorage.setItem(`kamooy:${pin.trim()}`, res.playerId);
      setPlayerId(res.playerId);
      sfx.join();
    } catch (err) {
      alert(err.message);
    }
  };

  const selectChoice = (index) => {
    if (submitted) return;
    sfx.select();
    setTappedIndex(index);
    setSelectedIndex(index);
    setSubmitted(true);
    if (navigator.vibrate) navigator.vibrate(30);
    api.submitAnswer(pin.trim(), playerId, index).catch(() => {
      // Same as the socket version: late answers after the reveal are ignored
    });
  };

  const joined = !!playerId;

  if (!joined) {
    return (
      <div className="player-container game-bg" style={{ backgroundColor: '#ffcc00', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <SoundToggle />
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '4rem', color: '#fff', textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000', margin: 0 }}>
            Kamooy!
          </h1>
        </div>

        <form className="join-form" onSubmit={handleJoin} style={{
          backgroundColor: '#fff',
          padding: '20px',
          borderRadius: '5px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          width: '300px'
        }}>
          {initialPin ? null : (
            <input
              className="input-field"
              placeholder="Game PIN"
              value={pin}
              onChange={e => setPin(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
          )}
          <input
            className="input-field"
            placeholder="Enter your name"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            style={{ marginBottom: '10px' }}
          />
          <button className="join-btn" type="submit">Enter</button>
        </form>
      </div>
    );
  }

  if (gameState === 'LOBBY') {
    return (
      <div className="player-container game-bg" style={{ backgroundColor: 'var(--kahoot-green)', color: 'white' }}>
        <SoundToggle />
        <div className="status-message">
          <span className="feedback-icon">🎉</span>
          You&apos;re in!<br />See your nickname on screen
          <div className="waiting-dots-inline" style={{ fontSize: '1.2rem', marginTop: '10px', opacity: 0.9 }}>Waiting for the host</div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_PREVIEW') {
    return (
      <div className="player-container game-bg" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', backgroundColor: 'var(--theme-yellow)', overflow: 'hidden' }}>
        <SoundToggle />
        <div style={{ position: 'relative', top: '-5vh', textAlign: 'center', width: '90%' }}>
          <div className="preview-question" style={{ backgroundColor: '#ffffff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '2.5rem', fontWeight: 'bold', color: '#333', marginBottom: '30px', display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
            {currentQuestion?.text}
          </div>
          <div style={{ fontSize: '5rem', fontWeight: 'bold', color: '#333', minHeight: '120px' }}>
            {previewTimeLeft <= 3 && previewTimeLeft > 0
              ? <span key={previewTimeLeft} className="preview-count">{previewTimeLeft}</span>
              : <div className="preview-dots"><span /><span /><span /></div>}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_ACTIVE' && submitted) {
    return (
      <div className="player-container game-bg" style={{ backgroundColor: 'var(--theme-yellow)', color: '#333' }}>
        <SoundToggle />
        <div className="status-message">
          <span className="feedback-icon">🔒</span>
          Answer locked in
          <div className="waiting-dots-inline" style={{ fontSize: '1.3rem', marginTop: '8px' }}>Waiting for others</div>
          <div className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#333' }}></div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_ACTIVE' && !submitted) {
    return (
      <div className="player-container game-bg">
        <SoundToggle />
        <div className="pad-grid">
          {Array.from({ length: currentQuestion?.choicesCount || 4 }).map((_, i) => (
            <button
              key={i}
              className={`pad-btn c-${i % 6}${tappedIndex === i ? ' tapped' : ''}`}
              style={{ animationDelay: `${i * 0.07}s` }}
              aria-label={`Answer ${i + 1}`}
              onClick={() => selectChoice(i)}
            >
              <span className="pad-symbol">{CHOICE_SYMBOLS[i % CHOICE_SYMBOLS.length]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_RESULT') {
    const isCorrect = wasCorrect;

    return (
      <div
        className={`player-container game-bg ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`}
        style={{ backgroundColor: isCorrect ? 'var(--kahoot-green)' : 'var(--kahoot-red)', color: 'white' }}
      >
        <SoundToggle />
        {isCorrect && <Confetti count={110} duration={3200} spread="burst" />}
        <div className="status-message" style={{ animation: 'none' }}>
          <span className="feedback-icon">{isCorrect ? '🎯' : '💥'}</span>
          {isCorrect ? 'Correct!' : 'Not this time'}
          {isCorrect && pointsGained > 0 && (
            <div className="score-pop">+{pointsGained}</div>
          )}
          {isCorrect && streak >= 2 && (
            <div>
              <span className="streak-badge">🔥 {streak} in a row!</span>
            </div>
          )}
          {!isCorrect && (
            <div style={{ fontSize: '1.2rem', marginTop: '14px', opacity: 0.9 }}>Next question is your comeback</div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_LEADERBOARD') {
    return (
      <div className="player-container game-bg" style={{ backgroundColor: 'var(--theme-yellow)', color: '#333' }}>
        <SoundToggle />
        <div className="status-message" style={{ animation: 'none' }}>
          <span className="feedback-icon">📊</span>
          Your Score
          <AnimatedScore value={myScore} size="3rem" />
          {streak >= 2 && <div><span className="streak-badge">🔥 {streak} streak</span></div>}
        </div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    const rank = finalResult?.myRank;
    const podium = rank && rank <= 3;

    return (
      <div className="player-container game-bg" style={{ backgroundColor: podium ? 'var(--kahoot-green)' : 'var(--kahoot-red)', color: 'white' }}>
        <SoundToggle />
        {podium && <Confetti count={180} duration={7000} />}
        <div className="status-message" style={{ animation: 'none' }}>
          <span className="trophy">{podium ? '🏆' : '🎮'}</span>
          Game Over!
          <AnimatedScore value={finalResult?.myScore ?? myScore} size="3.4rem" />
          {rank ? <div><span className="rank-plate">Rank #{rank}</span></div> : null}
        </div>
      </div>
    );
  }

  return null;
}

// Score that ticks up to its new value.
function AnimatedScore({ value, size }) {
  const shown = useCountUp(value, 1200);
  return <div style={{ fontSize: size, marginTop: '20px', fontWeight: 900 }}>{shown}</div>;
}
