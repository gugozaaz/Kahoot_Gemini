import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';

// Change this based on deployment later
const socket = io('http://localhost:3001');

export default function HostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState('INIT'); // INIT, LOBBY, QUESTION_PREVIEW, QUESTION_ACTIVE, QUESTION_RESULT, LEADERBOARD
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answersCount, setAnswersCount] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(0);

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

  useEffect(() => {
    if (gameState === 'INIT') {
      createGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    socket.on('player-joined', (player) => {
      setPlayers(prev => [...prev, player]);
    });

    socket.on('game-started', () => {
      setGameState('QUESTION_ACTIVE');
    });

    socket.on('question-preview', (q) => {
      setCurrentQuestion(q);
      setGameState('QUESTION_PREVIEW');
      setPreviewTimeLeft(5);
    });

    socket.on('new-question', (q) => {
      setCurrentQuestion(q);
      setGameState('QUESTION_ACTIVE');
      setAnswersCount(0);
      setTimeLeft(q.timeLimit);
    });

    socket.on('player-answered', (data) => {
      setAnswersCount(data.count);
    });

    socket.on('question-result', (data) => {
      setGameState('QUESTION_RESULT');
      setResultData(data);
    });

    socket.on('game-over', (finalLeaderboard) => {
      setGameState('LEADERBOARD');
      setLeaderboard(finalLeaderboard);
    });

    return () => {
      socket.off('player-joined');
      socket.off('game-started');
      socket.off('question-preview');
      socket.off('new-question');
      socket.off('player-answered');
      socket.off('question-result');
      socket.off('game-over');
    };
  }, []);

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

    socket.emit('create-game', questions, (res) => {
      if (res.success) {
        setPin(res.pin);
        setGameState('LOBBY');
      }
    });
  };

  const startGame = () => {
    socket.emit('start-game', pin);
  };

  const showResult = () => {
    socket.emit('show-result', pin);
  };

  const nextQuestion = () => {
    socket.emit('next-question', pin);
  };

  if (gameState === 'INIT') {
    return (
      <div className="host-container">
        <h1 style={{ fontSize: '4rem', marginBottom: '20px', color: '#fff', textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}>Kamooy!</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (gameState === 'LOBBY') {
    return (
      <div className="host-container">
        <div className="lobby-header">
          <h2>Join at {window.location.origin}</h2>
          <div className="pin-display" style={{ marginBottom: '20px' }}>PIN: {pin}</div>
          <div style={{ background: 'white', padding: '10px', display: 'inline-block', borderRadius: '8px' }}>
            <QRCodeSVG value={`${window.location.origin}/play?pin=${pin}`} size={200} />
          </div>
          <p style={{ marginTop: '10px' }}>Scan to join</p>
        </div>
        <div style={{ marginBottom: '20px', fontSize: '1.5rem' }}>Players: {players.length}</div>
        <div className="players-grid">
          {players.map((p, i) => (
            <div key={i} className="player-badge">{p.nickname}</div>
          ))}
        </div>
        {players.length > 0 && (
          <button className="btn-primary" onClick={startGame}>Start Game</button>
        )}
      </div>
    );
  }

  if (gameState === 'QUESTION_PREVIEW') {
    return (
      <div className="host-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', overflow: 'hidden', backgroundColor: '#d89e00' }}>
        <div style={{ position: 'relative', top: '-10vh', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', fontWeight: 'bold', color: '#333', marginBottom: '40px' }}>
            {currentQuestion?.text}
          </div>
          <div style={{ fontSize: '6rem', fontWeight: 'bold', color: '#333', minHeight: '150px' }}>
            {previewTimeLeft <= 3 && previewTimeLeft > 0 ? previewTimeLeft : ''}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_ACTIVE') {
    return (
      <div className="host-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', overflow: 'hidden' }}>
        {currentQuestion?.image && currentQuestion?.isFullScreenImage && (
          <img src={currentQuestion.image} alt="Background" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 0, opacity: 0.8 }} />
        )}
        
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
             <span style={{ background: 'white', color: '#333', padding: '10px 20px', borderRadius: '50%', fontWeight: 'bold', fontSize: '2rem', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>{timeLeft}</span>
             <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333', background: 'white', padding: '10px 20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>Answers: {answersCount} / {players.length}</span>
          </div>

          <div style={{ textAlign: 'center', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', fontSize: '2.5rem', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
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
            {currentQuestion?.choices.map((choice, i) => {
              const colors = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#2eb8a6', '#8e44ad'];
              return (
                <div key={i} style={{ backgroundColor: colors[i % colors.length], color: 'white', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', fontWeight: 'bold', fontSize: '1.8rem', minHeight: '80px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  <div style={{ flex: 1 }}>{choice}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION_RESULT') {
    const totalVotes = Object.values(resultData?.answersStats || {}).reduce((a, b) => a + b, 0);
    
    return (
      <div className="host-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', overflow: 'hidden' }}>
        {currentQuestion?.image && currentQuestion?.isFullScreenImage && (
          <img src={currentQuestion.image} alt="Background" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 0, opacity: 0.2 }} />
        )}

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button className="btn-primary" onClick={() => {
              socket.emit('show-leaderboard', pin);
              setGameState('QUESTION_LEADERBOARD');
            }}>Next</button>
          </div>

          <div style={{ textAlign: 'center', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', fontSize: '2.5rem', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
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
                   <span style={{ fontWeight: 'bold', fontSize: '2rem', marginBottom: '10px', color: '#333' }}>{votes}</span>
                   <div className={`c-${i}`} style={{ width: '100%', height: `${height}%`, opacity: isCorrect ? 1 : 0.4, transition: 'height 1s ease-out', borderRadius: '8px 8px 0 0', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}></div>
                 </div>
               )
            })}
          </div>

          {/* Answers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {currentQuestion?.choices.map((choice, i) => {
              const colors = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#2eb8a6', '#8e44ad'];
              const isCorrect = resultData?.correctAnswers.includes(i);
              return (
                <div key={i} style={{ backgroundColor: colors[i % colors.length], color: 'white', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', fontWeight: 'bold', fontSize: '1.8rem', minHeight: '80px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', opacity: isCorrect ? 1 : 0.4 }}>
                  <div style={{ flex: 1 }}>{choice}</div>
                  {isCorrect && <span style={{ fontSize: '2.5rem' }}>✔</span>}
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
      <div className="host-container">
        <div className="leaderboard">
          <h2>Top 5 Players</h2>
          {resultData?.leaderboard.map((p, i) => (
            <div key={i} className="lb-row rank-anim" style={{ animationDelay: `${i * 0.1}s` }}>
              <span>{i + 1}. {p.nickname}</span>
              <span style={{flex: 1}}></span>
              <span>{p.score} pts</span>
              <span className={`rank-indicator ${p.rankChange || 'same'}`}>
                {p.rankChange === 'up' ? '▲' : p.rankChange === 'down' ? '▼' : '-'}
              </span>
            </div>
          ))}
          <button className="btn-primary" onClick={nextQuestion} style={{ width: '100%', marginTop: '20px' }}>Next Question</button>
        </div>
      </div>
    );
  }

  if (gameState === 'LEADERBOARD') {
    return (
      <div className="host-container">
        <div className="leaderboard">
          <h2>Final Leaderboard</h2>
          {leaderboard.map((p, i) => (
            <div key={i} className="lb-row">
              <span>{i + 1}. {p.nickname}</span>
              <span>{p.score} pts</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
