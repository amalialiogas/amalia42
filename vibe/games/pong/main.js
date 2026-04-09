const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = overlay.querySelector('.overlay-title');
const overlaySub = overlay.querySelector('.overlay-sub');
const scoreLeftEl = document.getElementById('score-left');
const scoreRightEl = document.getElementById('score-right');
const statusEl = document.getElementById('status');
const menu = document.getElementById('menu');
const startBtn = document.getElementById('start-btn');
const musicToggle = document.getElementById('music-toggle');
const sfxToggle = document.getElementById('sfx-toggle');
const menuOptions = Array.from(document.querySelectorAll('.menu-option'));

const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const difficultyPresets = {
  easy: {
    cpuSpeed: 4.2,
    cpuTracking: 0.14,
    ballSpeed: 4.7,
    maxBallSpeed: 10.5,
  },
  medium: {
    cpuSpeed: 5.5,
    cpuTracking: 0.2,
    ballSpeed: 5.5,
    maxBallSpeed: 12.2,
  },
  hard: {
    cpuSpeed: 6.8,
    cpuTracking: 0.3,
    ballSpeed: 6.4,
    maxBallSpeed: 13.6,
  },
};

const config = {
  width: canvas.width,
  height: canvas.height,
  paddleWidth: 12,
  paddleHeight: 92,
  paddleSpeed: 6.2,
  ballRadius: 8,
  ballSpeed: difficultyPresets.medium.ballSpeed,
  maxScore: 10,
  maxBallSpeed: difficultyPresets.medium.maxBallSpeed,
  cpuSpeed: difficultyPresets.medium.cpuSpeed,
  cpuTracking: difficultyPresets.medium.cpuTracking,
};

const settings = {
  mode: 'single',
  difficulty: 'medium',
};

const state = {
  mode: 'menu',
  lastScorer: null,
  serveCooldown: 0,
  cpuEnabled: true,
  cpuDrift: 0,
  cpuDriftTimer: 0,
};

const audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  musicOn: true,
  sfxOn: true,
  unlocked: false,
  musicTimer: null,
  musicStep: 0,
};

const keys = {};

const pointers = {
  left: { id: null, y: null },
  right: { id: null, y: null },
};

const left = {
  x: 32,
  y: (config.height - config.paddleHeight) / 2,
  w: config.paddleWidth,
  h: config.paddleHeight,
  score: 0,
};

const right = {
  x: config.width - 32 - config.paddleWidth,
  y: (config.height - config.paddleHeight) / 2,
  w: config.paddleWidth,
  h: config.paddleHeight,
  score: 0,
};

const ball = {
  x: config.width / 2,
  y: config.height / 2,
  r: config.ballRadius,
  vx: 0,
  vy: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setOverlay(title, subtitle, show) {
  overlayTitle.textContent = title;
  overlaySub.textContent = subtitle || '';
  overlay.classList.toggle('hidden', !show);
}

function showMenu(show) {
  menu.classList.toggle('hidden', !show);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function updateStatus() {
  const modeLabel = settings.mode === 'single' ? 'Single Player' : 'Two Players';
  const difficultyLabel = titleCase(settings.difficulty);
  statusEl.textContent = `Mode: ${modeLabel} | Difficulty: ${difficultyLabel}`;
}

function getOverlayHint() {
  const base = state.cpuEnabled
    ? 'Left: W/S | C: toggle CPU | P: pause | M: menu'
    : 'Left: W/S | Right: Up/Down | C: toggle CPU | P: pause | M: menu';
  return hasTouch ? `${base} | Touch and drag` : base;
}

function resetBall() {
  ball.x = config.width / 2;
  ball.y = config.height / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function serveBall() {
  resetBall();
  const direction = state.lastScorer
    ? state.lastScorer === 'left'
      ? 1
      : -1
    : Math.random() > 0.5
    ? 1
    : -1;

  const angle = (Math.random() * Math.PI) / 6 - Math.PI / 12;
  ball.vx = config.ballSpeed * Math.cos(angle) * direction;
  ball.vy = config.ballSpeed * Math.sin(angle);
  state.serveCooldown = 0.35;
  playSfx('serve');
}

function resetGame() {
  left.score = 0;
  right.score = 0;
  updateScore();
  state.lastScorer = null;
  state.mode = 'idle';
  resetBall();
  setOverlay('Press Space to serve', getOverlayHint(), true);
}

function updateScore() {
  scoreLeftEl.textContent = String(left.score);
  scoreRightEl.textContent = String(right.score);
}

function movePaddle(paddle, direction, speed) {
  if (direction === 0) return;
  paddle.y += direction * speed;
  paddle.y = clamp(paddle.y, 0, config.height - paddle.h);
}

function lerpPaddleTo(paddle, targetY, delta) {
  const desired = clamp(targetY - paddle.h / 2, 0, config.height - paddle.h);
  const smooth = 0.35 * delta;
  paddle.y += (desired - paddle.y) * smooth;
}

function updateCpu(delta) {
  state.cpuDriftTimer -= delta / 60;
  if (state.cpuDriftTimer <= 0) {
    state.cpuDriftTimer = 0.6 + Math.random() * 0.6;
    state.cpuDrift = (Math.random() - 0.5) * 30;
  }

  const target = ball.y - right.h * 0.5 + state.cpuDrift;
  const error = clamp(target - right.y, -config.cpuSpeed, config.cpuSpeed);
  right.y += error * delta * config.cpuTracking;
  right.y = clamp(right.y, 0, config.height - right.h);
}

function updatePaddles(delta) {
  if (pointers.left.id !== null && pointers.left.y !== null) {
    lerpPaddleTo(left, pointers.left.y, delta);
  } else {
    const leftDir = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
    movePaddle(left, leftDir, config.paddleSpeed * delta);
  }

  if (state.cpuEnabled) {
    updateCpu(delta);
  } else if (pointers.right.id !== null && pointers.right.y !== null) {
    lerpPaddleTo(right, pointers.right.y, delta);
  } else {
    const rightDir = (keys['ArrowDown'] ? 1 : 0) - (keys['ArrowUp'] ? 1 : 0);
    movePaddle(right, rightDir, config.paddleSpeed * delta);
  }
}

function paddleCollision(paddle, isLeft) {
  const withinY = ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h;
  const withinX = isLeft
    ? ball.x - ball.r <= paddle.x + paddle.w && ball.x > paddle.x
    : ball.x + ball.r >= paddle.x && ball.x < paddle.x + paddle.w;

  if (!withinX || !withinY) return false;

  const impact = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  const clampedImpact = clamp(impact, -1, 1);
  const speed = clamp(Math.hypot(ball.vx, ball.vy) + 0.45, config.ballSpeed, config.maxBallSpeed);
  const angle = clampedImpact * (Math.PI / 3);
  const direction = isLeft ? 1 : -1;

  ball.vx = speed * Math.cos(angle) * direction;
  ball.vy = speed * Math.sin(angle);
  playSfx('paddle');
  return true;
}

function score(pointForLeft) {
  if (pointForLeft) {
    left.score += 1;
    state.lastScorer = 'left';
  } else {
    right.score += 1;
    state.lastScorer = 'right';
  }
  updateScore();
  playSfx('score');

  if (left.score >= config.maxScore || right.score >= config.maxScore) {
    const winner = left.score > right.score ? 'Left player wins' : 'Right player wins';
    state.mode = 'gameover';
    setOverlay(`${winner} - Press Space to restart`, 'Press M for menu', true);
    playSfx('win');
    resetBall();
  } else {
    state.mode = 'idle';
    setOverlay('Press Space to serve', getOverlayHint(), true);
    resetBall();
  }
}

function updateBall(delta) {
  if (state.serveCooldown > 0) {
    state.serveCooldown = Math.max(0, state.serveCooldown - delta / 60);
    return;
  }

  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;

  if (ball.y - ball.r <= 0 && ball.vy < 0) {
    ball.y = ball.r;
    ball.vy *= -1;
    playSfx('wall');
  }

  if (ball.y + ball.r >= config.height && ball.vy > 0) {
    ball.y = config.height - ball.r;
    ball.vy *= -1;
    playSfx('wall');
  }

  if (ball.vx < 0) {
    paddleCollision(left, true);
  } else {
    paddleCollision(right, false);
  }

  if (ball.x + ball.r < 0) {
    score(false);
  }

  if (ball.x - ball.r > config.width) {
    score(true);
  }
}

function drawNet() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(config.width / 2, 0);
  ctx.lineTo(config.width / 2, config.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawBall() {
  ctx.fillStyle = '#f5d36a';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, config.width, config.height);
  drawNet();
  drawRect(left.x, left.y, left.w, left.h, '#f2f5fb');
  drawRect(right.x, right.y, right.w, right.h, '#f2f5fb');
  drawBall();
}

let lastTime = 0;
function loop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 16.6667, 2);
  lastTime = timestamp;

  updatePaddles(delta);

  if (state.mode === 'playing') {
    updateBall(delta);
  }

  draw();
  requestAnimationFrame(loop);
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    setOverlay('Paused', 'Press P to resume', true);
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    setOverlay('', '', false);
  }
}

function startServe() {
  if (state.mode === 'idle') {
    serveBall();
    state.mode = 'playing';
    setOverlay('', '', false);
  }
}

function applySettings() {
  const preset = difficultyPresets[settings.difficulty];
  config.ballSpeed = preset.ballSpeed;
  config.maxBallSpeed = preset.maxBallSpeed;
  config.cpuSpeed = preset.cpuSpeed;
  config.cpuTracking = preset.cpuTracking;
  state.cpuEnabled = settings.mode === 'single';
  updateStatus();
  setOverlay('Press Space to serve', getOverlayHint(), true);
}

function setOptionActive(value, keyName) {
  menuOptions.forEach((button) => {
    if (!button.dataset[keyName]) return;
    const isActive = button.dataset[keyName] === value;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function openMenu() {
  state.mode = 'menu';
  showMenu(true);
  setOverlay('', '', false);
}

function closeMenu() {
  showMenu(false);
  resetGame();
}

function handleKeyDown(event) {
  keys[event.code] = true;
  unlockAudio();

  if (event.code === 'Space') {
    if (state.mode === 'gameover') {
      resetGame();
      serveBall();
      state.mode = 'playing';
      setOverlay('', '', false);
      return;
    }
    if (state.mode === 'paused') {
      togglePause();
      return;
    }
    if (state.mode === 'menu') {
      closeMenu();
      serveBall();
      state.mode = 'playing';
      setOverlay('', '', false);
      return;
    }
    startServe();
  }

  if (event.code === 'KeyP') {
    togglePause();
  }

  if (event.code === 'KeyC') {
    state.cpuEnabled = !state.cpuEnabled;
    settings.mode = state.cpuEnabled ? 'single' : 'multi';
    updateStatus();
    setOverlay(overlayTitle.textContent, getOverlayHint(), overlay.classList.contains('hidden') === false);
  }

  if (event.code === 'KeyM') {
    openMenu();
  }
}

function handleKeyUp(event) {
  keys[event.code] = false;
}

function toGameCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = config.width / rect.width;
  const scaleY = config.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    width: rect.width,
  };
}

function assignPointer(event) {
  const coords = toGameCoords(event.clientX, event.clientY);
  const isLeftSide = coords.x < config.width / 2;

  if (isLeftSide) {
    pointers.left.id = event.pointerId;
    pointers.left.y = coords.y;
  } else if (!state.cpuEnabled) {
    pointers.right.id = event.pointerId;
    pointers.right.y = coords.y;
  }
}

function updatePointer(event) {
  const coords = toGameCoords(event.clientX, event.clientY);
  if (event.pointerId === pointers.left.id) {
    pointers.left.y = coords.y;
  }
  if (event.pointerId === pointers.right.id) {
    pointers.right.y = coords.y;
  }
}

function clearPointer(event) {
  if (event.pointerId === pointers.left.id) {
    pointers.left.id = null;
    pointers.left.y = null;
  }
  if (event.pointerId === pointers.right.id) {
    pointers.right.id = null;
    pointers.right.y = null;
  }
}

function handlePointerDown(event) {
  unlockAudio();
  assignPointer(event);
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  updatePointer(event);
}

function handlePointerUp(event) {
  clearPointer(event);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function initAudio() {
  if (audio.ctx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new AudioContext();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.85;
  audio.master.connect(audio.ctx.destination);

  audio.musicGain = audio.ctx.createGain();
  audio.musicGain.gain.value = audio.musicOn ? 0.22 : 0;
  audio.musicGain.connect(audio.master);

  audio.sfxGain = audio.ctx.createGain();
  audio.sfxGain.gain.value = audio.sfxOn ? 0.6 : 0;
  audio.sfxGain.connect(audio.master);
}

function unlockAudio() {
  if (audio.unlocked) return;
  initAudio();
  audio.ctx.resume();
  audio.unlocked = true;
  if (audio.musicOn) startMusic();
}

function playTone(frequency, time, duration, volume, channel) {
  if (!audio.ctx) return;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.frequency.value = frequency;
  osc.type = channel === 'music' ? 'triangle' : 'square';

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  osc.connect(gain);
  if (channel === 'music') {
    gain.connect(audio.musicGain);
  } else {
    gain.connect(audio.sfxGain);
  }
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

function startMusic() {
  if (!audio.unlocked || !audio.musicOn || audio.musicTimer) return;
  const tempo = 96;
  const beat = 60 / tempo;
  const pattern = [261.63, 329.63, 392, 349.23, 293.66, 392, 440, 392];

  audio.musicTimer = setInterval(() => {
    if (!audio.musicOn || !audio.ctx) return;
    const now = audio.ctx.currentTime + 0.02;
    const note = pattern[audio.musicStep % pattern.length];
    playTone(note, now, beat * 0.8, 0.16, 'music');
    audio.musicStep += 1;
  }, beat * 1000);
}

function stopMusic() {
  if (audio.musicTimer) {
    clearInterval(audio.musicTimer);
    audio.musicTimer = null;
  }
}

function playSfx(type) {
  if (!audio.unlocked || !audio.sfxOn) return;
  const now = audio.ctx.currentTime + 0.005;

  if (type === 'paddle') {
    playTone(520, now, 0.08, 0.2, 'sfx');
  } else if (type === 'wall') {
    playTone(420, now, 0.06, 0.18, 'sfx');
  } else if (type === 'score') {
    playTone(240, now, 0.18, 0.25, 'sfx');
    playTone(320, now + 0.08, 0.18, 0.22, 'sfx');
  } else if (type === 'serve') {
    playTone(360, now, 0.08, 0.18, 'sfx');
  } else if (type === 'win') {
    playTone(520, now, 0.25, 0.3, 'sfx');
    playTone(640, now + 0.12, 0.22, 0.25, 'sfx');
    playTone(760, now + 0.22, 0.2, 0.22, 'sfx');
  }
}

menuOptions.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.mode) {
      settings.mode = button.dataset.mode;
      setOptionActive(settings.mode, 'mode');
      return;
    }
    if (button.dataset.difficulty) {
      settings.difficulty = button.dataset.difficulty;
      setOptionActive(settings.difficulty, 'difficulty');
    }
  });
});

startBtn.addEventListener('click', () => {
  unlockAudio();
  applySettings();
  closeMenu();
  serveBall();
  state.mode = 'playing';
  setOverlay('', '', false);
});

musicToggle.addEventListener('change', (event) => {
  audio.musicOn = event.target.checked;
  if (audio.musicGain) {
    audio.musicGain.gain.value = audio.musicOn ? 0.22 : 0;
  }
  if (audio.musicOn) {
    startMusic();
  } else {
    stopMusic();
  }
});

sfxToggle.addEventListener('change', (event) => {
  audio.sfxOn = event.target.checked;
  if (audio.sfxGain) {
    audio.sfxGain.gain.value = audio.sfxOn ? 0.6 : 0;
  }
});

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);

setOptionActive(settings.mode, 'mode');
setOptionActive(settings.difficulty, 'difficulty');
updateStatus();
showMenu(true);
setOverlay('', '', false);
resetBall();
requestAnimationFrame(loop);
