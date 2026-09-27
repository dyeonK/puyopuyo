/**
 * Puyo Visuals, Colors, and Jelly Canvas Renderer
 */

const PUYO_COLORS = {
  EMPTY: 0,
  RED: 1,
  GREEN: 2,
  BLUE: 3,
  YELLOW: 4,
  PURPLE: 5,
  GARBAGE: 6
};

const PUYO_CONFIG = {
  [PUYO_COLORS.RED]: {
    name: 'Red',
    main: '#ff2e63',
    highlight: '#ff7597',
    glow: 'rgba(255, 46, 99, 0.7)',
    dark: '#a80b33',
    eyeColor: '#1a102f'
  },
  [PUYO_COLORS.GREEN]: {
    name: 'Green',
    main: '#00e676',
    highlight: '#69f0ae',
    glow: 'rgba(0, 230, 118, 0.7)',
    dark: '#008744',
    eyeColor: '#0a2318'
  },
  [PUYO_COLORS.BLUE]: {
    name: 'Blue',
    main: '#00b4d8',
    highlight: '#90e0ef',
    glow: 'rgba(0, 180, 216, 0.7)',
    dark: '#0077b6',
    eyeColor: '#0c1b33'
  },
  [PUYO_COLORS.YELLOW]: {
    name: 'Yellow',
    main: '#ffd166',
    highlight: '#fff3b0',
    glow: 'rgba(255, 209, 102, 0.7)',
    dark: '#e09f3e',
    eyeColor: '#2b2118'
  },
  [PUYO_COLORS.PURPLE]: {
    name: 'Purple',
    main: '#b5179e',
    highlight: '#f72585',
    glow: 'rgba(181, 23, 158, 0.7)',
    dark: '#7209b7',
    eyeColor: '#240046'
  },
  [PUYO_COLORS.GARBAGE]: {
    name: 'Garbage',
    main: '#94a3b8',
    highlight: '#e2e8f0',
    glow: 'rgba(148, 163, 184, 0.5)',
    dark: '#475569',
    eyeColor: '#ff0055' // Menacing red glowing eye
  }
};

class PuyoRenderer {
  constructor() {
    this.blinkTimer = 0;
    this.isBlinking = false;
  }

  update(delta = 16) {
    this.blinkTimer += delta;
    if (!this.isBlinking && this.blinkTimer > 2800 + Math.random() * 2000) {
      this.isBlinking = true;
      this.blinkTimer = 0;
    } else if (this.isBlinking && this.blinkTimer > 150) {
      this.isBlinking = false;
      this.blinkTimer = 0;
    }
  }

  /**
   * Render a Puyo cell on a 2D canvas context
   * @param {CanvasRenderingContext2D} ctx 
   * @param {number} x Center X coordinate
   * @param {number} y Center Y coordinate
   * @param {number} radius Puyo radius (usually cellSize * 0.46)
   * @param {number} colorType PUYO_COLORS enum
   * @param {Object} connections { up: bool, down: bool, left: bool, right: bool }
   * @param {Object} animState { scaleX, scaleY, popping, glowIntensity, eyeLookX, eyeLookY }
   */
  drawPuyo(ctx, x, y, radius, colorType, connections = {}, animState = {}) {
    if (!colorType || colorType === PUYO_COLORS.EMPTY) return;

    const config = PUYO_CONFIG[colorType] || PUYO_CONFIG[PUYO_COLORS.RED];
    const scaleX = animState.scaleX || 1;
    const scaleY = animState.scaleY || 1;
    const isPopping = animState.popping || false;
    const glow = animState.glowIntensity || 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);

    // 1. Connection Bridges (Blob-like merging for same color puyos)
    if (colorType !== PUYO_COLORS.GARBAGE) {
      const bridgeW = radius * 0.78;
      const reach = radius * 1.08;

      ctx.fillStyle = config.main;
      if (connections.up) {
        ctx.fillRect(-bridgeW / 2, -reach, bridgeW, reach);
      }
      if (connections.down) {
        ctx.fillRect(-bridgeW / 2, 0, bridgeW, reach);
      }
      if (connections.left) {
        ctx.fillRect(-reach, -bridgeW / 2, reach, bridgeW);
      }
      if (connections.right) {
        ctx.fillRect(0, -bridgeW / 2, reach, bridgeW);
      }
    }

    // 2. Neon Aura Glow
    if (glow > 0 || isPopping) {
      ctx.shadowBlur = 18 * (glow || 1.5);
      ctx.shadowColor = config.glow;
    }

    // 3. Main Puyo Body (Smooth Rounded Jelly Sphere)
    const grad = ctx.createRadialGradient(-radius * 0.25, -radius * 0.3, radius * 0.1, 0, 0, radius);
    if (isPopping) {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, config.highlight);
      grad.addColorStop(1, config.main);
    } else {
      grad.addColorStop(0, config.highlight);
      grad.addColorStop(0.6, config.main);
      grad.addColorStop(1, config.dark);
    }

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;

    // 4. Specular Gloss / Gel Highlight
    ctx.beginPath();
    ctx.ellipse(-radius * 0.32, -radius * 0.35, radius * 0.32, radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fill();

    // 5. Cute Anime Eyes or Garbage Menace
    if (colorType === PUYO_COLORS.GARBAGE) {
      this.drawGarbageFace(ctx, radius);
    } else {
      this.drawPuyoEyes(ctx, radius, config, animState);
    }

    ctx.restore();
  }

  drawPuyoEyes(ctx, radius, config, animState) {
    const eyeSpacing = radius * 0.36;
    const eyeY = -radius * 0.05;
    const eyeRadiusX = radius * 0.22;
    const eyeRadiusY = this.isBlinking ? radius * 0.05 : radius * 0.28;

    const lookX = (animState.eyeLookX || 0) * radius * 0.08;
    const lookY = (animState.eyeLookY || 0) * radius * 0.08;

    [-eyeSpacing, eyeSpacing].forEach(eyeX => {
      // Eye White
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = config.dark;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (!this.isBlinking) {
        // Pupil
        const pupilRadius = eyeRadiusX * 0.6;
        ctx.beginPath();
        ctx.arc(eyeX + lookX, eyeY + lookY, pupilRadius, 0, Math.PI * 2);
        ctx.fillStyle = config.eyeColor;
        ctx.fill();

        // Eye Light Specular Dots
        ctx.beginPath();
        ctx.arc(eyeX + lookX - pupilRadius * 0.3, eyeY + lookY - pupilRadius * 0.3, pupilRadius * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });

    // Subtle Cute Smile
    if (!this.isBlinking && !animState.popping) {
      ctx.beginPath();
      ctx.arc(0, radius * 0.32, radius * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = config.dark;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  drawGarbageFace(ctx, radius) {
    // Menacing Cyclops / Robot Eye
    ctx.beginPath();
    ctx.arc(0, -radius * 0.05, radius * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Red Glowing Iris
    ctx.beginPath();
    ctx.arc(0, -radius * 0.05, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff0033';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Small White Center
    ctx.beginPath();
    ctx.arc(0, -radius * 0.05, radius * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Stitched Mouth / Grate
    ctx.beginPath();
    ctx.moveTo(-radius * 0.35, radius * 0.38);
    ctx.lineTo(radius * 0.35, radius * 0.38);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

window.puyoRenderer = new PuyoRenderer();
