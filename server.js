const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Leaderboard & Stats Persistence ---
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadLeaderboard() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[Leaderboard] Load error:', err);
  }
  // Default mock records
  return [
    { name: '아르르', wins: 42, losses: 5, maxChain: 11, highScore: 184500, date: '2026-09-27' },
    { name: '사탄(마왕)', wins: 38, losses: 8, maxChain: 9, highScore: 142000, date: '2026-09-27' },
    { name: '카방클', wins: 29, losses: 12, maxChain: 8, highScore: 98600, date: '2026-09-27' },
    { name: '뿌요장인', wins: 21, losses: 9, maxChain: 7, highScore: 74200, date: '2026-09-27' },
    { name: '네온팝', wins: 15, losses: 6, maxChain: 6, highScore: 56300, date: '2026-09-27' }
  ];
}

function saveLeaderboard(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Leaderboard] Save error:', err);
  }
}

let leaderboard = loadLeaderboard();

app.get('/api/leaderboard', (req, res) => {
  // Sort primarily by Wins desc, then by MaxChain desc, then HighScore desc
  const sorted = [...leaderboard].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.maxChain !== a.maxChain) return b.maxChain - a.maxChain;
    return b.highScore - a.highScore;
  }).slice(0, 30);
  res.json({ success: true, leaderboard: sorted });
});

app.post('/api/score', (req, res) => {
  const { name, isWin, score = 0, maxChain = 0 } = req.body;
  const cleanName = (name && name.trim()) ? name.trim().slice(0, 10) : '플레이어';

  let entry = leaderboard.find(item => item.name.toLowerCase() === cleanName.toLowerCase());
  const today = new Date().toISOString().split('T')[0];

  if (entry) {
    if (isWin) entry.wins = (entry.wins || 0) + 1;
    else entry.losses = (entry.losses || 0) + 1;

    entry.maxChain = Math.max(entry.maxChain || 0, maxChain);
    entry.highScore = Math.max(entry.highScore || 0, score);
    entry.date = today;
  } else {
    entry = {
      name: cleanName,
      wins: isWin ? 1 : 0,
      losses: isWin ? 0 : 1,
      maxChain,
      highScore: score,
      date: today
    };
    leaderboard.push(entry);
  }

  saveLeaderboard(leaderboard);
  res.json({ success: true, entry });
});

// Room management
// Room structure:
// {
//   id: string,
//   players: [ { id: socket.id, name: string, ready: boolean, score: 0 } ],
//   seed: number,
//   status: 'waiting' | 'playing' | 'gameover'
// }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerIndex = -1;

  socket.on('create_room', (data, callback) => {
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerName = (data && data.name) ? data.name.trim().slice(0, 12) : '플레이어 1';
    const room = {
      id: roomCode,
      players: [{
        id: socket.id,
        name: playerName,
        ready: false,
        score: 0
      }],
      status: 'waiting',
      seed: Math.floor(Math.random() * 1000000)
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    currentRoom = roomCode;
    playerIndex = 0;

    if (callback) {
      callback({
        success: true,
        roomCode,
        playerIndex: 0,
        players: room.players
      });
    }
  });

  socket.on('join_room', (data, callback) => {
    const roomCode = (data && data.roomCode) ? data.roomCode.trim().toUpperCase() : '';
    const playerName = (data && data.name) ? data.name.trim().slice(0, 12) : '플레이어 2';

    const room = rooms.get(roomCode);
    if (!room) {
      if (callback) callback({ success: false, message: '존재하지 않는 방 코드입니다.' });
      return;
    }

    if (room.players.length >= 2) {
      if (callback) callback({ success: false, message: '방이 이미 가득 찼습니다. (최대 2명)' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      ready: false,
      score: 0
    });

    socket.join(roomCode);
    currentRoom = roomCode;
    playerIndex = 1;

    if (callback) {
      callback({
        success: true,
        roomCode,
        playerIndex: 1,
        players: room.players
      });
    }

    // Notify room of updated players
    io.to(roomCode).emit('room_updated', {
      players: room.players,
      status: room.status
    });
  });

  socket.on('toggle_ready', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = !player.ready;
      io.to(currentRoom).emit('room_updated', {
        players: room.players,
        status: room.status
      });

      // If both players ready, start match countdown
      if (room.players.length === 2 && room.players.every(p => p.ready)) {
        room.status = 'playing';
        room.seed = Math.floor(Math.random() * 1000000);
        io.to(currentRoom).emit('start_countdown', {
          seed: room.seed,
          players: room.players
        });
      }
    }
  });

  // Relay real-time board state to opponent
  socket.on('board_sync', (state) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('opponent_board_sync', state);
  });

  // Relay garbage puyo attack to opponent
  socket.on('send_garbage', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('receive_garbage', data);
  });

  // Relay fever mode events
  socket.on('fever_enter', () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('opponent_fever_enter');
  });

  socket.on('fever_exit', () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('opponent_fever_exit');
  });

  // Relay game over event
  socket.on('player_game_over', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.status = 'gameover';
    socket.to(currentRoom).emit('opponent_game_over', {
      loserId: socket.id,
      score: data.score
    });
  });

  // Rematch request
  socket.on('request_rematch', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = true;
      socket.to(currentRoom).emit('opponent_rematch_requested');

      if (room.players.every(p => p.ready)) {
        room.status = 'playing';
        room.seed = Math.floor(Math.random() * 1000000);
        io.to(currentRoom).emit('start_countdown', {
          seed: room.seed,
          players: room.players
        });
      }
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(currentRoom);
    } else {
      room.status = 'waiting';
      room.players[0].ready = false;
      io.to(currentRoom).emit('opponent_disconnected', {
        players: room.players
      });
    }
  });
});

const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`[PuyoPuyo] Server running on http://${HOST}:${PORT}`);
});
