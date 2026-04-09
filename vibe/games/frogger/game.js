const TILE = 48;
const COLS = 13;
const ROWS = 13;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

const START_COL = Math.floor(COLS / 2);
const START_ROW = ROWS - 1;
const HOME_COLS = [1, 3, 6, 9, 11];
const HOME_X = HOME_COLS.map((col) => col * TILE + TILE / 2);
const ROAD_ROWS = new Set([7, 8, 9, 10, 11]);
const RIVER_ROWS = new Set([1, 2, 3, 4, 5]);

const laneBlueprints = [
  { row: 11, type: "road", dir: 1, speed: 110, size: 1.6, gap: 1.8, color: "#dc4b3e" },
  { row: 10, type: "road", dir: -1, speed: 150, size: 1.15, gap: 2.1, color: "#f59f0b" },
  { row: 9, type: "road", dir: 1, speed: 185, size: 1.05, gap: 1.8, color: "#22b8cf" },
  { row: 8, type: "road", dir: -1, speed: 135, size: 1.85, gap: 2.7, color: "#9b5de5" },
  { row: 7, type: "road", dir: 1, speed: 220, size: 1.0, gap: 1.9, color: "#2fb344" },
  { row: 5, type: "river", dir: -1, speed: 68, size: 2.8, gap: 1.8, color: "#8c6239" },
  { row: 4, type: "river", dir: 1, speed: 92, size: 2.1, gap: 2.4, color: "#7a4f2a" },
  { row: 3, type: "river", dir: -1, speed: 74, size: 3.2, gap: 1.9, color: "#916534" },
  { row: 2, type: "river", dir: 1, speed: 106, size: 1.8, gap: 2.5, color: "#6e4728" },
  { row: 1, type: "river", dir: -1, speed: 124, size: 2.4, gap: 2.2, color: "#84532b" },
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const messageEl = document.getElementById("message");
const timerBarEl = document.getElementById("timerBar");
const muteBtn = document.getElementById("muteBtn");
const restartBtn = document.getElementById("restartBtn");

class SoundFX {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.master = null;
  }

  ensureContext() {
    if (this.muted) {
      return false;
    }

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return false;
      }

      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    return true;
  }

  setMuted(nextMuted) {
    this.muted = nextMuted;
  }

  tone(frequency, duration, options = {}, startOffset = 0) {
    if (!this.ensureContext()) {
      return;
    }

    const now = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = options.type || "square";
    osc.frequency.setValueAtTime(frequency, now);

    if (options.slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.slide), now + duration);
    }

    const peak = options.volume || 0.25;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.master);

    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  sequence(steps) {
    let t = 0;
    for (const step of steps) {
      this.tone(step.freq, step.duration, step.options, t);
      t += step.gap || step.duration;
    }
  }

  jump() {
    this.tone(650, 0.08, { type: "square", slide: 860, volume: 0.14 });
  }

  hit() {
    this.sequence([
      { freq: 180, duration: 0.11, options: { type: "sawtooth", slide: 120, volume: 0.2 } },
      { freq: 130, duration: 0.1, options: { type: "triangle", slide: 85, volume: 0.15 }, gap: 0.05 },
    ]);
  }

  drown() {
    this.sequence([
      { freq: 390, duration: 0.12, options: { type: "triangle", slide: 240, volume: 0.2 } },
      { freq: 250, duration: 0.18, options: { type: "sine", slide: 70, volume: 0.14 }, gap: 0.08 },
    ]);
  }

  home() {
    this.sequence([
      { freq: 523, duration: 0.08, options: { type: "square", volume: 0.13 } },
      { freq: 659, duration: 0.09, options: { type: "square", volume: 0.13 }, gap: 0.06 },
      { freq: 784, duration: 0.13, options: { type: "triangle", volume: 0.15 }, gap: 0.07 },
    ]);
  }

  levelUp() {
    this.sequence([
      { freq: 392, duration: 0.09, options: { type: "square", volume: 0.14 } },
      { freq: 523, duration: 0.09, options: { type: "square", volume: 0.14 }, gap: 0.06 },
      { freq: 659, duration: 0.1, options: { type: "square", volume: 0.14 }, gap: 0.06 },
      { freq: 1046, duration: 0.22, options: { type: "triangle", volume: 0.17 }, gap: 0.08 },
    ]);
  }

  gameOver() {
    this.sequence([
      { freq: 220, duration: 0.15, options: { type: "sawtooth", slide: 180, volume: 0.18 } },
      { freq: 180, duration: 0.17, options: { type: "triangle", slide: 130, volume: 0.17 }, gap: 0.06 },
      { freq: 130, duration: 0.25, options: { type: "sine", slide: 70, volume: 0.2 }, gap: 0.1 },
    ]);
  }
}

const sounds = new SoundFX();

const state = {
  score: 0,
  level: 1,
  lives: 3,
  status: "playing",
  roundDuration: 30,
  timeLeft: 30,
  homes: Array(HOME_X.length).fill(false),
  lanes: [],
  laneByRow: new Map(),
  frog: {
    x: START_COL * TILE + TILE / 2,
    y: START_ROW * TILE + TILE / 2,
    width: TILE * 0.62,
    height: TILE * 0.62,
  },
  respawnTimer: 0,
  notice: "",
  noticeTimer: 0,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rowFromY(y) {
  return Math.floor(y / TILE);
}

function frogBounds() {
  const { x, y, width, height } = state.frog;
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
  };
}

function setNotice(text, duration = 1.2) {
  state.notice = text;
  state.noticeTimer = duration;
}

function buildLanes(level) {
  const multiplier = 0.6 + (level - 1) * 0.14;

  return laneBlueprints.map((blueprint, i) => {
    const spacing = (blueprint.size + blueprint.gap) * TILE;
    const count = Math.ceil((WIDTH + spacing * 2) / spacing) + 2;
    const loopLength = spacing * count;
    const laneSpeed = blueprint.speed * multiplier;
    const objects = [];
    const offset = ((i * 0.37) % 1) * spacing;

    for (let index = 0; index < count; index += 1) {
      objects.push({
        x: -spacing + offset + index * spacing,
        width: blueprint.size * TILE,
      });
    }

    return {
      ...blueprint,
      speed: laneSpeed,
      spacing,
      loopLength,
      objects,
    };
  });
}

function refreshLaneMap() {
  state.laneByRow.clear();
  for (const lane of state.lanes) {
    state.laneByRow.set(lane.row, lane);
  }
}

function resetFrog() {
  state.frog.x = START_COL * TILE + TILE / 2;
  state.frog.y = START_ROW * TILE + TILE / 2;
  state.timeLeft = state.roundDuration;
}

function startGame() {
  state.score = 0;
  state.level = 1;
  state.lives = 3;
  state.status = "playing";
  state.roundDuration = 30;
  state.timeLeft = state.roundDuration;
  state.homes.fill(false);
  state.lanes = buildLanes(state.level);
  refreshLaneMap();
  state.notice = "";
  state.noticeTimer = 0;
  resetFrog();
}

function advanceLevel() {
  state.level += 1;
  state.score += 500;
  state.roundDuration = Math.max(18, 30 - (state.level - 1));
  state.homes.fill(false);
  state.lanes = buildLanes(state.level);
  refreshLaneMap();
  setNotice(`Level ${state.level}`);
  sounds.levelUp();
  resetFrog();
}

function loseLife(reason) {
  if (state.status !== "playing") {
    return;
  }

  state.lives -= 1;

  if (state.lives <= 0) {
    state.status = "gameover";
    state.notice = "Game over. Press Enter or Restart.";
    state.noticeTimer = 9999;
    sounds.gameOver();
    return;
  }

  state.status = "respawning";
  state.respawnTimer = 1;

  if (reason === "hit") {
    setNotice("Splat! Watch the traffic.");
    sounds.hit();
  } else if (reason === "timeout") {
    setNotice("Time up! Move faster.");
    sounds.drown();
  } else {
    setNotice("Splash! Stay on the logs.");
    sounds.drown();
  }
}

function moveFrog(dx, dy) {
  if (state.status !== "playing") {
    return;
  }

  const nextX = state.frog.x + dx * TILE;
  const nextY = state.frog.y + dy * TILE;

  if (
    nextX < TILE / 2 ||
    nextX > WIDTH - TILE / 2 ||
    nextY < TILE / 2 ||
    nextY > HEIGHT - TILE / 2
  ) {
    return;
  }

  if (dy < 0) {
    state.score += 10;
  }

  state.frog.x = nextX;
  state.frog.y = nextY;
  sounds.jump();
}

function resolveHomeLanding() {
  const slotIndex = HOME_X.findIndex((slotX) => Math.abs(state.frog.x - slotX) < TILE * 0.38);

  if (slotIndex === -1 || state.homes[slotIndex]) {
    loseLife("drown");
    return;
  }

  state.homes[slotIndex] = true;
  state.score += 150 + Math.floor(state.timeLeft * 3);
  setNotice("Home secured!");
  sounds.home();

  if (state.homes.every(Boolean)) {
    advanceLevel();
    return;
  }

  resetFrog();
}

function updateLanes(dt) {
  for (const lane of state.lanes) {
    for (const obj of lane.objects) {
      obj.x += lane.dir * lane.speed * dt;

      if (lane.dir > 0 && obj.x > WIDTH + lane.spacing) {
        obj.x -= lane.loopLength;
      }

      if (lane.dir < 0 && obj.x + obj.width < -lane.spacing) {
        obj.x += lane.loopLength;
      }
    }
  }
}

function checkLaneInteractions(dt) {
  if (state.status !== "playing") {
    return;
  }

  const row = rowFromY(state.frog.y);
  const lane = state.laneByRow.get(row);

  if (ROAD_ROWS.has(row)) {
    if (!lane) {
      return;
    }

    const frog = frogBounds();
    const hit = lane.objects.some((obj) => frog.right > obj.x + 5 && frog.left < obj.x + obj.width - 5);
    if (hit) {
      loseLife("hit");
    }
    return;
  }

  if (RIVER_ROWS.has(row)) {
    if (!lane) {
      loseLife("drown");
      return;
    }

    const frog = frogBounds();
    const support = lane.objects.find((obj) => frog.right > obj.x + 8 && frog.left < obj.x + obj.width - 8);

    if (!support) {
      loseLife("drown");
      return;
    }

    state.frog.x += lane.dir * lane.speed * dt;
    if (state.frog.x < TILE / 2 || state.frog.x > WIDTH - TILE / 2) {
      loseLife("drown");
    }
  }
}

function updateGame(dt) {
  updateLanes(dt);

  if (state.status === "playing") {
    state.timeLeft = clamp(state.timeLeft - dt, 0, state.roundDuration);

    if (state.timeLeft <= 0) {
      loseLife("timeout");
    }

    checkLaneInteractions(dt);

    if (state.status === "playing" && rowFromY(state.frog.y) === 0) {
      resolveHomeLanding();
    }
  } else if (state.status === "respawning") {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) {
      state.status = "playing";
      resetFrog();
    }
  }

  if (state.noticeTimer > 0) {
    state.noticeTimer -= dt;
    if (state.noticeTimer <= 0 && state.status !== "gameover") {
      state.notice = "";
    }
  }

  updateHud();
}

function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBoard() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#11496c";
  ctx.fillRect(0, 0, WIDTH, TILE * 6);

  ctx.fillStyle = "#2f6f2f";
  ctx.fillRect(0, TILE * 6, WIDTH, TILE);
  ctx.fillRect(0, TILE * 12, WIDTH, TILE);

  ctx.fillStyle = "#2b2d33";
  ctx.fillRect(0, TILE * 7, WIDTH, TILE * 5);

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  for (let i = 8; i <= 11; i += 1) {
    ctx.fillRect(0, i * TILE - 1, WIDTH, 2);
  }

  for (let row = 0; row < ROWS; row += 1) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(0, row * TILE, WIDTH, 1);
  }
}

function drawHomes() {
  for (let i = 0; i < HOME_X.length; i += 1) {
    const x = HOME_X[i];
    const y = TILE / 2;
    const filled = state.homes[i];

    ctx.beginPath();
    ctx.arc(x, y, TILE * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = filled ? "#7ef06b" : "#325f2d";
    ctx.fill();

    if (filled) {
      ctx.beginPath();
      ctx.arc(x - 8, y - 10, 5, 0, Math.PI * 2);
      ctx.arc(x + 8, y - 10, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x - 8, y - 10, 2.5, 0, Math.PI * 2);
      ctx.arc(x + 8, y - 10, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#1d2531";
      ctx.fill();
    }
  }
}

function drawLanes() {
  for (const lane of state.lanes) {
    for (const obj of lane.objects) {
      if (lane.type === "road") {
        drawRoundedRect(obj.x, lane.row * TILE + TILE * 0.2, obj.width, TILE * 0.6, 7);
        ctx.fillStyle = lane.color;
        ctx.fill();

        drawRoundedRect(obj.x + 6, lane.row * TILE + TILE * 0.28, obj.width - 12, TILE * 0.22, 4);
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fill();
      } else {
        drawRoundedRect(obj.x, lane.row * TILE + TILE * 0.24, obj.width, TILE * 0.52, 8);
        ctx.fillStyle = lane.color;
        ctx.fill();

        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        for (let mark = 0; mark < obj.width; mark += 18) {
          ctx.fillRect(obj.x + mark, lane.row * TILE + TILE * 0.31, 9, 2);
        }
      }
    }
  }
}

function drawFrog() {
  if (state.status === "respawning" && Math.floor(state.respawnTimer * 12) % 2 === 0) {
    return;
  }

  const { x, y } = state.frog;

  ctx.beginPath();
  ctx.ellipse(x, y + 1, TILE * 0.24, TILE * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#79f765";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(x - 11, y - 10, 7, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 11, y - 10, 7, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#9eff8f";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - 11, y - 10, 2.7, 0, Math.PI * 2);
  ctx.arc(x + 11, y - 10, 2.7, 0, Math.PI * 2);
  ctx.fillStyle = "#12232c";
  ctx.fill();
}

function render() {
  drawBoard();
  drawHomes();
  drawLanes();
  drawFrog();
}

function updateHud() {
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  levelEl.textContent = state.level;

  timerBarEl.style.width = `${Math.max(0, (state.timeLeft / state.roundDuration) * 100)}%`;

  if (state.status === "gameover") {
    messageEl.textContent = state.notice;
    return;
  }

  if (state.notice) {
    messageEl.textContent = state.notice;
    return;
  }

  messageEl.textContent = "Reach all five home pads to clear the level.";
}

const keyMap = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

function handleMoveDirection(direction) {
  sounds.ensureContext();

  if (direction === "up") {
    moveFrog(0, -1);
  } else if (direction === "down") {
    moveFrog(0, 1);
  } else if (direction === "left") {
    moveFrog(-1, 0);
  } else if (direction === "right") {
    moveFrog(1, 0);
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === "Enter" && state.status === "gameover") {
    startGame();
    return;
  }

  const move = keyMap[key];
  if (!move) {
    return;
  }

  event.preventDefault();
  sounds.ensureContext();
  moveFrog(move[0], move[1]);
});

for (const button of document.querySelectorAll("[data-dir]")) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleMoveDirection(button.dataset.dir);
  });
}

canvas.addEventListener("pointerdown", () => {
  sounds.ensureContext();
});

muteBtn.addEventListener("click", () => {
  const nextMuted = !sounds.muted;
  sounds.setMuted(nextMuted);
  muteBtn.textContent = nextMuted ? "Sound: Off" : "Sound: On";
  if (!nextMuted) {
    sounds.ensureContext();
  }
});

restartBtn.addEventListener("click", () => {
  sounds.ensureContext();
  startGame();
});

startGame();
updateHud();

let previousTime = 0;

function gameLoop(timestamp) {
  if (!previousTime) {
    previousTime = timestamp;
  }

  const deltaSeconds = Math.min((timestamp - previousTime) / 1000, 0.05);
  previousTime = timestamp;

  updateGame(deltaSeconds);
  render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
