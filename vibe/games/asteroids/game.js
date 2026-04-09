const TWO_PI = Math.PI * 2;

const CONFIG = Object.freeze({
  startLives: 3,
  asteroidsPerLevelBase: 3,
  turnSpeed: 4.6,
  thrust: 270,
  drag: 0.986,
  bulletSpeed: 460,
  bulletLife: 1.25,
  fireInterval: 0.16,
  maxBullets: 8,
  asteroidSpeedMin: 24,
  asteroidSpeedMax: 74,
  shipInvulnerability: 2.3,
  shipBlinkRate: 0.1,
  levelIntroDuration: 1.2,
  nextLevelDelay: 1.35,
  scoreBySize: {
    3: 20,
    2: 50,
    1: 100
  }
});

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");

if (!ctx || !scoreEl || !livesEl || !levelEl || !overlay || !overlayText) {
  throw new Error("Failed to initialize required game elements.");
}

const keys = {
  left: false,
  right: false,
  thrust: false,
  fire: false
};

let width = window.innerWidth;
let height = window.innerHeight;
let stars = [];
let game = null;
let lastTime = performance.now();

class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.thrustNodes = null;
    this.lastAsteroidHitAt = 0;
  }

  ensureContext() {
    if (this.context) return this.context;

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.master.gain.setValueAtTime(0.24, this.context.currentTime);
    this.master.connect(this.context.destination);
    return this.context;
  }

  unlock(onUnlocked) {
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === "running") {
      if (typeof onUnlocked === "function") onUnlocked();
      return;
    }

    context.resume().then(() => {
      if (typeof onUnlocked === "function") onUnlocked();
    }).catch(() => {});
  }

  getNoiseBuffer() {
    if (this.noiseBuffer) return this.noiseBuffer;
    const context = this.ensureContext();
    if (!context) return null;

    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, sampleRate, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }

    this.noiseBuffer = buffer;
    return buffer;
  }

  playTone({
    type = "square",
    startFreq = 440,
    endFreq = startFreq,
    duration = 0.1,
    gain = 0.06,
    when = 0,
    attack = 0.004,
    release = 0.04
  }) {
    const context = this.ensureContext();
    if (!context || context.state !== "running" || !this.master) return;

    const startAt = context.currentTime + Math.max(0, when);
    const stopAt = startAt + duration + release + 0.03;
    const peak = Math.max(0.0002, gain);
    const minGain = 0.0001;

    const oscillator = context.createOscillator();
    oscillator.type = type;

    const amp = context.createGain();
    amp.gain.setValueAtTime(minGain, startAt);
    amp.gain.exponentialRampToValueAtTime(peak, startAt + Math.max(0.002, attack));
    amp.gain.exponentialRampToValueAtTime(minGain, startAt + duration + release);

    const safeStartFreq = Math.max(20, startFreq);
    const safeEndFreq = Math.max(20, endFreq);
    oscillator.frequency.setValueAtTime(safeStartFreq, startAt);
    if (Math.abs(safeStartFreq - safeEndFreq) > 1) {
      oscillator.frequency.exponentialRampToValueAtTime(safeEndFreq, startAt + duration);
    }

    oscillator.connect(amp);
    amp.connect(this.master);
    oscillator.start(startAt);
    oscillator.stop(stopAt);
  }

  playNoise({
    duration = 0.12,
    gain = 0.05,
    bandpass = 1100,
    when = 0,
    attack = 0.003,
    release = 0.05
  }) {
    const context = this.ensureContext();
    if (!context || context.state !== "running" || !this.master) return;

    const noise = this.getNoiseBuffer();
    if (!noise) return;

    const startAt = context.currentTime + Math.max(0, when);
    const stopAt = startAt + duration + release + 0.03;
    const peak = Math.max(0.0002, gain);
    const minGain = 0.0001;

    const source = context.createBufferSource();
    source.buffer = noise;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(Math.max(40, bandpass), startAt);
    filter.Q.setValueAtTime(0.9, startAt);

    const amp = context.createGain();
    amp.gain.setValueAtTime(minGain, startAt);
    amp.gain.exponentialRampToValueAtTime(peak, startAt + Math.max(0.002, attack));
    amp.gain.exponentialRampToValueAtTime(minGain, startAt + duration + release);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(startAt);
    source.stop(stopAt);
  }

  shoot() {
    this.playTone({
      type: "square",
      startFreq: 840,
      endFreq: 250,
      duration: 0.07,
      gain: 0.058,
      release: 0.03
    });
  }

  asteroidHit(size) {
    const context = this.ensureContext();
    if (!context || context.state !== "running") return;
    if (context.currentTime - this.lastAsteroidHitAt < 0.022) return;
    this.lastAsteroidHitAt = context.currentTime;

    const bySize = {
      3: { toneStart: 190, toneEnd: 108, toneDuration: 0.14, toneGain: 0.072, noiseFreq: 730 },
      2: { toneStart: 260, toneEnd: 150, toneDuration: 0.11, toneGain: 0.062, noiseFreq: 920 },
      1: { toneStart: 360, toneEnd: 220, toneDuration: 0.09, toneGain: 0.056, noiseFreq: 1180 }
    };
    const sound = bySize[size] || bySize[2];

    this.playTone({
      type: "triangle",
      startFreq: sound.toneStart,
      endFreq: sound.toneEnd,
      duration: sound.toneDuration,
      gain: sound.toneGain,
      release: 0.025
    });
    this.playNoise({
      duration: 0.05,
      gain: 0.018,
      bandpass: sound.noiseFreq,
      release: 0.02
    });
  }

  shipExplode() {
    this.playTone({
      type: "sawtooth",
      startFreq: 220,
      endFreq: 42,
      duration: 0.45,
      gain: 0.092,
      attack: 0.006,
      release: 0.08
    });
    this.playNoise({
      duration: 0.32,
      gain: 0.088,
      bandpass: 240,
      release: 0.07
    });
  }

  gameStart() {
    this.playTone({ type: "square", startFreq: 392, endFreq: 392, duration: 0.08, gain: 0.05, when: 0 });
    this.playTone({ type: "square", startFreq: 523, endFreq: 523, duration: 0.08, gain: 0.05, when: 0.09 });
    this.playTone({ type: "square", startFreq: 659, endFreq: 659, duration: 0.11, gain: 0.055, when: 0.18 });
  }

  levelAdvance() {
    this.playTone({ type: "triangle", startFreq: 460, endFreq: 460, duration: 0.08, gain: 0.05, when: 0 });
    this.playTone({ type: "triangle", startFreq: 620, endFreq: 620, duration: 0.08, gain: 0.052, when: 0.1 });
    this.playTone({ type: "triangle", startFreq: 790, endFreq: 790, duration: 0.11, gain: 0.056, when: 0.2 });
  }

  gameOver() {
    this.playTone({ type: "square", startFreq: 320, endFreq: 320, duration: 0.12, gain: 0.054, when: 0 });
    this.playTone({ type: "square", startFreq: 244, endFreq: 244, duration: 0.12, gain: 0.054, when: 0.14 });
    this.playTone({ type: "square", startFreq: 184, endFreq: 130, duration: 0.24, gain: 0.058, when: 0.28, release: 0.08 });
  }

  setThruster(active) {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const now = context.currentTime;

    if (!active || context.state !== "running") {
      if (!this.thrustNodes) return;
      const thrustNodes = this.thrustNodes;
      this.thrustNodes = null;

      thrustNodes.gain.gain.cancelScheduledValues(now);
      thrustNodes.gain.gain.setValueAtTime(0.025, now);
      thrustNodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      thrustNodes.source.stop(now + 0.08);
      return;
    }

    if (this.thrustNodes) return;

    const noise = this.getNoiseBuffer();
    if (!noise) return;

    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const bandpass = context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(160, now);
    bandpass.Q.setValueAtTime(0.7, now);

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(690, now);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.048, now + 0.06);

    source.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.master);
    source.start(now);

    this.thrustNodes = { source, gain };
  }
}

const sound = new SoundEngine();

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function distanceSq(aX, aY, bX, bY) {
  const dx = aX - bX;
  const dy = aY - bY;
  return dx * dx + dy * dy;
}

function wrap(entity, radius) {
  if (entity.x < -radius) entity.x = width + radius;
  if (entity.x > width + radius) entity.x = -radius;
  if (entity.y < -radius) entity.y = height + radius;
  if (entity.y > height + radius) entity.y = -radius;
}

function createShip() {
  return {
    x: width / 2,
    y: height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: 15,
    invulnerable: CONFIG.shipInvulnerability,
    blinkTimer: 0,
    visible: true
  };
}

function createState() {
  return {
    started: false,
    gameOver: false,
    score: 0,
    lives: CONFIG.startLives,
    level: 1,
    ship: createShip(),
    asteroids: [],
    bullets: [],
    particles: [],
    fireCooldown: 0,
    levelIntro: 0,
    nextLevelTimer: 0
  };
}

function asteroidRadiusForSize(size) {
  if (size === 3) return randomRange(48, 64);
  if (size === 2) return randomRange(30, 41);
  return randomRange(17, 24);
}

function createAsteroid(x, y, size) {
  const speedLow = CONFIG.asteroidSpeedMin + game.level * 5;
  const speedHigh = CONFIG.asteroidSpeedMax + game.level * 8;
  const speedScale = size === 3 ? 1 : size === 2 ? 1.35 : 1.75;
  const heading = randomRange(0, TWO_PI);
  const speed = randomRange(speedLow, speedHigh) * speedScale;
  let spin = randomRange(-1.25, 1.25);
  if (Math.abs(spin) < 0.2) spin = spin < 0 ? -0.2 : 0.2;

  const points = Math.floor(randomRange(9, 14));
  const jag = Array.from({ length: points }, () => randomRange(0.72, 1.23));

  return {
    x,
    y,
    size,
    radius: asteroidRadiusForSize(size),
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    angle: randomRange(0, TWO_PI),
    spin,
    points,
    jag
  };
}

function spawnLevel() {
  game.asteroids.length = 0;
  const targetCount = CONFIG.asteroidsPerLevelBase + game.level;
  const safeDistance = Math.min(Math.max(width, height) * 0.24, 260);

  for (let i = 0; i < targetCount; i += 1) {
    let x = randomRange(0, width);
    let y = randomRange(0, height);
    let attempts = 0;

    while (distanceSq(x, y, game.ship.x, game.ship.y) < safeDistance * safeDistance && attempts < 70) {
      x = randomRange(0, width);
      y = randomRange(0, height);
      attempts += 1;
    }

    game.asteroids.push(createAsteroid(x, y, 3));
  }

  game.levelIntro = CONFIG.levelIntroDuration;
}

function resetShip() {
  game.ship = createShip();
  game.bullets.length = 0;
}

function spawnExplosion(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = randomRange(0, TWO_PI);
    const speed = randomRange(40, 220);
    const life = randomRange(0.35, 0.85);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: randomRange(1.2, 2.7),
      color
    });
  }
}

function splitAsteroid(index) {
  const asteroid = game.asteroids[index];
  if (!asteroid) return;

  game.score += CONFIG.scoreBySize[asteroid.size];
  spawnExplosion(asteroid.x, asteroid.y, asteroid.size === 3 ? 22 : 16, "#d4ffe8");
  sound.asteroidHit(asteroid.size);

  game.asteroids.splice(index, 1);

  if (asteroid.size > 1) {
    for (let i = 0; i < 2; i += 1) {
      const child = createAsteroid(
        asteroid.x + randomRange(-7, 7),
        asteroid.y + randomRange(-7, 7),
        asteroid.size - 1
      );
      child.vx += asteroid.vx * 0.22;
      child.vy += asteroid.vy * 0.22;
      game.asteroids.push(child);
    }
  }

  if (game.asteroids.length === 0 && !game.gameOver) {
    game.nextLevelTimer = CONFIG.nextLevelDelay;
  }

  updateHud();
}

function destroyShip() {
  sound.setThruster(false);
  sound.shipExplode();
  spawnExplosion(game.ship.x, game.ship.y, 34, "#ffd8b5");
  game.lives -= 1;
  updateHud();

  if (game.lives <= 0) {
    game.gameOver = true;
    sound.gameOver();
    showOverlay("Game Over. Press Enter to restart");
    return;
  }

  resetShip();
}

function startGame() {
  game = createState();
  game.started = true;
  spawnLevel();
  hideOverlay();
  updateHud();
  sound.setThruster(false);
  sound.unlock(() => sound.gameStart());
}

function updateHud() {
  scoreEl.textContent = String(game.score).padStart(6, "0");
  livesEl.textContent = String(game.lives);
  levelEl.textContent = String(game.level);
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.add("show");
}

function hideOverlay() {
  overlay.classList.remove("show");
}

function shoot() {
  if (!game.started || game.gameOver) return;
  if (game.fireCooldown > 0 || game.bullets.length >= CONFIG.maxBullets) return;

  const ship = game.ship;
  const tipX = ship.x + Math.cos(ship.angle) * ship.radius * 1.35;
  const tipY = ship.y + Math.sin(ship.angle) * ship.radius * 1.35;

  game.bullets.push({
    x: tipX,
    y: tipY,
    vx: ship.vx + Math.cos(ship.angle) * CONFIG.bulletSpeed,
    vy: ship.vy + Math.sin(ship.angle) * CONFIG.bulletSpeed,
    life: CONFIG.bulletLife,
    radius: 2.2
  });

  game.fireCooldown = CONFIG.fireInterval;
  sound.shoot();
}

function updateShip(dt) {
  const ship = game.ship;
  if (!ship) return;

  if (keys.left) ship.angle -= CONFIG.turnSpeed * dt;
  if (keys.right) ship.angle += CONFIG.turnSpeed * dt;

  if (keys.thrust) {
    ship.vx += Math.cos(ship.angle) * CONFIG.thrust * dt;
    ship.vy += Math.sin(ship.angle) * CONFIG.thrust * dt;
  }

  const damping = Math.pow(CONFIG.drag, dt * 60);
  ship.vx *= damping;
  ship.vy *= damping;

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  wrap(ship, ship.radius);

  if (ship.invulnerable > 0) {
    ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    ship.blinkTimer += dt;
    if (ship.blinkTimer >= CONFIG.shipBlinkRate) {
      ship.blinkTimer = 0;
      ship.visible = !ship.visible;
    }
  } else {
    ship.visible = true;
  }
}

function updateBullets(dt) {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game.bullets[i];
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    wrap(bullet, 0);

    if (bullet.life <= 0) {
      game.bullets.splice(i, 1);
    }
  }
}

function updateAsteroids(dt) {
  for (const asteroid of game.asteroids) {
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.angle += asteroid.spin * dt;
    wrap(asteroid, asteroid.radius);
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const particle = game.particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.985, dt * 60);
    particle.vy *= Math.pow(0.985, dt * 60);

    if (particle.life <= 0) {
      game.particles.splice(i, 1);
    }
  }
}

function detectBulletAsteroidCollisions() {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game.bullets[i];
    let hit = false;

    for (let j = game.asteroids.length - 1; j >= 0; j -= 1) {
      const asteroid = game.asteroids[j];
      const hitRadius = asteroid.radius + bullet.radius;
      if (distanceSq(bullet.x, bullet.y, asteroid.x, asteroid.y) <= hitRadius * hitRadius) {
        game.bullets.splice(i, 1);
        splitAsteroid(j);
        hit = true;
        break;
      }
    }

    if (hit) continue;
  }
}

function detectShipAsteroidCollision() {
  if (!game.ship || game.ship.invulnerable > 0 || game.gameOver) return;

  for (const asteroid of game.asteroids) {
    const hitRadius = game.ship.radius + asteroid.radius * 0.92;
    if (distanceSq(game.ship.x, game.ship.y, asteroid.x, asteroid.y) <= hitRadius * hitRadius) {
      destroyShip();
      break;
    }
  }
}

function updateStars(dt) {
  for (const star of stars) {
    star.phase += star.speed * dt;
  }
}

function update(dt) {
  updateStars(dt);
  updateParticles(dt);
  sound.setThruster(game.started && !game.gameOver && keys.thrust);

  if (!game.started || game.gameOver) return;

  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  if (keys.fire) shoot();

  updateShip(dt);
  updateBullets(dt);
  updateAsteroids(dt);
  detectBulletAsteroidCollisions();
  detectShipAsteroidCollision();

  if (game.levelIntro > 0) {
    game.levelIntro = Math.max(0, game.levelIntro - dt);
  }

  if (game.nextLevelTimer > 0) {
    game.nextLevelTimer = Math.max(0, game.nextLevelTimer - dt);
    if (game.nextLevelTimer === 0) {
      game.level += 1;
      updateHud();
      resetShip();
      spawnLevel();
      sound.levelAdvance();
    }
  }
}

function renderStars() {
  ctx.fillStyle = "#f3fff9";
  for (const star of stars) {
    const twinkle = 0.6 + Math.sin(star.phase) * 0.4;
    ctx.globalAlpha = star.alpha * twinkle;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;
}

function renderShip() {
  if (!game.ship || !game.ship.visible) return;
  const ship = game.ship;

  const noseX = ship.x + Math.cos(ship.angle) * ship.radius * 1.35;
  const noseY = ship.y + Math.sin(ship.angle) * ship.radius * 1.35;
  const leftX = ship.x + Math.cos(ship.angle + 2.45) * ship.radius;
  const leftY = ship.y + Math.sin(ship.angle + 2.45) * ship.radius;
  const rightX = ship.x + Math.cos(ship.angle - 2.45) * ship.radius;
  const rightY = ship.y + Math.sin(ship.angle - 2.45) * ship.radius;
  const rearX = ship.x - Math.cos(ship.angle) * ship.radius * 1.06;
  const rearY = ship.y - Math.sin(ship.angle) * ship.radius * 1.06;

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "#eafff2";
  ctx.beginPath();
  ctx.moveTo(noseX, noseY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rearX, rearY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.stroke();

  if (keys.thrust && game.started && !game.gameOver) {
    const flameLength = randomRange(ship.radius * 0.8, ship.radius * 1.45);
    const flameX = rearX - Math.cos(ship.angle) * flameLength;
    const flameY = rearY - Math.sin(ship.angle) * flameLength;

    ctx.strokeStyle = "#ffcc9d";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(leftX * 0.68 + rearX * 0.32, leftY * 0.68 + rearY * 0.32);
    ctx.lineTo(flameX, flameY);
    ctx.lineTo(rightX * 0.68 + rearX * 0.32, rightY * 0.68 + rearY * 0.32);
    ctx.stroke();
  }
}

function renderBullets() {
  ctx.fillStyle = "#e8fff3";
  for (const bullet of game.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TWO_PI);
    ctx.fill();
  }
}

function renderAsteroids() {
  ctx.strokeStyle = "#d4ffe8";
  ctx.lineWidth = 2;

  for (const asteroid of game.asteroids) {
    ctx.beginPath();
    for (let i = 0; i < asteroid.points; i += 1) {
      const angle = asteroid.angle + (i / asteroid.points) * TWO_PI;
      const radius = asteroid.radius * asteroid.jag[i];
      const x = asteroid.x + Math.cos(angle) * radius;
      const y = asteroid.y + Math.sin(angle) * radius;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function renderParticles() {
  for (const particle of game.particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function renderLevelIntro() {
  if (!game.started || game.gameOver || game.levelIntro <= 0) return;

  const fade = Math.min(1, game.levelIntro / CONFIG.levelIntroDuration);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "#e4fff1";
  ctx.font = "700 28px 'Avenir Next Condensed', 'Helvetica Neue', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`LEVEL ${game.level}`, width / 2, height * 0.2);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, width, height);
  renderStars();
  renderAsteroids();
  renderBullets();
  renderParticles();
  renderShip();
  renderLevelIntro();
}

function createStars() {
  const count = Math.max(80, Math.floor((width * height) / 10000));
  stars = Array.from({ length: count }, () => ({
    x: randomRange(0, width),
    y: randomRange(0, height),
    size: randomRange(0.8, 2.2),
    alpha: randomRange(0.2, 0.85),
    phase: randomRange(0, TWO_PI),
    speed: randomRange(0.7, 2.4)
  }));
}

function resizeCanvas() {
  width = Math.max(320, window.innerWidth);
  height = Math.max(320, window.innerHeight);

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  createStars();

  if (game && game.ship) {
    game.ship.x = Math.min(Math.max(game.ship.x, 0), width);
    game.ship.y = Math.min(Math.max(game.ship.y, 0), height);
  }
}

function onKeyDown(event) {
  sound.unlock();

  if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "ArrowUp" || event.code === "Space") {
    event.preventDefault();
  }

  if (event.code === "Enter") {
    event.preventDefault();
    if (!game.started || game.gameOver) {
      startGame();
      return;
    }
  }

  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = true;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = true;
  if (event.code === "ArrowUp" || event.code === "KeyW") keys.thrust = true;
  if (event.code === "Space") keys.fire = true;
}

function onKeyUp(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = false;
  if (event.code === "ArrowUp" || event.code === "KeyW") keys.thrust = false;
  if (event.code === "Space") keys.fire = false;
}

function clearInput() {
  keys.left = false;
  keys.right = false;
  keys.thrust = false;
  keys.fire = false;
  sound.setThruster(false);
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

function init() {
  resizeCanvas();
  game = createState();
  updateHud();
  showOverlay("Press Enter to start");

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("blur", clearInput);
  window.addEventListener("pointerdown", () => sound.unlock(), { passive: true });

  requestAnimationFrame(loop);
}

init();
