const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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
