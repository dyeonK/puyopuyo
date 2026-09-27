/**
 * Puyo Puyo Main Coordinator
 * Manages game loop, UI events, mode switching, and input handling
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const screenMenu = document.getElementById('screenMenu');
  const screenGame = document.getElementById('screenGame');

  const btnLogoHome = document.getElementById('btnLogoHome');
  const btnSoundToggle = document.getElementById('btnSoundToggle');
  const soundIcon = document.getElementById('soundIcon');
  const btnBgmToggle = document.getElementById('btnBgmToggle');
  const bgmIcon = document.getElementById('bgmIcon');
  const btnHowToPlay = document.getElementById('btnHowToPlay');

  // Menu Cards
  const cardVsComputer = document.getElementById('cardVsComputer');
  const cardVsMultiplayer = document.getElementById('cardVsMultiplayer');
  const cardSoloPractice = document.getElementById('cardSoloPractice');

  // Modals
  const modalDifficulty = document.getElementById('modalDifficulty');
  const btnCloseDiff = document.getElementById('btnCloseDiff');
  const btnStartVsAi = document.getElementById('btnStartVsAi');
  const diffButtons = document.querySelectorAll('.diff-btn');

  const modalMultiplayer = document.getElementById('modalMultiplayer');
  const btnCloseMulti = document.getElementById('btnCloseMulti');
  const inputPlayerName = document.getElementById('inputPlayerName');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const inputRoomCode = document.getElementById('inputRoomCode');
  const btnJoinRoom = document.getElementById('btnJoinRoom');

  const multiplayerInitialForm = document.getElementById('multiplayerInitialForm');
  const multiplayerLobbyForm = document.getElementById('multiplayerLobbyForm');
  const modalRoomCodeText = document.getElementById('modalRoomCodeText');
  const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
  const lobbyP1Name = document.getElementById('lobbyP1Name');
  const lobbyP1Status = document.getElementById('lobbyP1Status');
  const lobbyP2Name = document.getElementById('lobbyP2Name');
  const lobbyP2Status = document.getElementById('lobbyP2Status');
  const btnToggleReady = document.getElementById('btnToggleReady');
  const btnLeaveRoom = document.getElementById('btnLeaveRoom');

  const modalGameOver = document.getElementById('modalGameOver');
  const resultTitle = document.getElementById('resultTitle');
  const resultSub = document.getElementById('resultSub');
  const resultScore = document.getElementById('resultScore');
  const resultMaxChain = document.getElementById('resultMaxChain');
  const btnRematch = document.getElementById('btnRematch');
  const btnReturnMenu = document.getElementById('btnReturnMenu');

  const modalHowToPlay = document.getElementById('modalHowToPlay');
  const btnCloseHelp = document.getElementById('btnCloseHelp');
  const btnCloseHelpBtn = document.getElementById('btnCloseHelpBtn');

  // Game UI
  const p1Canvas = document.getElementById('p1Canvas');
  const p1Ctx = p1Canvas.getContext('2d');
  const p2Canvas = document.getElementById('p2Canvas');
  const p2Ctx = p2Canvas.getContext('2d');
  const p1NextCanvas = document.getElementById('p1NextCanvas');
  const p1NextCtx = p1NextCanvas.getContext('2d');
  const p2NextCanvas = document.getElementById('p2NextCanvas');
  const p2NextCtx = p2NextCanvas.getContext('2d');

  const p1ScoreEl = document.getElementById('p1Score');
  const p2ScoreEl = document.getElementById('p2Score');
  const p1NameEl = document.getElementById('p1Name');
  const p2NameEl = document.getElementById('p2Name');
  const p1BadgeEl = document.getElementById('p1Badge');
  const p2BadgeEl = document.getElementById('p2Badge');
  const opponentPod = document.getElementById('opponentPod');
  const matchStatusText = document.getElementById('matchStatusText');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const displayCodeText = document.getElementById('displayCodeText');
  const p1GarbageTray = document.getElementById('p1GarbageTray');
  const p2GarbageTray = document.getElementById('p2GarbageTray');

  // Mobile Buttons
  const btnTouchLeft = document.getElementById('btnTouchLeft');
  const btnTouchRight = document.getElementById('btnTouchRight');
  const btnTouchDown = document.getElementById('btnTouchDown');
  const btnTouchHardDrop = document.getElementById('btnTouchHardDrop');
  const btnTouchRotCW = document.getElementById('btnTouchRotCW');
  const btnTouchRotCCW = document.getElementById('btnTouchRotCCW');

  // State Variables
  let gameMode = 'vs_computer'; // 'vs_computer' | 'multiplayer' | 'practice'
  let selectedDifficulty = 'normal';
  let isGameActive = false;
  let p1Board = null;
  let p2Board = null;
  let aiController = null;
  let countdownTimer = null;
  let lastFrameTime = performance.now();

  // --- Audio Event Listeners ---
  btnSoundToggle.addEventListener('click', () => {
    const muted = window.audioManager.toggleMute();
    soundIcon.textContent = muted ? '🔇' : '🔊';
  });

  btnBgmToggle.addEventListener('click', () => {
    window.audioManager.bgmEnabled = !window.audioManager.bgmEnabled;
    if (window.audioManager.bgmEnabled) {
      window.audioManager.startBGM();
      bgmIcon.textContent = '🎵';
    } else {
      window.audioManager.stopBGM();
      bgmIcon.textContent = '⏸️';
    }
  });

  btnHowToPlay.addEventListener('click', () => modalHowToPlay.classList.add('active'));
  btnCloseHelp.addEventListener('click', () => modalHowToPlay.classList.remove('active'));
  btnCloseHelpBtn.addEventListener('click', () => modalHowToPlay.classList.remove('active'));

  btnLogoHome.addEventListener('click', () => {
    if (confirm('메인 메뉴로 돌아가시겠습니까? 진행 중인 게임이 종료됩니다.')) {
      exitToMenu();
    }
  });

  // --- Menu Handlers ---
  cardVsComputer.addEventListener('click', () => {
    modalDifficulty.classList.add('active');
  });

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDifficulty = btn.dataset.diff;
    });
  });

  btnCloseDiff.addEventListener('click', () => modalDifficulty.classList.remove('active'));

  btnStartVsAi.addEventListener('click', () => {
    modalDifficulty.classList.remove('active');
    startVsAiMatch(selectedDifficulty);
  });

  cardVsMultiplayer.addEventListener('click', () => {
    modalMultiplayer.classList.add('active');
    multiplayerInitialForm.style.display = 'block';
    multiplayerLobbyForm.style.display = 'none';
  });

  btnCloseMulti.addEventListener('click', () => modalMultiplayer.classList.remove('active'));

  cardSoloPractice.addEventListener('click', () => {
    startSoloPractice();
  });

  // --- Multiplayer Modal Handlers ---
  btnCreateRoom.addEventListener('click', () => {
    const name = inputPlayerName.value.trim() || '플레이어 1';
    window.multiplayerManager.createRoom(name);
  });

  btnJoinRoom.addEventListener('click', () => {
    const code = inputRoomCode.value.trim().toUpperCase();
    const name = inputPlayerName.value.trim() || '플레이어 2';
    if (!code) {
      alert('방 코드를 입력해주세요.');
      return;
    }
    window.multiplayerManager.joinRoom(code, name);
  });

  btnCopyInviteLink.addEventListener('click', () => {
    const code = window.multiplayerManager.currentRoom;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      alert(`초대 링크가 복사되었습니다!\n방 코드: ${code}\n친구에게 전달하세요.`);
    }).catch(() => {
      prompt('아래 링크를 복사하세요:', url);
    });
  });

  btnToggleReady.addEventListener('click', () => {
    window.multiplayerManager.toggleReady();
  });

  btnLeaveRoom.addEventListener('click', () => {
    window.location.reload();
  });

  // Setup Multiplayer Callbacks
  window.multiplayerManager.callbacks.onRoomCreated = (data) => {
    showLobby(data.roomCode, data.players);
  };

  window.multiplayerManager.callbacks.onRoomJoined = (data) => {
    showLobby(data.roomCode, data.players);
  };

  window.multiplayerManager.callbacks.onRoomUpdated = (data) => {
    updateLobbyPlayers(data.players);
  };

  window.multiplayerManager.callbacks.onCountdownStart = (data) => {
    modalMultiplayer.classList.remove('active');
    startMultiplayerMatch(data.seed, data.players);
  };

  window.multiplayerManager.callbacks.onOpponentBoardSync = (state) => {
    if (p2Board && gameMode === 'multiplayer') {
      p2Board.importState(state);
      p2ScoreEl.textContent = state.score.toLocaleString();
      renderGarbageTray(p2GarbageTray, state.pendingGarbage);
    }
  };

  window.multiplayerManager.callbacks.onReceiveGarbage = (count) => {
    if (p1Board) {
      p1Board.receiveGarbage(count);
    }
  };

  window.multiplayerManager.callbacks.onOpponentGameOver = (data) => {
    if (isGameActive && gameMode === 'multiplayer') {
      isGameActive = false;
      window.audioManager?.playWin();
      showGameOverModal(true, p1Board.score, p1Board.maxChain, '상대방이 다운되었습니다!');
    }
  };

  window.multiplayerManager.callbacks.onOpponentDisconnected = () => {
    if (isGameActive) {
      alert('상대방과의 연결이 끊어졌습니다.');
      exitToMenu();
    }
  };

  window.multiplayerManager.callbacks.onError = (msg) => {
    alert(msg);
  };

  function showLobby(roomCode, players) {
    multiplayerInitialForm.style.display = 'none';
    multiplayerLobbyForm.style.display = 'block';
    modalRoomCodeText.textContent = roomCode;
    updateLobbyPlayers(players);
  }

  function updateLobbyPlayers(players) {
    if (!players || players.length === 0) return;
    const p1 = players[0];
    const p2 = players[1];

    if (p1) {
      lobbyP1Name.textContent = p1.name;
      lobbyP1Status.className = `badge-ready ${p1.ready ? 'ready' : 'waiting'}`;
      lobbyP1Status.textContent = p1.ready ? '준비 완료' : '대기 중';
    }

    if (p2) {
      lobbyP2Name.textContent = p2.name;
      lobbyP2Name.style.color = '#fff';
      lobbyP2Status.className = `badge-ready ${p2.ready ? 'ready' : 'waiting'}`;
      lobbyP2Status.textContent = p2.ready ? '준비 완료' : '대기 중';
    } else {
      lobbyP2Name.textContent = '(친구 기다리는 중...)';
      lobbyP2Name.style.color = 'var(--text-muted)';
      lobbyP2Status.className = 'badge-ready waiting';
      lobbyP2Status.textContent = '-';
    }

    const myIndex = window.multiplayerManager.playerIndex;
    const myPlayer = players[myIndex];
    if (myPlayer) {
      btnToggleReady.textContent = myPlayer.ready ? '준비 취소' : '준비 완료 (READY)';
      btnToggleReady.style.background = myPlayer.ready ? '#475569' : 'linear-gradient(135deg, #ff007f, #b026ff)';
    }
  }

  // --- Check Auto Join via URL Parameter ---
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    modalMultiplayer.classList.add('active');
    inputRoomCode.value = roomParam.toUpperCase();
  }

  // --- Game Flow Methods ---

  function startVsAiMatch(diff) {
    gameMode = 'vs_computer';
    opponentPod.style.display = 'flex';
    p1NameEl.textContent = '플레이어 1';
    p2NameEl.textContent = `컴퓨터 AI (${diff.toUpperCase()})`;
    p2BadgeEl.textContent = 'AI';
    roomCodeDisplay.style.display = 'none';

    switchToGameScreen();

    const commonSeed = Math.floor(Math.random() * 1000000);
    p1Board = new PuyoBoard({
      seed: commonSeed,
      onGarbageSend: (count) => {
        p2Board.receiveGarbage(count);
      },
      onGameOver: (stats) => {
        if (!isGameActive) return;
        isGameActive = false;
        showGameOverModal(false, stats.score, stats.maxChain, '컴퓨터 AI에게 패배했습니다.');
      }
    });

    p2Board = new PuyoBoard({
      seed: commonSeed,
      isOpponent: true,
      onGarbageSend: (count) => {
        p1Board.receiveGarbage(count);
      },
      onGameOver: (stats) => {
        if (!isGameActive) return;
        isGameActive = false;
        window.audioManager?.playWin();
        showGameOverModal(true, p1Board.score, p1Board.maxChain, '컴퓨터 AI를 격파했습니다!');
      }
    });

    aiController = new PuyoAI(p2Board, diff);

    startCountdown(() => {
      p1Board.spawnPiece();
      p2Board.spawnPiece();
    });
  }

  function startMultiplayerMatch(seed, players) {
    gameMode = 'multiplayer';
    opponentPod.style.display = 'flex';

    const myIdx = window.multiplayerManager.playerIndex;
    const oppIdx = myIdx === 0 ? 1 : 0;

    p1NameEl.textContent = players[myIdx]?.name || '나';
    p2NameEl.textContent = players[oppIdx]?.name || '상대방';
    p2BadgeEl.textContent = '2P';

    roomCodeDisplay.style.display = 'block';
    displayCodeText.textContent = window.multiplayerManager.currentRoom;

    switchToGameScreen();

    p1Board = new PuyoBoard({
      seed,
      onStateChange: (state) => {
        window.multiplayerManager.sendBoardSync(state);
      },
      onGarbageSend: (count) => {
        window.multiplayerManager.sendGarbage(count);
      },
      onGameOver: (stats) => {
        if (!isGameActive) return;
        isGameActive = false;
        window.multiplayerManager.sendGameOver(stats.score);
        showGameOverModal(false, stats.score, stats.maxChain, '상대방에게 패배했습니다.');
      }
    });

    p2Board = new PuyoBoard({
      seed,
      isOpponent: true
    });

    startCountdown(() => {
      p1Board.spawnPiece();
    });
  }

  function startSoloPractice() {
    gameMode = 'practice';
    opponentPod.style.display = 'none';
    p1NameEl.textContent = '연습 플레이어';
    roomCodeDisplay.style.display = 'none';

    switchToGameScreen();

    p1Board = new PuyoBoard({
      seed: Math.floor(Math.random() * 1000000),
      onGameOver: (stats) => {
        if (!isGameActive) return;
        isGameActive = false;
        showGameOverModal(false, stats.score, stats.maxChain, '연습 게임 종료');
      }
    });

    p2Board = null;
    aiController = null;

    startCountdown(() => {
      p1Board.spawnPiece();
    });
  }

  function switchToGameScreen() {
    screenMenu.classList.remove('active');
    screenGame.classList.add('active');
    modalGameOver.classList.remove('active');
    window.audioManager?.startBGM();
  }

  function exitToMenu() {
    isGameActive = false;
    if (countdownTimer) clearInterval(countdownTimer);
    screenGame.classList.remove('active');
    screenMenu.classList.add('active');
    modalGameOver.classList.remove('active');
    modalMultiplayer.classList.remove('active');
    modalDifficulty.classList.remove('active');
    p1Board = null;
    p2Board = null;
    aiController = null;
  }

  function startCountdown(onComplete) {
    let count = 3;
    isGameActive = false;
    matchStatusText.textContent = count;
    window.audioManager?.playRotate();

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        matchStatusText.textContent = count;
        window.audioManager?.playRotate();
      } else if (count === 0) {
        matchStatusText.textContent = 'START!';
        window.audioManager?.playPop(1);
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        matchStatusText.textContent = 'BATTLE';
        isGameActive = true;
        if (onComplete) onComplete();
      }
    }, 900);
  }

  function showGameOverModal(isWin, score, maxChain, subtext) {
    resultTitle.textContent = isWin ? 'VICTORY!' : 'GAME OVER';
    resultTitle.style.color = isWin ? 'var(--neon-green)' : '#ff0055';
    resultSub.textContent = subtext;
    resultScore.textContent = score.toLocaleString();
    resultMaxChain.textContent = `${maxChain} Chain`;
    modalGameOver.classList.add('active');
  }

  btnRematch.addEventListener('click', () => {
    modalGameOver.classList.remove('active');
    if (gameMode === 'vs_computer') {
      startVsAiMatch(selectedDifficulty);
    } else if (gameMode === 'multiplayer') {
      window.multiplayerManager.requestRematch();
      matchStatusText.textContent = '재대결 요청 중...';
    } else {
      startSoloPractice();
    }
  });

  btnReturnMenu.addEventListener('click', () => {
    exitToMenu();
  });

  // --- Garbage Tray Indicator Rendering ---
  function renderGarbageTray(container, amount) {
    container.innerHTML = '';
    if (amount <= 0) return;

    // Rock units: Crown (720), Moon (360), Star (180), Iron (30), Big Rock (6), Small Rock (1)
    const icons = [
      { count: 720, char: '👑' },
      { count: 360, char: '🌙' },
      { count: 180, char: '⭐' },
      { count: 30,  char: '🪙' },
      { count: 6,   char: '🪨' },
      { count: 1,   char: '⚪' }
    ];

    let rem = amount;
    icons.forEach(unit => {
      const num = Math.floor(rem / unit.count);
      for (let i = 0; i < num; i++) {
        const span = document.createElement('span');
        span.className = 'garbage-unit';
        span.textContent = unit.char;
        container.appendChild(span);
      }
      rem %= unit.count;
    });
  }

  // --- Next Puyo Canvas Preview Rendering ---
  function renderNextPreview(ctx, board) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!board || !board.nextQueue || board.nextQueue.length === 0) return;

    const nextPair = board.nextQueue[0];
    const next2Pair = board.nextQueue[1];

    const r = 16;
    const cx = ctx.canvas.width / 2;

    // Next 1
    if (nextPair) {
      window.puyoRenderer.drawPuyo(ctx, cx, 20, r, nextPair.child);
      window.puyoRenderer.drawPuyo(ctx, cx, 52, r, nextPair.axis);
    }

    // Small divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(8, 72);
    ctx.lineTo(ctx.canvas.width - 8, 72);
    ctx.stroke();

    // Next 2 (smaller)
    if (next2Pair) {
      window.puyoRenderer.drawPuyo(ctx, cx - 8, 82, 7, next2Pair.child);
      window.puyoRenderer.drawPuyo(ctx, cx + 8, 82, 7, next2Pair.axis);
    }
  }

  // --- Keyboard Input Handling ---
  window.addEventListener('keydown', (e) => {
    if (!isGameActive || !p1Board) return;

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        p1Board.moveLeft();
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'KeyD':
        p1Board.moveRight();
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
        p1Board.softDrop = true;
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'KeyX':
        p1Board.rotateClockwise();
        e.preventDefault();
        break;
      case 'KeyZ':
        p1Board.rotateCounterClockwise();
        e.preventDefault();
        break;
      case 'Space':
        p1Board.hardDrop();
        e.preventDefault();
        break;
      case 'Escape':
        // Quick exit
        btnLogoHome.click();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!p1Board) return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      p1Board.softDrop = false;
    }
  });

  // --- Mobile Touch Buttons Handling ---
  const bindTouch = (elem, action, onEnd) => {
    if (!elem) return;
    elem.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (isGameActive && p1Board) action();
    });
    if (onEnd) {
      elem.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (p1Board) onEnd();
      });
      elem.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        if (p1Board) onEnd();
      });
    }
  };

  bindTouch(btnTouchLeft, () => p1Board.moveLeft());
  bindTouch(btnTouchRight, () => p1Board.moveRight());
  bindTouch(btnTouchDown, () => { p1Board.softDrop = true; }, () => { p1Board.softDrop = false; });
  bindTouch(btnTouchHardDrop, () => p1Board.hardDrop());
  bindTouch(btnTouchRotCW, () => p1Board.rotateClockwise());
  bindTouch(btnTouchRotCCW, () => p1Board.rotateCounterClockwise());

  // --- Main Animation & Game Loop ---
  function gameLoop(currentTime) {
    const delta = Math.min(100, currentTime - lastFrameTime);
    lastFrameTime = currentTime;

    // 1. Update Eye Blink Engine
    window.puyoRenderer.update(delta);

    // 2. Update Player 1 Board
    if (p1Board) {
      if (isGameActive) {
        p1Board.update(delta);
      }
      p1Ctx.clearRect(0, 0, p1Canvas.width, p1Canvas.height);
      p1Board.render(p1Ctx);
      p1ScoreEl.textContent = p1Board.score.toLocaleString();
      renderGarbageTray(p1GarbageTray, p1Board.pendingGarbage);
      renderNextPreview(p1NextCtx, p1Board);
    }

    // 3. Update Opponent (AI or Multiplayer)
    if (p2Board && gameMode !== 'practice') {
      if (isGameActive && gameMode === 'vs_computer' && aiController) {
        p2Board.update(delta);
        aiController.update(delta);
      } else if (gameMode === 'multiplayer') {
        p2Board.update(delta);
      }

      p2Ctx.clearRect(0, 0, p2Canvas.width, p2Canvas.height);
      p2Board.render(p2Ctx);
      p2ScoreEl.textContent = p2Board.score.toLocaleString();
      renderGarbageTray(p2GarbageTray, p2Board.pendingGarbage);
      renderNextPreview(p2NextCtx, p2Board);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
