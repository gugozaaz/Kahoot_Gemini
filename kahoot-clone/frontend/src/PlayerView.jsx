import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

export default function PlayerView() {
  const [searchParams] = useSearchParams();
  const initialPin = searchParams.get('pin') || '';
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState('');
  const [joined, setJoined] = useState(false);
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, QUESTION_PREVIEW, QUESTION_ACTIVE, QUESTION_RESULT
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [choicesCount, setChoicesCount] = useState(4);

  useEffect(() => {
    socket.on('game-started', () => {
      setGameState('WAITING_QUESTION');
    });

    socket.on('question-preview', () => {
      setGameState('QUESTION_PREVIEW');
    });

    socket.on('new-question', (q) => {
      setGameState('QUESTION_ACTIVE');
      setSelectedIndex(null);
      setSubmitted(false);
      setChoicesCount(q.choices ? q.choices.length : 4);
    });

    socket.on('question-result', (data) => {
      setResultData(data);
      setGameState('QUESTION_RESULT');
    });

    socket.on('show-leaderboard', () => {
      setGameState('QUESTION_LEADERBOARD');
    });

    socket.on('game-over', (leaderboard) => {
      setGameState('GAME_OVER');
      const me = leaderboard.find(p => p.id === socket.id);
      if (me) setMyScore(me.score);
    });

    return () => {
      socket.off('game-started');
      socket.off('question-preview');
      socket.off('new-question');
      socket.off('question-result');
      socket.off('show-leaderboard');
      socket.off('game-over');
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (pin && nickname) {
      socket.emit('join-game', { pin, nickname }, (res) => {
        if (res.success) {
          setJoined(true);
        } else {
          alert(res.message);
        }
      });
    }
  };

  const selectChoice = (index) => {
    if (submitted) return;
    setSelectedIndex(index);
    setSubmitted(true);
    socket.emit('submit-answer', { pin, selectedIndex: index });
  };

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

  if (gameState === 'WAITING_QUESTION') {
    return (
      <div className="player-container" style={{ backgroundColor: 'var(--theme-yellow)', color: '#333' }}>
        <div className="status-message">Waiting for others...</div>
      </div>
    );
  }

  if (gameState === 'QUESTION_PREVIEW') {
    return (
      <div className="player-container" style={{ backgroundColor: '#d89e00', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="status-message" style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
          Get Ready!
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
          {Array.from({ length: choicesCount }).map((_, i) => (
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
    const score = resultData?.scores?.[socket.id] || 0;
    
    return (
      <div className="player-container" style={{ backgroundColor: 'var(--theme-yellow)', color: '#333' }}>
        <div className="status-message">
          Your Score
          <div style={{ fontSize: '3rem', marginTop: '20px' }}>{score}</div>
        </div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="player-container" style={{ backgroundColor: 'var(--kahoot-red)', color: 'white' }}>
        <div className="status-message">Game Over!<br/>Your Score: {myScore}</div>
      </div>
    );
  }

  return null;
}
