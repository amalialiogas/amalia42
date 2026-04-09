const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");

const state = {
  paddle: {
    width: 130,
    height: 18,
    speed: 620,
    x: 0,
    vx: 0,
  },
  ball: {
    radius: 9,
    speed: 420,
    dx: 0,
    dy: 0,
    x: 0,
    y: 0,
    stuck: true,
  },
  bricks: [],
  rows: 6,
  cols: 11,
  brick: {
    width: 0,
    height: 22,
    gap: 8,
    top: 80,
    left: 40,
  },
  score: 0,
  lives: 3,
  level: 1,
  paused: false,
  gameOver: false,
  lastTime: 0,
};

const keys = {
  left: false,
  right: false,
};

const palette = [
  "#ff7a59",
  "#ffd166",
  "#66d7d1",
  "#5b8def",
  "#f484ef",
  "#ff9f1c",
];

const message = {
  text: "Press Space to Launch",
  timer: 0,
};

const audioState = {
  ctx: null,
  enabled: false,
};

function ensureAudio() {
  if (audioState.enabled) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audioState.ctx = new AudioCtx();
  audioState.enabled = true;
}

function playSound(type) {
  if (!audioState.enabled || !audioState.ctx) return;
  const ctxAudio = audioState.ctx;
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.connect(gain);
  gain.connect(ctxAudio.destination);

  let freq = 440;
  let duration = 0.08;
  let wave = "sine";
  if (type === "paddle") {
    freq = 620;
    duration = 0.08;
    wave = "square";
  } else if (type === "brick") {
    freq = 520;
    duration = 0.06;
    wave = "triangle";
  } else if (type === "level") {
    freq = 760;
    duration = 0.22;
    wave = "sine";
  } else if (type === "miss") {
    freq = 180;
    duration = 0.18;
    wave = "sawtooth";
  }

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, ctxAudio.currentTime);
  gain.gain.setValueAtTime(0.2, ctxAudio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctxAudio.currentTime + duration);
  osc.start();
  osc.stop(ctxAudio.currentTime + duration);
}

function resizeGame() {
  const baseWidth = 900;
  const baseHeight = 600;
  canvas.width = baseWidth;
  canvas.height = baseHeight;

  state.paddle.x = (canvas.width - state.paddle.width) / 2;
  state.paddle.y = canvas.height - 50;

  state.ball.x = state.paddle.x + state.paddle.width / 2;
  state.ball.y = state.paddle.y - state.ball.radius - 2;

  const totalGap = (state.cols - 1) * state.brick.gap;
  const usableWidth = canvas.width - state.brick.left * 2 - totalGap;
  state.brick.width = usableWidth / state.cols;
  layoutBricks();
}

function resetBall() {
  state.ball.stuck = true;
  state.ball.dx = 0;
  state.ball.dy = 0;
  state.ball.x = state.paddle.x + state.paddle.width / 2;
  state.ball.y = state.paddle.y - state.ball.radius - 2;
}

function resetLevel() {
  state.bricks = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      state.bricks.push({
        row,
        col,
        x: 0,
        y: 0,
        alive: true,
        hits: row >= 4 ? 2 : 1,
      });
    }
  }
  layoutBricks();
}

function layoutBricks() {
  state.bricks.forEach((brick) => {
    brick.x =
      state.brick.left +
      brick.col * (state.brick.width + state.brick.gap);
    brick.y =
      state.brick.top +
      brick.row * (state.brick.height + state.brick.gap);
  });
}

function launchBall() {
  if (!state.ball.stuck) return;
  const angle = (Math.random() * Math.PI) / 3 + (Math.PI * 7) / 6;
  state.ball.dx = Math.cos(angle) * state.ball.speed;
  state.ball.dy = Math.sin(angle) * state.ball.speed;
  state.ball.stuck = false;
  message.text = "";
  message.timer = 0;
}

function updateUI() {
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  levelEl.textContent = state.level;
}

function drawBackdrop() {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  for (let i = 0; i < 30; i += 1) {
    const x = (i * 73) % canvas.width;
    const y = (i * 91) % canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPaddle() {
  ctx.save();
  ctx.fillStyle = "#f2f4f8";
  ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
  ctx.shadowBlur = 12;
  ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height);
  ctx.restore();
}

function drawBall() {
  ctx.save();
  const gradient = ctx.createRadialGradient(
    state.ball.x - 3,
    state.ball.y - 3,
    2,
    state.ball.x,
    state.ball.y,
    10
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#ff7a59");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBricks() {
  ctx.save();
  state.bricks.forEach((brick) => {
    if (!brick.alive) return;
    ctx.fillStyle = palette[brick.row % palette.length];
    ctx.fillRect(brick.x, brick.y, state.brick.width, state.brick.height);
    if (brick.hits > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        brick.x + 4,
        brick.y + 4,
        state.brick.width - 8,
        state.brick.height - 8
      );
    }
  });
  ctx.restore();
}

function drawMessage() {
  if (!message.text) return;
  ctx.save();
  ctx.fillStyle = "rgba(242, 244, 248, 0.9)";
  ctx.font = '16px "Press Start 2P", "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.fillText(message.text, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function drawPause() {
  if (!state.paused) return;
  ctx.save();
  ctx.fillStyle = "rgba(10, 15, 31, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffd166";
  ctx.font = '20px "Press Start 2P", "Courier New", monospace';
  ctx.textAlign = "center";
  const label = state.gameOver ? "Game Over — Press R" : "Paused";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function handlePaddle(dt) {
  const prevX = state.paddle.x;
  if (keys.left) {
    state.paddle.x -= state.paddle.speed * dt;
  }
  if (keys.right) {
    state.paddle.x += state.paddle.speed * dt;
  }
  state.paddle.x = Math.max(
    20,
    Math.min(canvas.width - state.paddle.width - 20, state.paddle.x)
  );
  state.paddle.vx = (state.paddle.x - prevX) / dt;

  if (state.ball.stuck) {
    state.ball.x = state.paddle.x + state.paddle.width / 2;
    state.ball.y = state.paddle.y - state.ball.radius - 2;
  }
}

function handleBall(dt) {
  if (state.ball.stuck) return;
  state.ball.x += state.ball.dx * dt;
  state.ball.y += state.ball.dy * dt;

  if (state.ball.x - state.ball.radius <= 0) {
    state.ball.x = state.ball.radius;
    state.ball.dx *= -1;
  } else if (state.ball.x + state.ball.radius >= canvas.width) {
    state.ball.x = canvas.width - state.ball.radius;
    state.ball.dx *= -1;
  }

  if (state.ball.y - state.ball.radius <= 0) {
    state.ball.y = state.ball.radius;
    state.ball.dy *= -1;
  }

  if (state.ball.y - state.ball.radius > canvas.height) {
    state.lives -= 1;
    playSound("miss");
    updateUI();
    if (state.lives <= 0) {
      message.text = "Game Over — Press R";
      state.paused = true;
      state.gameOver = true;
    } else {
      message.text = "Press Space to Launch";
      message.timer = 2;
      resetBall();
    }
  }

  const paddleTop = state.paddle.y;
  if (
    state.ball.y + state.ball.radius >= paddleTop &&
    state.ball.y - state.ball.radius <= paddleTop + state.paddle.height &&
    state.ball.x >= state.paddle.x &&
    state.ball.x <= state.paddle.x + state.paddle.width &&
    state.ball.dy > 0
  ) {
    playSound("paddle");
    const hitPos = (state.ball.x - state.paddle.x) / state.paddle.width;
    const clamped = Math.max(0.05, Math.min(0.95, hitPos));
    const minAngle = (Math.PI * 7) / 6;
    const maxAngle = (Math.PI * 11) / 6;
    const angle = minAngle + (maxAngle - minAngle) * clamped;
    const baseSpeed = state.ball.speed + state.level * 20;
    const paddleBoost = Math.min(220, Math.abs(state.paddle.vx) * 0.35);
    const speed = baseSpeed + paddleBoost;
    state.ball.dx = Math.cos(angle) * speed + state.paddle.vx * 0.3;
    state.ball.dy = Math.sin(angle) * speed;
    state.ball.y = paddleTop - state.ball.radius - 2;
  }

  state.bricks.forEach((brick) => {
    if (!brick.alive) return;
    if (
      state.ball.x + state.ball.radius < brick.x ||
      state.ball.x - state.ball.radius > brick.x + state.brick.width ||
      state.ball.y + state.ball.radius < brick.y ||
      state.ball.y - state.ball.radius > brick.y + state.brick.height
    ) {
      return;
    }

    const overlapLeft = state.ball.x + state.ball.radius - brick.x;
    const overlapRight = brick.x + state.brick.width - (state.ball.x - state.ball.radius);
    const overlapTop = state.ball.y + state.ball.radius - brick.y;
    const overlapBottom =
      brick.y + state.brick.height - (state.ball.y - state.ball.radius);
    const minOverlap = Math.min(
      overlapLeft,
      overlapRight,
      overlapTop,
      overlapBottom
    );

    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
      state.ball.dx *= -1;
    } else {
      state.ball.dy *= -1;
    }

    brick.hits -= 1;
    playSound("brick");
    if (brick.hits <= 0) {
      brick.alive = false;
      state.score += 10;
    } else {
      state.score += 5;
    }

    updateUI();
  });

  const remaining = state.bricks.filter((brick) => brick.alive).length;
  if (remaining === 0) {
    playSound("level");
    state.level += 1;
    state.rows = Math.min(8, state.rows + 1);
    state.ball.speed += 30;
    state.paddle.width = Math.max(90, state.paddle.width - 10);
    resetLevel();
    resetBall();
    message.text = "Level Up!";
    message.timer = 2;
    updateUI();
  }
}

function tick(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;

  if (!state.paused) {
    handlePaddle(dt);
    handleBall(dt);
    if (message.timer > 0) {
      message.timer -= dt;
      if (message.timer <= 0 && state.ball.stuck) {
        message.text = "Press Space to Launch";
      }
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackdrop();
  drawBricks();
  drawPaddle();
  drawBall();
  drawMessage();
  drawPause();

  requestAnimationFrame(tick);
}

function restartGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.rows = 6;
  state.paddle.width = 130;
  state.ball.speed = 420;
  state.paused = false;
  state.gameOver = false;
  resetLevel();
  resetBall();
  message.text = "Press Space to Launch";
  updateUI();
}

window.addEventListener("keydown", (event) => {
  ensureAudio();
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = true;
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = true;
  }
  if (event.code === "Space") {
    launchBall();
  }
  if (event.key.toLowerCase() === "p") {
    if (!state.gameOver) {
      state.paused = !state.paused;
      if (state.paused) {
        message.text = "";
      } else if (state.ball.stuck) {
        message.text = "Press Space to Launch";
      }
    }
  }
  if (event.key.toLowerCase() === "r") {
    restartGame();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = false;
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = false;
  }
});

window.addEventListener("resize", () => {
  resizeGame();
  resetLevel();
  resetBall();
});

resizeGame();
resetLevel();
resetBall();
updateUI();
requestAnimationFrame(tick);
