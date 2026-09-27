/**
 * Puyo Puyo Multiplayer Network Manager (Socket.io)
 */

class MultiplayerManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentRoom = null;
    this.playerIndex = -1; // 0 = Player 1 (Host), 1 = Player 2 (Guest)
    this.players = [];
    this.callbacks = {
      onRoomCreated: null,
      onRoomJoined: null,
      onRoomUpdated: null,
      onCountdownStart: null,
      onOpponentBoardSync: null,
      onReceiveGarbage: null,
      onOpponentGameOver: null,
      onOpponentDisconnected: null,
      onError: null
    };

    this.initSocket();
  }

  initSocket() {
    if (typeof io !== 'undefined') {
      this.socket = io();

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('[Multiplayer] Connected to server:', this.socket.id);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('[Multiplayer] Disconnected from server');
      });

      this.socket.on('room_updated', (data) => {
        this.players = data.players;
        if (this.callbacks.onRoomUpdated) {
          this.callbacks.onRoomUpdated(data);
        }
      });

      this.socket.on('start_countdown', (data) => {
        if (this.callbacks.onCountdownStart) {
          this.callbacks.onCountdownStart(data);
        }
      });

      this.socket.on('opponent_board_sync', (state) => {
        if (this.callbacks.onOpponentBoardSync) {
          this.callbacks.onOpponentBoardSync(state);
        }
      });

      this.socket.on('receive_garbage', (data) => {
        if (this.callbacks.onReceiveGarbage) {
          this.callbacks.onReceiveGarbage(data.count);
        }
      });

      this.socket.on('opponent_game_over', (data) => {
        if (this.callbacks.onOpponentGameOver) {
          this.callbacks.onOpponentGameOver(data);
        }
      });

      this.socket.on('opponent_disconnected', (data) => {
        if (this.callbacks.onOpponentDisconnected) {
          this.callbacks.onOpponentDisconnected(data);
        }
      });
    } else {
      console.warn('[Multiplayer] Socket.io library not detected.');
    }
  }

  createRoom(playerName) {
    if (!this.socket) return;
    this.socket.emit('create_room', { name: playerName }, (res) => {
      if (res && res.success) {
        this.currentRoom = res.roomCode;
        this.playerIndex = res.playerIndex;
        this.players = res.players;
        if (this.callbacks.onRoomCreated) {
          this.callbacks.onRoomCreated(res);
        }
      } else {
        if (this.callbacks.onError) this.callbacks.onError(res.message || '방 생성 실패');
      }
    });
  }

  joinRoom(roomCode, playerName) {
    if (!this.socket) return;
    this.socket.emit('join_room', { roomCode, name: playerName }, (res) => {
      if (res && res.success) {
        this.currentRoom = res.roomCode;
        this.playerIndex = res.playerIndex;
        this.players = res.players;
        if (this.callbacks.onRoomJoined) {
          this.callbacks.onRoomJoined(res);
        }
      } else {
        if (this.callbacks.onError) this.callbacks.onError(res ? res.message : '방 참가 실패');
      }
    });
  }

  toggleReady() {
    if (!this.socket || !this.currentRoom) return;
    this.socket.emit('toggle_ready');
  }

  sendBoardSync(state) {
    if (!this.socket || !this.currentRoom) return;
    this.socket.emit('board_sync', state);
  }

  sendGarbage(count) {
    if (!this.socket || !this.currentRoom || count <= 0) return;
    this.socket.emit('send_garbage', { count });
  }

  sendGameOver(score) {
    if (!this.socket || !this.currentRoom) return;
    this.socket.emit('player_game_over', { score });
  }

  requestRematch() {
    if (!this.socket || !this.currentRoom) return;
    this.socket.emit('request_rematch');
  }
}

window.multiplayerManager = new MultiplayerManager();
