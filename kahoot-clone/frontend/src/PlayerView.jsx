import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './lib/api';
import { useGameState } from './lib/useGameState';

export default function PlayerView() {
  const [searchParams] = useSearchParams();
  const initialPin = searchParams.get('pin') || '';
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(0);

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

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!pin || !nickname) return;
    try {
      const res = await api.joinGame(pin.trim(), nickname.trim());
      sessionStorage.setItem(`kamooy:${pin.trim()}`, res.playerId);
      setPlayerId(res.playerId);
    } catch (err) {
      alert(err.message);
    }
  };

  const selectChoice = (index) => {
    if (submitted) return;
    setSelectedIndex(index);
    setSubmitted(true);
    api.submitAnswer(pin.trim(), playerId, index).catch(() => {
      // Same as the socket version: late answers after the reveal are ignored
    });
  };

  const joined = !!playerId;

  if (!joined) {
    return (
      <div className="player-container" style={{ backgroundColor: '#ffcc00', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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
      <div className="player-container" style={{ backgroundColor: 'var(--kahoot-green)', color: 'white' }}>
        <div className="status-message">You're in!<br/>See your nickname on screen</div>
      </div>
    );
  }

  if (gameState === 'QUESTION_PREVIEW') {
    return (
      <div className="player-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', backgroundColor: 'var(--theme-yellow)', overflow: 'hidden' }}>
        <div style={{ position: 'relative', top: '-5vh', textAlign: 'center', width: '90%' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '2.5rem', fontWeight: 'bold', color: '#333', marginBottom: '30px', display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
            {currentQuestion?.text}
          </div>
          <div style={{ fontSize: '5rem', fontWeight: 'bold', color: '#333', minHeight: '120px' }}>
            {previewTimeLeft <= 3 && previewTimeLeft > 0 ? previewTimeLeft : ''}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_ACTIVE' && submitted) {
    return (
      <div className="player-container" style={{ backgroundColor: 'var(--theme-yellow)', color: '#333' }}>
        <div className="status-message">
          Waiting for others...
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_ACTIVE' && !submitted) {
    return (
      <div className="player-container">
        <div className="pad-grid">
          {Array.from({ length: currentQuestion?.choicesCount || 4 }).map((_, i) => (
            <button
              key={i}
              className={`pad-btn c-${i % 6}`}
              onClick={() => selectChoice(i)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_RESULT') {
    const isCorrect = resultData?.correctAnswers?.includes(selectedIndex);

    return (
      <div className="player-container" style={{ backgroundColor: isCorrect ? 'var(--kahoot-green)' : 'var(--kahoot-red)', color: 'white' }}>
        <div className="status-message">
          {isCorrect ? 'Correct! 🎉' : 'Incorrect 😢'}
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_LEADERBOARD') {
    return (
      <div className="player-container" style={{ backgroundColor: 'var(--theme-yellow)', color: '#333' }}>
        <div className="status-message">
          Your Score
          <div style={{ fontSize: '3rem', marginTop: '20px' }}>{myScore}</div>
        </div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="player-container" style={{ backgroundColor: 'var(--kahoot-red)', color: 'white' }}>
        <div className="status-message">
          Game Over!<br/>Your Score: {finalResult?.myScore ?? myScore}
          {finalResult?.myRank ? <><br/>Rank #{finalResult.myRank}</> : null}
        </div>
      </div>
    );
  }

  return null;
}
