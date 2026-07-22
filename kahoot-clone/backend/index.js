const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // 100 MB for large image uploads
});

// In-memory data store for Phase 1
const games = {};

// Helper to generate a 6-digit PIN
function generatePIN() {
    let pin = Math.floor(100000 + Math.random() * 900000).toString();
    while (games[pin]) {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    }
    return pin;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // HOST EVENTS
    socket.on('create-game', (questions, callback) => {
        const pin = generatePIN();
        games[pin] = {
            pin,
            hostId: socket.id,
            status: 'LOBBY',
            players: {},
            questions: questions || [],
            currentQuestionIndex: 0,
            answers: {},
            questionStartTime: 0
        };
        socket.join(pin);
        console.log(`Game created: ${pin} by Host: ${socket.id}`);
        callback({ success: true, pin });
    });

    function triggerShowResult(pin) {
        const game = games[pin];
        if (game && game.status === 'QUESTION_ACTIVE') {
            game.status = 'QUESTION_RESULT';
            if (game.timer) {
                clearTimeout(game.timer);
                game.timer = null;
            }
            const currentQ = game.questions[game.currentQuestionIndex];
            
            // Calculate previous ranks
            const previousSorted = Object.values(game.players).sort((a,b) => b.score - a.score);
            const previousRanks = {};
            previousSorted.forEach((p, idx) => {
                previousRanks[p.id] = idx;
            });
            
            for (const [playerId, answerData] of Object.entries(game.answers)) {
                const { choice, time } = answerData;
                const isCorrect = currentQ.correctAnswers.includes(choice);
                if (isCorrect) {
                    // Calculate time taken in ms
                    const timeTakenMs = time - game.questionStartTime;
                    const maxTimeMs = currentQ.timeLimit * 1000;
                    
                    // Kahoot-style points formula based on speed
                    let points = Math.round((1 - (timeTakenMs / maxTimeMs) / 2) * 1000);
                    if (points < 0) points = 0;
                    if (points > 1000) points = 1000;
                    
                    const multiplier = currentQ.scoreMultiplier !== undefined ? currentQ.scoreMultiplier : 1;
                    points = points * multiplier;
                    
                    game.players[playerId].score += points;
                }
            }
            
            const scoresMap = {};
            for(const pId in game.players) {
                scoresMap[pId] = game.players[pId].score;
            }

            const currentSorted = Object.values(game.players).sort((a,b) => b.score - a.score);
            const top5 = currentSorted.slice(0, 5).map((p, idx) => {
                let rankChange = 'same';
                if (previousRanks[p.id] > idx) rankChange = 'up';
                else if (previousRanks[p.id] < idx) rankChange = 'down';
                return { ...p, rankChange };
            });

            io.to(pin).emit('question-result', {
                correctAnswers: currentQ.correctAnswers,
                leaderboard: top5,
                answersStats: getAnswerStats(game),
                scores: scoresMap
            });
        }
    }

    function startQuestion(pin) {
        const game = games[pin];
        game.status = 'QUESTION_ACTIVE';
        game.answers = {};
        game.questionStartTime = Date.now();
        const currentQ = game.questions[game.currentQuestionIndex];
        
        io.to(pin).emit('new-question', {
            index: game.currentQuestionIndex,
            text: currentQ.text,
            image: currentQ.image,
            isFullScreenImage: currentQ.isFullScreenImage,
            choices: currentQ.choices,
            timeLimit: currentQ.timeLimit
        });

        if (game.timer) clearTimeout(game.timer);
        game.timer = setTimeout(() => {
            triggerShowResult(pin);
        }, currentQ.timeLimit * 1000);
    }

    socket.on('start-game', (pin) => {
        const game = games[pin];
        if (game && game.hostId === socket.id) {
            game.currentQuestionIndex = 0;
            io.to(pin).emit('game-started');
            startQuestion(pin);
        }
    });

    socket.on('next-question', (pin) => {
        const game = games[pin];
        if (game && game.hostId === socket.id) {
            game.currentQuestionIndex++;
            if (game.currentQuestionIndex < game.questions.length) {
                startQuestion(pin);
            } else {
                game.status = 'LEADERBOARD';
                io.to(pin).emit('game-over', Object.values(game.players).sort((a,b) => b.score - a.score));
            }
        }
    });

    socket.on('show-result', (pin) => {
        const game = games[pin];
        if (game && game.hostId === socket.id && game.status === 'QUESTION_ACTIVE') {
            triggerShowResult(pin);
        }
    });

    socket.on('show-leaderboard', (pin) => {
        const game = games[pin];
        if (game && game.hostId === socket.id && game.status === 'QUESTION_RESULT') {
            game.status = 'QUESTION_LEADERBOARD';
            io.to(pin).emit('show-leaderboard');
        }
    });

    // PLAYER EVENTS
    socket.on('join-game', (data, callback) => {
        const { pin, nickname } = data;
        const game = games[pin];

        if (!game) {
            return callback({ success: false, message: 'Game not found' });
        }
        if (game.status !== 'LOBBY') {
            return callback({ success: false, message: 'Game already started' });
        }
        
        const nameExists = Object.values(game.players).some(p => p.nickname === nickname);
        if(nameExists) {
             return callback({ success: false, message: 'Nickname taken' });
        }

        socket.join(pin);
        game.players[socket.id] = {
            id: socket.id,
            nickname,
            score: 0
        };

        io.to(game.hostId).emit('player-joined', game.players[socket.id]);
        callback({ success: true, pin, player: game.players[socket.id] });
    });

    socket.on('submit-answer', (data) => {
        const { pin, selectedIndex } = data; // single index now
        const game = games[pin];
        if (game && game.status === 'QUESTION_ACTIVE' && game.players[socket.id]) {
            // Record answer and timestamp
            game.answers[socket.id] = { choice: selectedIndex, time: Date.now() };
            io.to(game.hostId).emit('player-answered', { count: Object.keys(game.answers).length });
            
            // Auto-trigger result if everyone has answered
            const totalPlayers = Object.keys(game.players).length;
            if (Object.keys(game.answers).length >= totalPlayers) {
                triggerShowResult(pin);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const pin in games) {
            const game = games[pin];
            if (game.players[socket.id]) {
                delete game.players[socket.id];
                io.to(game.hostId).emit('player-left', socket.id);
            }
            if (game.hostId === socket.id) {
                io.to(pin).emit('host-disconnected');
                delete games[pin];
            }
        }
    });
});

function getAnswerStats(game) {
    const stats = {};
    const currentQ = game.questions[game.currentQuestionIndex];
    if (currentQ && currentQ.choices) {
        currentQ.choices.forEach((_, i) => stats[i] = 0);
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Kahoot Clone Backend running on port ${PORT}`);
});
