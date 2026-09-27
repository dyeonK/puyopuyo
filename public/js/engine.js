/**
 * Puyo Puyo Core Game Engine
 */

class PuyoBoard {
  constructor(options = {}) {
    this.cols = 6;
    this.rows = 13; // row 0 is hidden top row, rows 1..12 are visible
    this.visibleRows = 12;
    this.cellSize = options.cellSize || 36;
    this.isOpponent = options.isOpponent || false;
    this.onStateChange = options.onStateChange || null;
    this.onGarbageSend = options.onGarbageSend || null;
    this.onGameOver = options.onGameOver || null;

    // Grid: grid[row][col], 0 = empty, 1..5 = colors, 6 = garbage
    this.grid = this.createEmptyGrid();

    // Active falling pair
    this.activePiece = null;
    this.nextQueue = [];
    this.randomSeed = options.seed || Math.floor(Math.random() * 1000000);

    // Game state
    this.state = 'IDLE'; // IDLE, FALLING, DROPPING, POPPING, SETTLING, GARBAGE_DROP, GAME_OVER
    this.score = 0;
    this.currentChain = 0;
    this.maxChain = 0;
    this.pendingGarbage = 0; // Garbage waiting to drop on this board
    this.queuedGarbage = 0;  // Garbage sent but not yet committed
    this.allClear = false;

    // Fever Mode variables
    this.feverGauge = 0; // 0 to 7
    this.isFeverMode = false;
    this.feverTimeLeft = 0; // ms
    this.savedNormalGrid = null;
    this.savedNormalPendingGarbage = 0;
    this.feverLevel = 4;
    this.onFeverStateChange = options.onFeverStateChange || null;

    // Gravity and timing
    this.dropInterval = 750; // ms per row
    this.lastDropTime = 0;
    this.softDrop = false;
    this.lockTimer = 0;
    this.lockDelay = 400; // ms grace before locking

    // Animations & VFX
    this.animTimer = 0;
    this.poppingPuyos = []; // list of { r, c, color, progress }
    this.fallingAnimPuyos = [];
    this.particles = [];
    this.floatingTexts = [];
    this.screenShake = 0;

    // Landing bounce states for cells: gridSquish[r][c] = { scaleX, scaleY }
    this.gridSquish = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ scaleX: 1, scaleY: 1 }))
    );

    this.initNextQueue();
  }

  createEmptyGrid() {
    return Array.from({ length: this.rows }, () => new Array(this.cols).fill(PUYO_COLORS.EMPTY));
  }

  // Seeded Pseudo-Random Number Generator (PRNG)
  random() {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }

  randomColor() {
    // 4 standard colors (Red, Green, Blue, Yellow) for optimal chain dynamics
    const colors = [PUYO_COLORS.RED, PUYO_COLORS.GREEN, PUYO_COLORS.BLUE, PUYO_COLORS.YELLOW];
    return colors[Math.floor(this.random() * colors.length)];
  }

  initNextQueue() {
    this.nextQueue = [];
    for (let i = 0; i < 4; i++) {
      this.nextQueue.push({
        axis: this.randomColor(),
        child: this.randomColor()
      });
    }
  }

  getNextPair() {
    const pair = this.nextQueue.shift();
    this.nextQueue.push({
      axis: this.randomColor(),
      child: this.randomColor()
    });
    return pair;
  }

  spawnPiece() {
    // Game over check: spawn position column 2, row 1 (13th row is row 0, row 1 is top visible)
    if (this.grid[1][2] !== PUYO_COLORS.EMPTY) {
      this.triggerGameOver();
      return;
    }

    const pair = this.getNextPair();
    // Rotation state: 0=child above axis, 1=child right, 2=child below, 3=child left
    this.activePiece = {
      x: 2,
      y: 1, // axis row
      rot: 0,
      axisColor: pair.axis,
      childColor: pair.child,
      scaleX: 1,
      scaleY: 1
    };

    this.state = 'FALLING';
    this.lockTimer = 0;
    this.notifyState();
  }

  getChildPos(piece = this.activePiece) {
    if (!piece) return { x: 0, y: 0 };
    let cx = piece.x;
    let cy = piece.y;
    switch (piece.rot) {
      case 0: cy -= 1; break; // Above
      case 1: cx += 1; break; // Right
      case 2: cy += 1; break; // Below
      case 3: cx -= 1; break; // Left
    }
    return { x: cx, y: cy };
  }

  isValidPosition(x, y) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
    return this.grid[y][x] === PUYO_COLORS.EMPTY;
  }

  canPieceFit(piece) {
    if (!this.isValidPosition(piece.x, piece.y)) return false;
    const child = this.getChildPos(piece);
    if (!this.isValidPosition(child.x, child.y)) return false;
    return true;
  }

  // Piece Controls
  moveLeft() {
    if (this.state !== 'FALLING' || !this.activePiece) return false;
    const testPiece = { ...this.activePiece, x: this.activePiece.x - 1 };
    if (this.canPieceFit(testPiece)) {
      this.activePiece.x -= 1;
      this.lockTimer = 0;
      window.audioManager?.playMove();
      this.notifyState();
      return true;
    }
    return false;
  }

  moveRight() {
    if (this.state !== 'FALLING' || !this.activePiece) return false;
    const testPiece = { ...this.activePiece, x: this.activePiece.x + 1 };
    if (this.canPieceFit(testPiece)) {
      this.activePiece.x += 1;
      this.lockTimer = 0;
      window.audioManager?.playMove();
      this.notifyState();
      return true;
    }
    return false;
  }

  rotateClockwise() {
    if (this.state !== 'FALLING' || !this.activePiece) return false;
    const nextRot = (this.activePiece.rot + 1) % 4;
    return this.tryRotate(nextRot);
  }

  rotateCounterClockwise() {
    if (this.state !== 'FALLING' || !this.activePiece) return false;
    const nextRot = (this.activePiece.rot + 3) % 4;
    return this.tryRotate(nextRot);
  }

  tryRotate(targetRot) {
    const testPiece = { ...this.activePiece, rot: targetRot };

    // Standard fit test
    if (this.canPieceFit(testPiece)) {
      this.activePiece.rot = targetRot;
      this.lockTimer = 0;
      window.audioManager?.playRotate();
      this.notifyState();
      return true;
    }

    // Wall Kick: push left if colliding on right wall
    testPiece.x -= 1;
    if (this.canPieceFit(testPiece)) {
      this.activePiece.x -= 1;
      this.activePiece.rot = targetRot;
      this.lockTimer = 0;
      window.audioManager?.playRotate();
      this.notifyState();
      return true;
    }

    // Wall Kick: push right if colliding on left wall
    testPiece.x = this.activePiece.x + 1;
    if (this.canPieceFit(testPiece)) {
      this.activePiece.x += 1;
      this.activePiece.rot = targetRot;
      this.lockTimer = 0;
      window.audioManager?.playRotate();
      this.notifyState();
      return true;
    }

    // Floor Kick / Up Kick
    testPiece.x = this.activePiece.x;
    testPiece.y -= 1;
    if (this.canPieceFit(testPiece)) {
      this.activePiece.y -= 1;
      this.activePiece.rot = targetRot;
      this.lockTimer = 0;
      window.audioManager?.playRotate();
      this.notifyState();
      return true;
    }

    // 180 Double Kick if trapped
    const doubleRot = (targetRot + 2) % 4;
    testPiece.rot = doubleRot;
    testPiece.y = this.activePiece.y;
    if (this.canPieceFit(testPiece)) {
      this.activePiece.rot = doubleRot;
      this.lockTimer = 0;
      window.audioManager?.playRotate();
      this.notifyState();
      return true;
    }

    return false;
  }

  dropRow() {
    if (this.state !== 'FALLING' || !this.activePiece) return false;
    const testPiece = { ...this.activePiece, y: this.activePiece.y + 1 };
    if (this.canPieceFit(testPiece)) {
      this.activePiece.y += 1;
      this.notifyState();
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.state !== 'FALLING' || !this.activePiece) return;
    while (this.dropRow()) {
      // drop as far as possible
    }
    window.audioManager?.playHardDrop();
    this.lockPiece();
  }

  lockPiece() {
    if (!this.activePiece) return;

    const child = this.getChildPos(this.activePiece);
    const ax = this.activePiece.x;
    const ay = this.activePiece.y;
    const cx = child.x;
    const cy = child.y;

    this.grid[ay][ax] = this.activePiece.axisColor;
    this.grid[cy][cx] = this.activePiece.childColor;
    this.activePiece = null;

    window.audioManager?.playLand();

    // Trigger squish animation
    this.gridSquish[ay][ax] = { scaleX: 1.25, scaleY: 0.8 };
    this.gridSquish[cy][cx] = { scaleX: 1.25, scaleY: 0.8 };

    // Settle pieces with individual gravity
    this.currentChain = 0;
    this.startSettling();
  }

  startSettling() {
    this.state = 'SETTLING';
    const anyFell = this.applyGravity();
    this.notifyState();

    setTimeout(() => {
      this.checkPopping();
    }, anyFell ? 180 : 40);
  }

  applyGravity() {
    let moved = false;
    for (let c = 0; c < this.cols; c++) {
      let emptyRow = -1;
      for (let r = this.rows - 1; r >= 0; r--) {
        if (this.grid[r][c] === PUYO_COLORS.EMPTY) {
          if (emptyRow === -1) emptyRow = r;
        } else if (emptyRow !== -1) {
          this.grid[emptyRow][c] = this.grid[r][c];
          this.grid[r][c] = PUYO_COLORS.EMPTY;
          this.gridSquish[emptyRow][c] = { scaleX: 1.2, scaleY: 0.85 };
          emptyRow -= 1;
          moved = true;
        }
      }
    }
    return moved;
  }

  // Find connected groups of >= 4 matching color puyos
  findMatches() {
    const visited = Array.from({ length: this.rows }, () => new Array(this.cols).fill(false));
    const groups = [];

    for (let r = 1; r < this.rows; r++) { // Row 0 is hidden
      for (let c = 0; c < this.cols; c++) {
        const color = this.grid[r][c];
        if (color === PUYO_COLORS.EMPTY || color === PUYO_COLORS.GARBAGE || visited[r][c]) {
          continue;
        }

        // BFS flood fill
        const group = [];
        const queue = [{ r, c }];
        visited[r][c] = true;

        while (queue.length > 0) {
          const curr = queue.shift();
          group.push(curr);

          const neighbors = [
            { r: curr.r - 1, c: curr.c },
            { r: curr.r + 1, c: curr.c },
            { r: curr.r, c: curr.c - 1 },
            { r: curr.r, c: curr.c + 1 }
          ];

          for (const nb of neighbors) {
            if (nb.r >= 1 && nb.r < this.rows && nb.c >= 0 && nb.c < this.cols) {
              if (!visited[nb.r][nb.c] && this.grid[nb.r][nb.c] === color) {
                visited[nb.r][nb.c] = true;
                queue.push(nb);
              }
            }
          }
        }

        if (group.length >= 4) {
          groups.push({ color, cells: group });
        }
      }
    }

    return groups;
  }

  checkPopping() {
    const matches = this.findMatches();

    if (matches.length > 0) {
      this.currentChain += 1;
      if (this.currentChain > this.maxChain) {
        this.maxChain = this.currentChain;
      }

      this.state = 'POPPING';

      // Sound & chain alerts
      window.audioManager?.playPop(this.currentChain);
      this.screenShake = Math.min(18, 3 + this.currentChain * 2.2);

      // Collect cells to pop & adjacent garbage
      const cellsToClear = new Set();
      const garbageToClear = new Set();
      const distinctColors = new Set();
      let totalPuyosCleared = 0;

      for (const group of matches) {
        distinctColors.add(group.color);
        for (const cell of group.cells) {
          const key = `${cell.r},${cell.c}`;
          cellsToClear.add(key);
          totalPuyosCleared += 1;

          // Check adjacent for garbage puyos
          const adj = [
            { r: cell.r - 1, c: cell.c },
            { r: cell.r + 1, c: cell.c },
            { r: cell.r, c: cell.c - 1 },
            { r: cell.r, c: cell.c + 1 }
          ];
          for (const a of adj) {
            if (a.r >= 1 && a.r < this.rows && a.c >= 0 && a.c < this.cols) {
              if (this.grid[a.r][a.c] === PUYO_COLORS.GARBAGE) {
                garbageToClear.add(`${a.r},${a.c}`);
              }
            }
          }
        }
      }

      // Calculate score & attack garbage points (Official Tsu Formula)
      const chainPowers = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
      const colorBonusTable = [0, 0, 3, 6, 12, 24];
      const chainPower = chainPowers[Math.min(this.currentChain - 1, chainPowers.length - 1)];
      const colorBonus = colorBonusTable[Math.min(distinctColors.size, colorBonusTable.length - 1)];
      let groupBonus = 0;
      for (const m of matches) {
        if (m.cells.length === 5) groupBonus += 2;
        else if (m.cells.length === 6) groupBonus += 3;
        else if (m.cells.length === 7) groupBonus += 4;
        else if (m.cells.length >= 8) groupBonus += 5 + (m.cells.length - 8);
      }

      const multiplier = Math.max(1, Math.min(999, chainPower + colorBonus + groupBonus));
      const stepScore = (totalPuyosCleared * 10) * multiplier;
      this.score += stepScore;

      // Spawn floating chain text & particles
      this.spawnChainVisuals(this.currentChain, matches);

      // Attack points to garbage puyos (70 points = 1 Ojama puyo)
      let generatedGarbage = Math.floor(stepScore / 70);
      if (this.isFeverMode) {
        generatedGarbage = Math.floor(generatedGarbage * 1.5); // 1.5x garbage attack in Fever!
      }
      if (this.allClear) {
        generatedGarbage += 30; // Massive All-Clear bonus!
        this.allClear = false;
      }

      this.handleGarbageOffset(generatedGarbage);

      // Prepare pop animations
      this.poppingPuyos = [];
      cellsToClear.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        this.poppingPuyos.push({ r, c, color: this.grid[r][c], progress: 0 });
        this.spawnPopParticles(c, r, this.grid[r][c]);
      });
      garbageToClear.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        this.poppingPuyos.push({ r, c, color: PUYO_COLORS.GARBAGE, progress: 0 });
        this.spawnPopParticles(c, r, PUYO_COLORS.GARBAGE);
      });

      this.notifyState();

      // Clear popped cells after visual flash
      setTimeout(() => {
        cellsToClear.forEach(key => {
          const [r, c] = key.split(',').map(Number);
          this.grid[r][c] = PUYO_COLORS.EMPTY;
        });
        garbageToClear.forEach(key => {
          const [r, c] = key.split(',').map(Number);
          this.grid[r][c] = PUYO_COLORS.EMPTY;
        });
        this.poppingPuyos = [];

        // Continue chain cascade
        this.startSettling();
      }, 350);

    } else {
      // Chain completed! Check for Fever Preset success
      if (this.isFeverMode) {
        if (this.currentChain >= this.feverLevel || this.isBoardEmpty()) {
          this.feverTimeLeft += 2500;
          window.audioManager?.playFeverSuccess();
          this.addFloatingText('SUCCESS! +2.5s', this.cols / 2, 4, '#00e676', 26);
          this.feverLevel = Math.min(7, this.feverLevel + 1);
          setTimeout(() => {
            if (this.isFeverMode) {
              this.loadFeverPreset(this.feverLevel);
              this.spawnPiece();
            }
          }, 350);
          return;
        }
      }

      // Check for All-Clear (전체 클리어)
      if (this.isBoardEmpty() && this.currentChain > 0) {
        this.allClear = true;
        window.audioManager?.playAllClear();
        this.addFloatingText('ALL CLEAR!', this.cols / 2, 6, '#ffd700', 36);
      }

      // Check if garbage should fall (garbage cannot fall during Fever mode)
      if (this.pendingGarbage > 0 && !this.isFeverMode) {
        this.dropGarbage();
      } else {
        // Spawn next piece
        this.spawnPiece();
      }
    }
  }

  isBoardEmpty() {
    for (let r = 1; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== PUYO_COLORS.EMPTY) return false;
      }
    }
    return true;
  }

  handleGarbageOffset(incomingAttack) {
    if (incomingAttack <= 0) return;

    // Build Fever Gauge (1 point per offset or substantial attack)
    if (!this.isFeverMode) {
      this.feverGauge = Math.min(7, this.feverGauge + 1);
      if (this.feverGauge >= 7) {
        this.enterFeverMode();
        return;
      }
    }

    if (this.pendingGarbage > 0) {
      if (incomingAttack >= this.pendingGarbage) {
        const remaining = incomingAttack - this.pendingGarbage;
        this.addFloatingText(`OFFSET! -${this.pendingGarbage}`, this.cols / 2, 4, '#00e676', 22);
        this.pendingGarbage = 0;
        if (remaining > 0) {
          if (this.onGarbageSend) this.onGarbageSend(remaining);
        }
      } else {
        this.pendingGarbage -= incomingAttack;
        this.addFloatingText(`OFFSET! -${incomingAttack}`, this.cols / 2, 4, '#00e676', 22);
      }
    } else {
      if (this.onGarbageSend) {
        this.onGarbageSend(incomingAttack);
      }
    }
    this.notifyState();
  }

  receiveGarbage(count) {
    this.pendingGarbage += count;
    window.audioManager?.playGarbageSend();
    this.notifyState();
  }

  dropGarbage() {
    this.state = 'GARBAGE_DROP';
    const dropAmount = Math.min(this.pendingGarbage, 30); // Max 5 full rows (30 puyos) per turn
    this.pendingGarbage -= dropAmount;

    window.audioManager?.playGarbageDrop();

    // Distribute garbage evenly across columns
    const dropsPerCol = new Array(this.cols).fill(0);
    for (let i = 0; i < dropAmount; i++) {
      dropsPerCol[i % this.cols] += 1;
    }

    for (let c = 0; c < this.cols; c++) {
      let count = dropsPerCol[c];
      for (let r = 1; r < this.rows && count > 0; r++) {
        if (this.grid[r][c] === PUYO_COLORS.EMPTY) {
          this.grid[r][c] = PUYO_COLORS.GARBAGE;
          this.gridSquish[r][c] = { scaleX: 1.3, scaleY: 0.7 };
          count--;
        }
      }
    }

    this.notifyState();

    setTimeout(() => {
      this.startSettling();
    }, 280);
  }

  triggerGameOver() {
    this.state = 'GAME_OVER';
    window.audioManager?.playLose();
    this.addFloatingText('GAME OVER', this.cols / 2, 6, '#ff0055', 38);
    this.notifyState();
    if (this.onGameOver) {
      this.onGameOver({ score: this.score, maxChain: this.maxChain });
    }
  }

  // --- Visuals & Particle FX ---

  spawnChainVisuals(chain, matches) {
    const titles = ['', '1 CHAIN!', '2 CHAIN!', '3 CHAIN!', '4 FEVER!', '5 MEGA!', '6 ULTRA!', '7+ GODLIKE!'];
    const title = titles[Math.min(chain, titles.length - 1)];
    const colors = ['#fff', '#69f0ae', '#00d2ff', '#ffd166', '#ff2e63', '#b5179e', '#f72585'];
    const color = colors[Math.min(chain, colors.length - 1)];

    // Target the first match center
    const firstGroup = matches[0];
    const avgC = firstGroup.cells.reduce((sum, c) => sum + c.c, 0) / firstGroup.cells.length;
    const avgR = firstGroup.cells.reduce((sum, c) => sum + c.r, 0) / firstGroup.cells.length;

    this.addFloatingText(title, avgC, avgR, color, Math.min(42, 22 + chain * 3.5));
  }

  spawnPopParticles(c, r, colorType) {
    const config = PUYO_CONFIG[colorType] || PUYO_CONFIG[PUYO_COLORS.RED];
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x: (c + 0.5) * this.cellSize,
        y: (r - 0.5) * this.cellSize,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        color: config.main,
        highlight: config.highlight,
        radius: 3 + Math.random() * 4,
        alpha: 1,
        decay: 0.03 + Math.random() * 0.02
      });
    }
  }

  addFloatingText(text, col, row, color, fontSize = 24) {
    this.floatingTexts.push({
      text,
      x: (col + 0.5) * this.cellSize,
      y: (row - 0.5) * this.cellSize,
      color,
      fontSize,
      alpha: 1,
      vy: -1.2,
      scale: 1.5,
      decay: 0.022
    });
  }

  update(delta = 16) {
    // Screen shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - delta * 0.02);
    }

    // Grid squish spring recovery
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const sq = this.gridSquish[r][c];
        sq.scaleX += (1 - sq.scaleX) * 0.18;
        sq.scaleY += (1 - sq.scaleY) * 0.18;
      }
    }

    // Floating text update
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.scale += (1 - ft.scale) * 0.2;
      ft.alpha -= ft.decay;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Particle update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // Gravity
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Fever timer countdown
    if (this.isFeverMode) {
      this.feverTimeLeft -= delta;
      if (this.feverTimeLeft <= 0) {
        this.exitFeverMode();
      }
    }

    // Gravity ticker for active piece
    if (this.state === 'FALLING' && this.activePiece) {
      this.lastDropTime += delta;
      const effectiveInterval = this.softDrop ? 60 : (this.isFeverMode ? 350 : this.dropInterval);

      if (this.lastDropTime >= effectiveInterval) {
        this.lastDropTime = 0;
        const dropped = this.dropRow();
        if (!dropped) {
          this.lockTimer += effectiveInterval;
          if (this.lockTimer >= this.lockDelay || this.softDrop) {
            this.lockPiece();
          }
        } else {
          this.lockTimer = 0;
        }
      }
    }
  }

  enterFeverMode() {
    this.isFeverMode = true;
    this.feverTimeLeft = 18000; // 18 seconds
    this.savedNormalGrid = this.grid.map(row => [...row]);
    this.savedNormalPendingGarbage = this.pendingGarbage;
    this.pendingGarbage = 0;
    this.feverLevel = 4;
    window.audioManager?.playFeverEnter();
    this.screenShake = 18;
    this.addFloatingText('FEVER TIME!', this.cols / 2, 5, '#ff007f', 40);
    this.loadFeverPreset(this.feverLevel);
    if (this.onFeverStateChange) this.onFeverStateChange(true);
    this.spawnPiece();
    this.notifyState();
  }

  exitFeverMode() {
    if (!this.isFeverMode) return;
    this.isFeverMode = false;
    this.feverGauge = 0;
    this.grid = this.savedNormalGrid || this.createEmptyGrid();
    this.pendingGarbage = this.savedNormalPendingGarbage || 0;
    this.addFloatingText('FEVER END', this.cols / 2, 5, '#94a3b8', 30);
    if (this.onFeverStateChange) this.onFeverStateChange(false);
    this.startSettling();
    this.notifyState();
  }

  loadFeverPreset(level = 4) {
    this.grid = this.createEmptyGrid();
    const R = PUYO_COLORS.RED;
    const G = PUYO_COLORS.GREEN;
    const B = PUYO_COLORS.BLUE;
    const Y = PUYO_COLORS.YELLOW;
    const P = PUYO_COLORS.PURPLE;

    if (level === 4) {
      // 4-Chain Staircase
      this.grid[10][0] = R; this.grid[11][0] = R; this.grid[12][0] = R;
      this.grid[12][1] = R; this.grid[9][1] = G; this.grid[10][1] = G; this.grid[11][1] = G;
      this.grid[12][2] = G; this.grid[9][2] = B; this.grid[10][2] = B; this.grid[11][2] = B;
      this.grid[12][3] = B; this.grid[9][3] = Y; this.grid[10][3] = Y; this.grid[11][3] = Y;
      this.nextQueue[0] = { axis: R, child: R };
    } else if (level === 5) {
      // 5-Chain Staircase
      this.grid[10][0] = R; this.grid[11][0] = R; this.grid[12][0] = R;
      this.grid[12][1] = R; this.grid[9][1] = G; this.grid[10][1] = G; this.grid[11][1] = G;
      this.grid[12][2] = G; this.grid[9][2] = B; this.grid[10][2] = B; this.grid[11][2] = B;
      this.grid[12][3] = B; this.grid[9][3] = Y; this.grid[10][3] = Y; this.grid[11][3] = Y;
      this.grid[12][4] = Y; this.grid[9][4] = P; this.grid[10][4] = P; this.grid[11][4] = P;
      this.nextQueue[0] = { axis: R, child: R };
    } else if (level === 6) {
      // 6-Chain Staircase
      this.grid[10][0] = R; this.grid[11][0] = R; this.grid[12][0] = R;
      this.grid[12][1] = R; this.grid[9][1] = G; this.grid[10][1] = G; this.grid[11][1] = G;
      this.grid[12][2] = G; this.grid[9][2] = B; this.grid[10][2] = B; this.grid[11][2] = B;
      this.grid[12][3] = B; this.grid[9][3] = Y; this.grid[10][3] = Y; this.grid[11][3] = Y;
      this.grid[12][4] = Y; this.grid[9][4] = P; this.grid[10][4] = P; this.grid[11][4] = P;
      this.grid[12][5] = P; this.grid[9][5] = R; this.grid[10][5] = R; this.grid[11][5] = R;
      this.nextQueue[0] = { axis: R, child: R };
    } else {
      // 7-Chain Master Staircase
      this.grid[10][0] = R; this.grid[11][0] = R; this.grid[12][0] = R;
      this.grid[12][1] = R; this.grid[9][1] = G; this.grid[10][1] = G; this.grid[11][1] = G;
      this.grid[12][2] = G; this.grid[9][2] = B; this.grid[10][2] = B; this.grid[11][2] = B;
      this.grid[12][3] = B; this.grid[9][3] = Y; this.grid[10][3] = Y; this.grid[11][3] = Y;
      this.grid[12][4] = Y; this.grid[9][4] = P; this.grid[10][4] = P; this.grid[11][4] = P;
      this.grid[12][5] = P; this.grid[9][5] = R; this.grid[10][5] = R; this.grid[11][5] = R;
      this.grid[8][5] = R; this.grid[8][4] = G; this.grid[8][3] = G; this.grid[8][2] = G;
      this.nextQueue[0] = { axis: R, child: R };
    }
  }

  // --- Rendering ---
  render(ctx) {
    ctx.save();

    // Screen Shake offset
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    const radius = this.cellSize * 0.46;

    // 1. Draw Grid Background cells & Danger zone at (row 1, col 2)
    for (let r = 1; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * this.cellSize;
        const y = (r - 1) * this.cellSize;

        // Danger Cross on column 2 top
        if (r === 1 && c === 2) {
          ctx.strokeStyle = 'rgba(255, 0, 85, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 6);
          ctx.lineTo(x + this.cellSize - 6, y + this.cellSize - 6);
          ctx.moveTo(x + this.cellSize - 6, y + 6);
          ctx.lineTo(x + 6, y + this.cellSize - 6);
          ctx.stroke();
        }
      }
    }

    // 2. Draw Locked Grid Puyos with Connections
    for (let r = 1; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const color = this.grid[r][c];
        if (color === PUYO_COLORS.EMPTY) continue;

        const cx = (c + 0.5) * this.cellSize;
        const cy = (r - 0.5) * this.cellSize;
        const squish = this.gridSquish[r][c];

        // Check 4-way connections with same color
        const connections = {
          up: r > 1 && this.grid[r - 1][c] === color,
          down: r < this.rows - 1 && this.grid[r + 1][c] === color,
          left: c > 0 && this.grid[r][c - 1] === color,
          right: c < this.cols - 1 && this.grid[r][c + 1] === color
        };

        const animState = {
          scaleX: squish.scaleX,
          scaleY: squish.scaleY,
          eyeLookX: 0,
          eyeLookY: 0
        };

        window.puyoRenderer.drawPuyo(ctx, cx, cy, radius, color, connections, animState);
      }
    }

    // 3. Draw Active Falling Pair & Ghost/Shadow
    if (this.state === 'FALLING' && this.activePiece) {
      // Draw Ghost shadow showing landing column
      this.drawGhostPiece(ctx, radius);

      // Draw Active Piece
      const ax = (this.activePiece.x + 0.5) * this.cellSize;
      const ay = (this.activePiece.y - 0.5) * this.cellSize;
      const childPos = this.getChildPos(this.activePiece);
      const cx = (childPos.x + 0.5) * this.cellSize;
      const cy = (childPos.y - 0.5) * this.cellSize;

      // Axis
      window.puyoRenderer.drawPuyo(ctx, ax, ay, radius, this.activePiece.axisColor, {}, {
        scaleX: this.activePiece.scaleX,
        scaleY: this.activePiece.scaleY,
        glowIntensity: 0.6,
        eyeLookY: 1
      });

      // Child
      window.puyoRenderer.drawPuyo(ctx, cx, cy, radius, this.activePiece.childColor, {}, {
        scaleX: this.activePiece.scaleX,
        scaleY: this.activePiece.scaleY,
        glowIntensity: 0.6,
        eyeLookY: 1
      });
    }

    // 4. Draw Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.highlight || p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.restore();
    }

    // 5. Draw Floating Combo Texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.translate(ft.x, ft.y);
      ctx.scale(ft.scale, ft.scale);
      ctx.font = `900 ${ft.fontSize}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 14;
      ctx.shadowColor = ft.color;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }

    // 6. Draw Fever Mode Overlay
    if (this.isFeverMode) {
      // Rainbow pulsating border
      const t = Date.now() * 0.005;
      const hue = Math.floor((t * 50) % 360);
      ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, this.cols * this.cellSize - 4, this.visibleRows * this.cellSize - 4);

      // Fever Timer Countdown Pill
      const secLeft = Math.max(0, (this.feverTimeLeft / 1000)).toFixed(1);
      ctx.font = '900 13px "Outfit", sans-serif';
      ctx.fillStyle = '#ff007f';
      ctx.textAlign = 'right';
      ctx.fillText(`⚡ FEVER ${secLeft}s`, this.cols * this.cellSize - 8, 18);
    }

    ctx.restore();
  }

  drawGhostPiece(ctx, radius) {
    if (!this.activePiece) return;
    let ghostY = this.activePiece.y;
    while (true) {
      const test = { ...this.activePiece, y: ghostY + 1 };
      if (!this.canPieceFit(test)) break;
      ghostY++;
    }

    if (ghostY === this.activePiece.y) return; // already at bottom

    const testGhost = { ...this.activePiece, y: ghostY };
    const childPos = this.getChildPos(testGhost);

    const ax = (testGhost.x + 0.5) * this.cellSize;
    const ay = (testGhost.y - 0.5) * this.cellSize;
    const cx = (childPos.x + 0.5) * this.cellSize;
    const cy = (childPos.y - 0.5) * this.cellSize;

    ctx.save();
    ctx.globalAlpha = 0.28;
    window.puyoRenderer.drawPuyo(ctx, ax, ay, radius, this.activePiece.axisColor);
    window.puyoRenderer.drawPuyo(ctx, cx, cy, radius, this.activePiece.childColor);
    ctx.restore();
  }

  notifyState() {
    if (this.onStateChange) {
      this.onStateChange(this.exportState());
    }
  }

  exportState() {
    return {
      grid: this.grid,
      activePiece: this.activePiece ? {
        x: this.activePiece.x,
        y: this.activePiece.y,
        rot: this.activePiece.rot,
        axisColor: this.activePiece.axisColor,
        childColor: this.activePiece.childColor
      } : null,
      score: this.score,
      currentChain: this.currentChain,
      pendingGarbage: this.pendingGarbage,
      state: this.state,
      feverGauge: this.feverGauge,
      isFeverMode: this.isFeverMode,
      feverTimeLeft: this.feverTimeLeft
    };
  }

  importState(state) {
    if (!state) return;
    this.grid = state.grid;
    this.activePiece = state.activePiece;
    this.score = state.score;
    this.currentChain = state.currentChain;
    this.pendingGarbage = state.pendingGarbage;
    this.state = state.state;
    this.feverGauge = state.feverGauge || 0;
    this.isFeverMode = state.isFeverMode || false;
    this.feverTimeLeft = state.feverTimeLeft || 0;
  }
}

window.PuyoBoard = PuyoBoard;
