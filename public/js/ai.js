/**
 * Puyo Puyo Computer AI Controller
 * Evaluates board positions and simulates human-like key inputs for VS Computer mode
 */

class PuyoAI {
  constructor(board, difficulty = 'normal') {
    this.board = board;
    this.difficulty = difficulty; // 'easy' | 'normal' | 'hard'
    this.plan = null; // { targetX, targetRot, decided: bool }
    this.thinkTimer = 0;
    this.actionDelay = 250;
    this.lastActionTime = 0;
    this.setDifficulty(difficulty);
  }

  setDifficulty(diff) {
    this.difficulty = diff;
    if (diff === 'easy') {
      this.actionDelay = 380;
    } else if (diff === 'normal') {
      this.actionDelay = 200;
    } else {
      this.actionDelay = 90; // Fast / aggressive
    }
  }

  update(delta = 16) {
    if (this.board.state !== 'FALLING' || !this.board.activePiece) {
      this.plan = null;
      return;
    }

    const now = performance.now();
    if (now - this.lastActionTime < this.actionDelay) return;

    if (!this.plan) {
      this.plan = this.calculateBestMove();
    }

    if (!this.plan) return;

    const piece = this.board.activePiece;

    // 1. First reach target rotation
    if (piece.rot !== this.plan.targetRot) {
      this.board.rotateClockwise();
      this.lastActionTime = now;
      return;
    }

    // 2. Reach target column
    if (piece.x < this.plan.targetX) {
      this.board.moveRight();
      this.lastActionTime = now;
      return;
    } else if (piece.x > this.plan.targetX) {
      this.board.moveLeft();
      this.lastActionTime = now;
      return;
    }

    // 3. Drop down
    if (this.difficulty === 'hard') {
      this.board.hardDrop();
      this.plan = null;
    } else {
      this.board.dropRow();
    }
    this.lastActionTime = now;
  }

  calculateBestMove() {
    const piece = this.board.activePiece;
    if (!piece) return null;

    let bestScore = -Infinity;
    let bestMove = { targetX: 2, targetRot: 0 };

    // Try all 4 rotations
    for (let rot = 0; rot < 4; rot++) {
      // Try all columns 0 to 5
      for (let x = 0; x < this.board.cols; x++) {
        const simPiece = {
          x,
          y: 1,
          rot,
          axisColor: piece.axisColor,
          childColor: piece.childColor
        };

        // Check if piece fits at top
        if (!this.board.canPieceFit(simPiece)) continue;

        // Simulate dropping to bottom
        let dropY = simPiece.y;
        while (true) {
          const test = { ...simPiece, y: dropY + 1 };
          if (!this.board.canPieceFit(test)) break;
          dropY++;
        }

        const landedPiece = { ...simPiece, y: dropY };
        const score = this.evaluatePlacement(landedPiece);

        // Add small random noise for beginner difficulty
        const noise = (this.difficulty === 'easy') ? (Math.random() * 25 - 12) : 0;
        if (score + noise > bestScore) {
          bestScore = score + noise;
          bestMove = { targetX: x, targetRot: rot };
        }
      }
    }

    return bestMove;
  }

  evaluatePlacement(piece) {
    const child = this.board.getChildPos(piece);
    const ax = piece.x, ay = piece.y;
    const cx = child.x, cy = child.y;

    // Severe penalty for choking the 3rd column spawn position (col 2, row 1)
    if ((ax === 2 && ay <= 2) || (cx === 2 && cy <= 2)) {
      return -9999;
    }

    let score = 0;

    // 1. Reward connecting adjacent colors (clustering)
    const checkAdj = (x, y, color) => {
      let adjMatches = 0;
      const neighbors = [
        { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }
      ];
      for (const n of neighbors) {
        if (n.x >= 0 && n.x < this.board.cols && n.y >= 1 && n.y < this.board.rows) {
          if (this.board.grid[n.y][n.x] === color) {
            adjMatches++;
          }
        }
      }
      return adjMatches;
    };

    const axisMatches = checkAdj(ax, ay, piece.axisColor);
    const childMatches = checkAdj(cx, cy, piece.childColor);

    if (this.difficulty === 'easy') {
      score += (axisMatches + childMatches) * 15;
      score += ay * 2; // Prefer dropping lower
      return score;
    }

    // Normal & Hard heuristics:
    // Reward making pairs (2 puyos) and triplets (3 puyos) to prepare big chains
    score += axisMatches * 20;
    score += childMatches * 20;

    // If matches is 3, connecting makes 4 (triggers pop)
    if (axisMatches >= 3 || childMatches >= 3) {
      if (this.board.pendingGarbage > 4) {
        // High urgency to clear when attacked!
        score += 80;
      } else if (this.difficulty === 'hard') {
        // On hard, prefer building chains unless attacked
        score += 25;
      } else {
        score += 50;
      }
    }

    // Penalty for column height disparities (keeps board tidy)
    const colHeights = new Array(this.board.cols).fill(0);
    for (let c = 0; c < this.board.cols; c++) {
      for (let r = 1; r < this.board.rows; r++) {
        if (this.board.grid[r][c] !== PUYO_COLORS.EMPTY) {
          colHeights[c] = this.board.rows - r;
          break;
        }
      }
    }

    // Keep danger column (col 2) low
    score -= colHeights[2] * 4;

    // Prefer keeping columns relatively even
    const avgH = colHeights.reduce((a, b) => a + b, 0) / this.board.cols;
    const targetH = Math.max(this.board.rows - ay, this.board.rows - cy);
    if (targetH > avgH + 4) {
      score -= 20;
    }

    // Bonus for lower placements (gravity stability)
    score += Math.min(ay, cy) * 3;

    return score;
  }
}

window.PuyoAI = PuyoAI;
