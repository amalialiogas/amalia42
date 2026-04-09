const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");

const startBtn = document.getElementById("start");
const pauseBtn = document.getElementById("pause");
const resetBtn = document.getElementById("reset");
const soundBtn = document.getElementById("sound");
const ufoAudio = document.getElementById("ufo-audio");
const fastInvaderAudio = document.getElementById("fast-invader-audio");
const playerExplosionAudio = document.getElementById("player-explosion-audio");

const keys = new Set();
let lastTime = 0;

const GAME = {
  running: false,
  paused: false,
  score: 0,
  lives: 3,
  level: 1,
  stars: [],
  soundOn: true,
  audioReady: false,
};

const SPRITE_SCALE = 3;

const SPRITES = {
  alienTop: [
    "00010001000",
    "00111011100",
    "01111111110",
    "11011111111",
    "11111111111",
    "10101110101",
    "00010001000",
    "00100000100",
  ],
  alienMid: [
    "00100000100",
    "00010001000",
    "00111111100",
    "01101110110",
    "11111111111",
    "10111111101",
    "10100000101",
    "00011011000",
  ],
  alienBottom: [
    "00011111000",
    "00111111100",
    "01101110110",
    "11111111111",
    "11011111011",
    "11010001011",
    "00111011100",
    "01000100010",
  ],
  player: [
    "0000011100000",
    "0000111110000",
    "0001111111000",
    "0011111111100",
    "0111111111110",
    "1111111111111",
    "1111111111111",
    "0011111111100",
  ],
  ufo: [
    "0001111110000",
    "0111111111100",
    "1111111111110",
    "0111111111100",
    "0001111110000",
  ],
};

function spriteSize(sprite) {
  return { width: sprite[0].length * SPRITE_SCALE, height: sprite.length * SPRITE_SCALE };
}

function drawSprite(sprite, x, y, color) {
  ctx.fillStyle = color;
  for (let row = 0; row < sprite.length; row += 1) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] === "1") {
        ctx.fillRect(
          x + col * SPRITE_SCALE,
          y + row * SPRITE_SCALE,
          SPRITE_SCALE,
          SPRITE_SCALE
        );
      }
    }
  }
}

const playerSpriteSize = spriteSize(SPRITES.player);

const PLAYER = {
  width: playerSpriteSize.width,
  height: playerSpriteSize.height,
  x: canvas.width / 2 - playerSpriteSize.width / 2,
  y: canvas.height - 70,
  speed: 360,
  cooldown: 0,
};

const LEVEL_SETTINGS = {
  baseAlienSpeed: 32,
  baseDrop: 24,
  baseShotRate: 0.0045,
};

let aliens = [];
let playerShots = [];
let alienShots = [];
let shields = [];
let ufo = null;
let ufoTimer = 0;
let popups = [];
let lastHudScore = null;
let lastHudLives = null;
let lastHudLevel = null;
let lastAlienSfxPlayed = false;
let lastInvaderLooping = false;
let alienDir = 1;
let alienSpeed = LEVEL_SETTINGS.baseAlienSpeed;
let alienDrop = LEVEL_SETTINGS.baseDrop;
let alienShotRate = LEVEL_SETTINGS.baseShotRate;
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  GAME.audioReady = true;
}

function startUfoLoop() {
  if (!ufoAudio || !GAME.soundOn) return;
  ufoAudio.currentTime = 0;
  const playPromise = ufoAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function stopUfoLoop() {
  if (!ufoAudio) return;
  ufoAudio.pause();
  ufoAudio.currentTime = 0;
}

function startLastInvaderLoop() {
  if (!fastInvaderAudio || !GAME.soundOn) return;
  fastInvaderAudio.currentTime = 0;
  const playPromise = fastInvaderAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function stopLastInvaderLoop() {
  if (!fastInvaderAudio) return;
  fastInvaderAudio.pause();
  fastInvaderAudio.currentTime = 0;
}

function playPlayerExplosion() {
  if (!playerExplosionAudio || !GAME.soundOn) return;
  playerExplosionAudio.currentTime = 0;
  const playPromise = playerExplosionAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function playTone({ freq = 440, duration = 0.1, type = "square", gain = 0.08, sweep }) {
  if (!GAME.soundOn || !GAME.audioReady || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (sweep) {
    osc.frequency.exponentialRampToValueAtTime(
      sweep,
      audioCtx.currentTime + duration
    );
  }
  amp.gain.setValueAtTime(gain, audioCtx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const SFX = {
  shoot: () => playTone({ freq: 680, duration: 0.06, type: "square", gain: 0.06, sweep: 420 }),
  alienHit: () => playTone({ freq: 220, duration: 0.08, type: "sawtooth", gain: 0.08, sweep: 160 }),
  playerHit: () => playTone({ freq: 140, duration: 0.18, type: "triangle", gain: 0.1, sweep: 90 }),
  levelUp: () => playTone({ freq: 520, duration: 0.14, type: "square", gain: 0.08, sweep: 920 }),
  gameOver: () => playTone({ freq: 200, duration: 0.4, type: "sine", gain: 0.1, sweep: 90 }),
  ufo: () => playTone({ freq: 980, duration: 0.2, type: "sawtooth", gain: 0.07, sweep: 520 }),
  lastAlien: () => playTone({ freq: 760, duration: 0.18, type: "square", gain: 0.08, sweep: 980 }),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function createStars() {
  GAME.stars = [];
}

function spawnAliens() {
  aliens = [];
  const rows = 5;
  const cols = 11;
  const paddingX = 12;
  const paddingY = 14;
  const startX = 70;
  const startY = 120;
  const topSize = spriteSize(SPRITES.alienTop);
  const midSize = spriteSize(SPRITES.alienMid);
  const bottomSize = spriteSize(SPRITES.alienBottom);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let sprite = SPRITES.alienBottom;
      let size = bottomSize;
      if (row === 0) {
        sprite = SPRITES.alienTop;
        size = topSize;
      } else if (row === 1 || row === 2) {
        sprite = SPRITES.alienMid;
        size = midSize;
      }
      aliens.push({
        x: startX + col * (size.width + paddingX),
        y: startY + row * (size.height + paddingY),
        width: size.width,
        height: size.height,
        sprite,
        row,
        alive: true,
      });
    }
  }

  alienDir = 1;
  const speedScale = 1 + (GAME.level - 1) * 0.25;
  alienSpeed = LEVEL_SETTINGS.baseAlienSpeed * speedScale;
  alienDrop = LEVEL_SETTINGS.baseDrop + GAME.level * 2;
  alienShotRate = LEVEL_SETTINGS.baseShotRate + GAME.level * 0.00085;
}

function spawnShields() {
  shields = [];
  const blockWidth = 10;
  const blockHeight = 8;
  const shieldWidth = blockWidth * 8;
  const shieldHeight = blockHeight * 5;
  const gap = (canvas.width - shieldWidth * 4) / 5;
  const baseY = PLAYER.y - 90;

  for (let s = 0; s < 4; s += 1) {
    const baseX = gap + s * (shieldWidth + gap);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const cutout =
          (row === 4 && (col === 0 || col === 7)) ||
          (row === 3 && (col === 0 || col === 7)) ||
          (row === 4 && (col >= 3 && col <= 4));

        if (cutout) continue;

        shields.push({
          x: baseX + col * blockWidth,
          y: baseY + row * blockHeight,
          width: blockWidth - 1,
          height: blockHeight - 1,
          hp: 3,
        });
      }
    }
  }
}

function resetPlayer() {
  PLAYER.x = canvas.width / 2 - PLAYER.width / 2;
  PLAYER.y = canvas.height - 70;
  PLAYER.cooldown = 0;
}

function resetGame() {
  GAME.score = 0;
  GAME.lives = 3;
  GAME.level = 1;
  playerShots = [];
  alienShots = [];
  ufo = null;
  ufoTimer = rand(6, 12);
  lastHudScore = null;
  lastHudLives = null;
  lastHudLevel = null;
  lastAlienSfxPlayed = false;
  lastInvaderLooping = false;
  stopUfoLoop();
  stopLastInvaderLoop();
  resetPlayer();
  spawnAliens();
  spawnShields();
  updateHud();
}

function updateHud() {
  if (GAME.score !== lastHudScore) {
    if (scoreEl) scoreEl.textContent = GAME.score;
    lastHudScore = GAME.score;
  }
  if (GAME.lives !== lastHudLives) {
    if (livesEl) {
      livesEl.innerHTML = "";
      for (let i = 0; i < GAME.lives; i += 1) {
        const icon = document.createElement("span");
        icon.className = "life-icon";
        livesEl.appendChild(icon);
      }
    }
    lastHudLives = GAME.lives;
  }
  if (GAME.level !== lastHudLevel) {
    if (levelEl) levelEl.textContent = GAME.level;
    lastHudLevel = GAME.level;
  }
}

function firePlayerShot() {
  if (PLAYER.cooldown > 0) return;
  playerShots.push({
    x: PLAYER.x + PLAYER.width / 2 - 2,
    y: PLAYER.y - 10,
    width: 4,
    height: 12,
    dy: -520,
  });
  SFX.shoot();
  PLAYER.cooldown = 0.28;
}

function fireAlienShot(alien) {
  alienShots.push({
    x: alien.x + alien.width / 2 - 2,
    y: alien.y + alien.height + 4,
    width: 4,
    height: 12,
    dy: 300 + GAME.level * 18,
  });
}

function handleInput(dt) {
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");

  if (left) PLAYER.x -= PLAYER.speed * dt;
  if (right) PLAYER.x += PLAYER.speed * dt;

  PLAYER.x = clamp(PLAYER.x, 12, canvas.width - PLAYER.width - 12);

  if (keys.has(" ")) {
    firePlayerShot();
  }
}

function updateStars(dt) {
  void dt;
}

function spawnUfo() {
  const fromLeft = Math.random() < 0.5;
  const size = spriteSize(SPRITES.ufo);
  ufo = {
    x: fromLeft ? -size.width : canvas.width + size.width,
    y: 70,
    width: size.width,
    height: size.height,
    speed: fromLeft ? 120 : -120,
    value: 100 + Math.floor(Math.random() * 4) * 50,
  };
}

function updateAliens(dt) {
  if (!aliens.some((alien) => alien.alive)) return;

  const aliveCount = aliens.filter((alien) => alien.alive).length;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const alien of aliens) {
    if (!alien.alive) continue;
    minX = Math.min(minX, alien.x);
    maxX = Math.max(maxX, alien.x + alien.width);
    maxY = Math.max(maxY, alien.y + alien.height);
  }

  const edgeHit =
    (alienDir === -1 && minX <= 20) ||
    (alienDir === 1 && maxX >= canvas.width - 20);
  const speedBoost = 1 + (1 - aliveRatio()) * 2.2;
  const loneInvaderBoost = aliveCount === 1 ? 2.6 : 1;
  const step = alienSpeed * speedBoost * loneInvaderBoost * dt;

  if (edgeHit) {
    alienDir *= -1;
    for (const alien of aliens) {
      if (alien.alive) alien.y += alienDrop;
    }
  }

  for (const alien of aliens) {
    if (alien.alive) alien.x += step * alienDir;
  }

  if (aliveCount === 1 && !lastAlienSfxPlayed) {
    SFX.lastAlien();
    lastAlienSfxPlayed = true;
  }

  if (aliveCount === 1 && !lastInvaderLooping) {
    startLastInvaderLoop();
    lastInvaderLooping = true;
  }
  if (aliveCount !== 1 && lastInvaderLooping) {
    stopLastInvaderLoop();
    lastInvaderLooping = false;
  }

  if (maxY >= PLAYER.y - 10) {
    GAME.lives = 0;
  }
}

function aliveRatio() {
  const alive = aliens.filter((alien) => alien.alive).length;
  return alive / aliens.length;
}

function updateShots(dt) {
  for (const shot of playerShots) {
    shot.y += shot.dy * dt;
  }
  for (const shot of alienShots) {
    shot.y += shot.dy * dt;
  }

  playerShots = playerShots.filter((shot) => shot.y + shot.height > -20);
  alienShots = alienShots.filter((shot) => shot.y < canvas.height + 30);
}

function updateCollisions() {
  for (const shot of playerShots) {
    if (ufo && rectsOverlap(shot, ufo)) {
      shot.hit = true;
      GAME.score += ufo.value;
      SFX.ufo();
      stopUfoLoop();
      popups.push({
        text: `+${ufo.value}`,
        x: ufo.x + ufo.width / 2,
        y: ufo.y - 6,
        life: 0.8,
        ttl: 0.8,
      });
      ufo = null;
      break;
    }
    for (const shield of shields) {
      if (shield.hp <= 0) continue;
      if (rectsOverlap(shot, shield)) {
        shield.hp -= 1;
        shot.hit = true;
        break;
      }
    }
  }

  for (const shot of playerShots) {
    for (const alien of aliens) {
      if (!alien.alive) continue;
      if (rectsOverlap(shot, alien)) {
        alien.alive = false;
        shot.hit = true;
        SFX.alienHit();
        GAME.score += 10 + (4 - alien.row) * 4;
      }
    }
  }

  playerShots = playerShots.filter((shot) => !shot.hit);

  for (const shot of alienShots) {
    for (const shield of shields) {
      if (shield.hp <= 0) continue;
      if (rectsOverlap(shot, shield)) {
        shield.hp -= 1;
        shot.hit = true;
        break;
      }
    }
    if (shot.hit) continue;
    if (rectsOverlap(shot, { ...PLAYER })) {
      shot.hit = true;
      GAME.lives -= 1;
      SFX.playerHit();
      playPlayerExplosion();
      resetPlayer();
      playerShots = [];
      break;
    }
  }

  alienShots = alienShots.filter((shot) => !shot.hit);
  shields = shields.filter((shield) => shield.hp > 0);

  if (GAME.lives <= 0) {
    GAME.running = false;
    SFX.gameOver();
    stopLastInvaderLoop();
  }

  if (!aliens.some((alien) => alien.alive)) {
    GAME.level += 1;
    spawnAliens();
    spawnShields();
    playerShots = [];
    alienShots = [];
    ufo = null;
    ufoTimer = rand(5, 10);
    lastAlienSfxPlayed = false;
    lastInvaderLooping = false;
    stopLastInvaderLoop();
    SFX.levelUp();
  }
}

function updateAlienFiring(dt) {
  const aliveAliens = aliens.filter((alien) => alien.alive);
  if (aliveAliens.length === 0) return;

  if (Math.random() < alienShotRate * dt * 60) {
    const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
    fireAlienShot(shooter);
  }
}

function updateUfo(dt) {
  if (ufo) {
    const speed = ufo.speed;
    ufo.x += speed * dt;
    if (speed < 0 && ufo.x + ufo.width < -100) {
      ufo = null;
      stopUfoLoop();
      return;
    }
    if (speed > 0 && ufo.x > canvas.width + 100) {
      ufo = null;
      stopUfoLoop();
      return;
    }
    return;
  }

  ufoTimer -= dt;
  if (ufoTimer <= 0) {
    spawnUfo();
    ufoTimer = rand(10, 18);
    startUfoLoop();
  }
}

function updatePopups(dt) {
  for (const popup of popups) {
    popup.life -= dt;
    popup.y -= 18 * dt;
  }
  popups = popups.filter((popup) => popup.life > 0);
}

function updateCooldowns(dt) {
  if (PLAYER.cooldown > 0) {
    PLAYER.cooldown -= dt;
  }
}

function drawStars() {
  return;
}

function drawPlayer() {
  drawSprite(SPRITES.player, PLAYER.x, PLAYER.y, "#42ff42");
}

function drawAliens() {
  for (const alien of aliens) {
    if (!alien.alive) continue;
    drawSprite(alien.sprite, alien.x, alien.y, "#ffffff");
  }
}

function drawUfo() {
  if (!ufo) return;
  drawSprite(SPRITES.ufo, ufo.x, ufo.y, "#ff3b3b");
}

function drawShots() {
  ctx.fillStyle = "#ffffff";
  for (const shot of playerShots) {
    ctx.fillRect(shot.x, shot.y, shot.width, shot.height);
  }
  ctx.fillStyle = "#ffffff";
  for (const shot of alienShots) {
    ctx.fillRect(shot.x, shot.y, shot.width, shot.height);
  }
}

function drawPopups() {
  if (popups.length === 0) return;
  ctx.save();
  ctx.font = "18px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  for (const popup of popups) {
    const alpha = Math.max(popup.life / popup.ttl, 0);
    ctx.fillStyle = `rgba(66, 255, 66, ${alpha})`;
    ctx.fillText(popup.text, popup.x, popup.y);
  }
  ctx.restore();
}

function drawShields() {
  for (const shield of shields) {
    if (shield.hp <= 0) continue;
    const alpha = shield.hp === 3 ? 0.9 : shield.hp === 2 ? 0.6 : 0.4;
    ctx.fillStyle = `rgba(66, 255, 66, ${alpha})`;
    ctx.fillRect(shield.x, shield.y, shield.width, shield.height);
  }
}

function drawOverlay(text) {
  ctx.save();
  ctx.fillStyle = "rgba(9, 13, 24, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e8f0ff";
  ctx.font = "28px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars();
  drawAliens();
  drawUfo();
  drawShots();
  drawShields();
  drawPopups();
  drawPlayer();

  if (!GAME.running) {
    drawOverlay(GAME.lives <= 0 ? "Game Over" : "Press Start");
  } else if (GAME.paused) {
    drawOverlay("Paused");
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;

  if (GAME.running && !GAME.paused) {
    handleInput(dt);
    updateStars(dt);
    updateAliens(dt);
    updateShots(dt);
    updateAlienFiring(dt);
    updateUfo(dt);
    updatePopups(dt);
    updateCollisions();
    updateCooldowns(dt);
    updateHud();
  } else {
    updateStars(dt);
    updatePopups(dt);
  }

  render();
  requestAnimationFrame(loop);
}

function startGame() {
  initAudio();
  if (GAME.lives <= 0) resetGame();
  GAME.running = true;
  GAME.paused = false;
}

function pauseGame() {
  initAudio();
  if (!GAME.running) return;
  GAME.paused = !GAME.paused;
  if (GAME.paused) {
    stopUfoLoop();
    stopLastInvaderLoop();
  } else if (ufo) {
    startUfoLoop();
    if (lastInvaderLooping) startLastInvaderLoop();
  }
}

function init() {
  ctx.imageSmoothingEnabled = false;
  createStars();
  resetGame();
  GAME.running = false;
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);
  initAudio();
  if (event.key === "p" || event.key === "P") {
    pauseGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", pauseGame);
resetBtn.addEventListener("click", () => {
  initAudio();
  resetGame();
  GAME.running = false;
});

soundBtn.addEventListener("click", () => {
  initAudio();
  GAME.soundOn = !GAME.soundOn;
  soundBtn.textContent = `Sound: ${GAME.soundOn ? "On" : "Off"}`;
  soundBtn.classList.toggle("active", GAME.soundOn);
  if (!GAME.soundOn) {
    stopUfoLoop();
    stopLastInvaderLoop();
  } else if (ufo) {
    startUfoLoop();
    if (lastInvaderLooping) startLastInvaderLoop();
  }
});

init();
