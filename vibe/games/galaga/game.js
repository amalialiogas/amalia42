(() => {
  "use strict";

  const canvas = document.getElementById("game");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const levelEl = document.getElementById("level");
  const overlay = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlayTitle");
  const overlayTextEl = document.getElementById("overlayText");
  const startBtn = document.getElementById("startBtn");

  const STATE = {
    TITLE: "title",
    PLAYING: "playing",
    LEVEL_CLEAR: "level_clear",
    GAME_OVER: "game_over",
  };

  const game = {
    state: STATE.TITLE,
    width: canvas.width,
    height: canvas.height,
    score: 0,
    lives: 3,
    level: 1,
    stars: [],
    player: null,
    enemies: [],
    playerBullets: [],
    enemyBullets: [],
    particles: [],
    formationClock: 0,
    diveTimer: 1.6,
    enemyFireTimer: 1.2,
    levelClearTimer: 0,
    clock: 0,
  };

  const keys = {
    left: false,
    right: false,
    fire: false,
  };

  const touch = {
    left: false,
    right: false,
    fire: false,
    dragging: false,
    targetX: null,
  };

  const audio = {
    ctx: null,
    masterGain: null,
    noiseBuffer: null,
    muted: false,
    lastPlayed: Object.create(null),
  };
  const MASTER_VOLUME = 0.13;

  const ENEMY_ROWS = [
    { type: "boss", hp: 2, points: 400, color: "#ff6767" },
    { type: "butterfly", hp: 1, points: 160, color: "#ffbb5c" },
    { type: "butterfly", hp: 1, points: 160, color: "#ffd26b" },
    { type: "bee", hp: 1, points: 80, color: "#72f0dd" },
    { type: "bee", hp: 1, points: 80, color: "#4dd5c4" },
  ];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatScore(score) {
    return String(score).padStart(6, "0");
  }

  function getAudioContext() {
    if (audio.muted) {
      return null;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!audio.ctx) {
      audio.ctx = new AudioContextCtor();
      audio.masterGain = audio.ctx.createGain();
      audio.masterGain.gain.value = MASTER_VOLUME;
      audio.masterGain.connect(audio.ctx.destination);
    }

    return audio.ctx;
  }

  function activateAudio() {
    const context = getAudioContext();
    if (!context || context.state !== "suspended") {
      return;
    }

    context.resume().catch(() => {});
  }

  function getNoiseBuffer(context) {
    if (audio.noiseBuffer && audio.noiseBuffer.sampleRate === context.sampleRate) {
      return audio.noiseBuffer;
    }

    const duration = 0.6;
    const frameCount = Math.floor(context.sampleRate * duration);
    const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < frameCount; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    audio.noiseBuffer = noiseBuffer;
    return noiseBuffer;
  }

  function playTone({
    type = "square",
    frequency = 440,
    frequencyEnd = frequency,
    duration = 0.1,
    volume = 0.18,
    when = 0,
    attack = 0.003,
  } = {}) {
    const context = getAudioContext();
    if (!context || !audio.masterGain) {
      return;
    }

    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(16, frequency), start);
    if (frequencyEnd !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(16, frequencyEnd), start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.max(attack, 0.001));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(duration, 0.02));

    oscillator.connect(gain);
    gain.connect(audio.masterGain);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  function playNoise({
    duration = 0.12,
    volume = 0.12,
    highpass = 240,
    when = 0,
  } = {}) {
    const context = getAudioContext();
    if (!context || !audio.masterGain) {
      return;
    }

    const start = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = getNoiseBuffer(context);

    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(highpass, start);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(duration, 0.02));

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.masterGain);

    source.start(start);
    source.stop(start + duration + 0.03);
  }

  function playSfx(name) {
    const now = performance.now();
    const minSpacingMs = {
      shoot: 35,
      enemyHit: 45,
      enemyShot: 60,
      dive: 80,
    };

    const minGap = minSpacingMs[name] || 0;
    const last = audio.lastPlayed[name] || 0;
    if (minGap > 0 && now - last < minGap) {
      return;
    }
    audio.lastPlayed[name] = now;

    switch (name) {
      case "start":
        playTone({ frequency: 300, frequencyEnd: 420, duration: 0.09, volume: 0.12 });
        playTone({ frequency: 420, frequencyEnd: 560, duration: 0.1, when: 0.1, volume: 0.13 });
        playTone({ frequency: 560, frequencyEnd: 720, duration: 0.12, when: 0.2, volume: 0.14 });
        break;
      case "shoot":
        playTone({ frequency: 980, frequencyEnd: 520, duration: 0.08, volume: 0.13 });
        break;
      case "enemyHit":
        playTone({ type: "triangle", frequency: 380, frequencyEnd: 240, duration: 0.07, volume: 0.09 });
        break;
      case "enemyDestroy":
        playTone({ frequency: 460, frequencyEnd: 120, duration: 0.14, volume: 0.11 });
        playNoise({ duration: 0.11, volume: 0.07, highpass: 520 });
        break;
      case "playerHit":
        playTone({ type: "sawtooth", frequency: 330, frequencyEnd: 70, duration: 0.24, volume: 0.16 });
        playNoise({ duration: 0.2, volume: 0.09, highpass: 180 });
        break;
      case "enemyShot":
        playTone({ type: "square", frequency: 260, frequencyEnd: 180, duration: 0.08, volume: 0.06 });
        break;
      case "dive":
        playTone({ type: "square", frequency: 680, frequencyEnd: 390, duration: 0.09, volume: 0.07 });
        break;
      case "levelClear":
        playTone({ frequency: 430, duration: 0.1, volume: 0.13 });
        playTone({ frequency: 540, duration: 0.1, when: 0.11, volume: 0.13 });
        playTone({ frequency: 680, duration: 0.1, when: 0.22, volume: 0.13 });
        playTone({ frequency: 860, duration: 0.16, when: 0.33, volume: 0.14 });
        break;
      case "gameOver":
        playTone({ type: "triangle", frequency: 360, frequencyEnd: 260, duration: 0.18, volume: 0.13 });
        playTone({ type: "triangle", frequency: 260, frequencyEnd: 170, duration: 0.2, when: 0.19, volume: 0.13 });
        playTone({ type: "triangle", frequency: 170, frequencyEnd: 95, duration: 0.24, when: 0.4, volume: 0.14 });
        break;
      case "muteOff":
        playTone({ frequency: 700, duration: 0.08, volume: 0.08 });
        break;
      default:
        break;
    }
  }

  function setMuted(muted) {
    audio.muted = muted;
    if (audio.ctx && audio.masterGain) {
      const value = muted ? 0 : MASTER_VOLUME;
      audio.masterGain.gain.setValueAtTime(value, audio.ctx.currentTime);
    }
  }

  function colorWithAlpha(color, alpha) {
    if (typeof color !== "string") {
      return `rgba(255, 230, 200, ${alpha})`;
    }

    if (color.startsWith("#")) {
      let hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map((char) => char + char).join("");
      }
      if (hex.length === 6) {
        const red = Number.parseInt(hex.slice(0, 2), 16);
        const green = Number.parseInt(hex.slice(2, 4), 16);
        const blue = Number.parseInt(hex.slice(4, 6), 16);
        if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) {
          return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }
      }
    }

    if (color.startsWith("rgb(")) {
      return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    }

    if (color.startsWith("rgba(")) {
      const parts = color.slice(5, -1).split(",").map((part) => part.trim());
      if (parts.length >= 3) {
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
      }
    }

    return `rgba(255, 230, 200, ${alpha})`;
  }

  function updateHud() {
    scoreEl.textContent = formatScore(game.score);
    livesEl.textContent = String(game.lives);
    levelEl.textContent = String(game.level);
  }

  function showOverlay(title, text, buttonLabel) {
    overlayTitleEl.textContent = title;
    overlayTextEl.textContent = text;
    startBtn.textContent = buttonLabel;
    overlay.classList.add("visible");
  }

  function hideOverlay() {
    overlay.classList.remove("visible");
  }

  function createPlayer() {
    return {
      x: game.width / 2,
      y: game.height - 54,
      w: 30,
      h: 26,
      speed: 320,
      cooldown: 0,
      fireDelay: 0.16,
      invincible: 0,
      respawnTimer: 0,
    };
  }

  function createStarField() {
    game.stars = [];
    for (let i = 0; i < 110; i += 1) {
      game.stars.push({
        x: Math.random() * game.width,
        y: Math.random() * game.height,
        size: rand(1, 2.6),
        speed: rand(18, 86),
      });
    }
  }

  function createWave() {
    game.enemies = [];
    game.playerBullets = [];
    game.enemyBullets = [];

    const cols = 10;
    const spacingX = 38;
    const spacingY = 42;
    const startX = (game.width - (cols - 1) * spacingX) / 2;
    const startY = 86;

    for (let row = 0; row < ENEMY_ROWS.length; row += 1) {
      const rowConfig = ENEMY_ROWS[row];
      for (let col = 0; col < cols; col += 1) {
        const slotX = startX + col * spacingX;
        const slotY = startY + row * spacingY;

        game.enemies.push({
          row,
          col,
          type: rowConfig.type,
          hp: rowConfig.hp,
          maxHp: rowConfig.hp,
          points: rowConfig.points,
          color: rowConfig.color,
          alive: true,
          x: slotX,
          y: slotY,
          w: 28,
          h: 22,
          slotX,
          slotY,
          inFormation: true,
          diving: false,
          returning: false,
          diveT: 0,
          divePhase: rand(0, Math.PI * 2),
          diveSpeed: rand(0.9, 1.3),
          diveStartX: slotX,
          diveStartY: slotY,
          fireCooldown: rand(0.6, 1.5),
          vx: 0,
          vy: 0,
        });
      }
    }

    game.formationClock = 0;
    game.diveTimer = Math.max(0.8, 1.8 - game.level * 0.08);
    game.enemyFireTimer = Math.max(0.5, 1.2 - game.level * 0.05);
  }

  function startNewGame() {
    activateAudio();
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    game.player = createPlayer();
    game.particles = [];
    createWave();
    updateHud();
    hideOverlay();
    keys.fire = false;
    touch.fire = false;
    game.state = STATE.PLAYING;
    playSfx("start");
  }

  function spawnPlayerBullet() {
    game.playerBullets.push({
      x: game.player.x,
      y: game.player.y - game.player.h / 2 - 8,
      w: 4,
      h: 12,
      speed: 510,
      dead: false,
    });
    playSfx("shoot");
  }

  function spawnEnemyBullet(x, y, fromDive) {
    const speed = fromDive ? rand(250, 340) : rand(210, 290) + game.level * 8;
    game.enemyBullets.push({
      x,
      y,
      w: 4,
      h: 12,
      speed,
      dead: false,
    });
  }

  function spawnExplosion(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(35, 180);
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.22, 0.55),
        maxLife: 0.55,
        size: rand(1.6, 3.8),
        color,
      });
    }
  }

  function countDivingEnemies() {
    let total = 0;
    for (const enemy of game.enemies) {
      if (enemy.alive && enemy.diving) {
        total += 1;
      }
    }
    return total;
  }

  function chooseDiveAttacker() {
    const maxDive = Math.min(6, 2 + Math.floor((game.level - 1) / 2));
    if (countDivingEnemies() >= maxDive) {
      return;
    }

    let candidates = game.enemies.filter((enemy) => enemy.alive && enemy.inFormation && !enemy.diving && !enemy.returning);

    if (Math.random() < 0.72) {
      const topPriority = candidates.filter((enemy) => enemy.row <= 2);
      if (topPriority.length > 0) {
        candidates = topPriority;
      }
    }

    if (candidates.length === 0) {
      return;
    }

    const attacker = candidates[Math.floor(Math.random() * candidates.length)];
    attacker.inFormation = false;
    attacker.diving = true;
    attacker.returning = false;
    attacker.diveT = 0;
    attacker.diveStartX = attacker.x;
    attacker.diveStartY = attacker.y;
    attacker.fireCooldown = rand(0.35, 1.0);
    playSfx("dive");
  }

  function getFrontlineShooters() {
    const bestByCol = new Map();

    for (const enemy of game.enemies) {
      if (!enemy.alive || !enemy.inFormation) {
        continue;
      }

      const current = bestByCol.get(enemy.col);
      if (!current || enemy.row > current.row) {
        bestByCol.set(enemy.col, enemy);
      }
    }

    return [...bestByCol.values()];
  }

  function fireEnemyVolley() {
    const shooters = getFrontlineShooters();
    if (shooters.length === 0) {
      return;
    }

    const shots = game.level >= 7 ? 2 : 1;
    for (let i = 0; i < shots; i += 1) {
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      spawnEnemyBullet(shooter.x, shooter.y + shooter.h / 2 + 6, false);
    }
    playSfx("enemyShot");
  }

  function overlap(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  }

  function destroyEnemy(enemy, grantScore) {
    enemy.alive = false;
    enemy.diving = false;
    enemy.returning = false;
    enemy.inFormation = false;

    if (grantScore) {
      const multiplier = enemy.diveT > 0 ? 2 : 1;
      game.score += enemy.points * multiplier;
      updateHud();
    }

    spawnExplosion(enemy.x, enemy.y, enemy.color, 14);
    if (grantScore) {
      playSfx("enemyDestroy");
    }
  }

  function playerVulnerable() {
    return game.player.respawnTimer <= 0 && game.player.invincible <= 0;
  }

  function triggerPlayerHit() {
    if (!playerVulnerable()) {
      return;
    }

    spawnExplosion(game.player.x, game.player.y, "#9be7ff", 20);
    playSfx("playerHit");
    game.lives -= 1;
    updateHud();

    game.enemyBullets = [];

    if (game.lives <= 0) {
      game.state = STATE.GAME_OVER;
      showOverlay("Game Over", `Final score: ${formatScore(game.score)}. Press Enter or tap Start.`, "Play Again");
      playSfx("gameOver");
      return;
    }

    game.player.respawnTimer = 1.0;
    game.player.invincible = 0;
    game.player.x = game.width / 2;
  }

  function updateStars(dt) {
    const speedMul = game.state === STATE.PLAYING ? 1 + game.level * 0.06 : 0.5;

    for (const star of game.stars) {
      star.y += star.speed * speedMul * dt;
      if (star.y > game.height) {
        star.y = -2;
        star.x = Math.random() * game.width;
      }
    }
  }

  function updatePlayer(dt) {
    if (!game.player) {
      return;
    }

    const player = game.player;

    if (player.respawnTimer > 0) {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) {
        player.respawnTimer = 0;
        player.invincible = 1.7;
      }
    }

    if (player.invincible > 0) {
      player.invincible -= dt;
    }

    if (game.state !== STATE.PLAYING || player.respawnTimer > 0) {
      return;
    }

    player.cooldown = Math.max(0, player.cooldown - dt);

    let movement = 0;
    if (keys.left || touch.left) {
      movement -= 1;
    }
    if (keys.right || touch.right) {
      movement += 1;
    }

    if (touch.dragging && touch.targetX !== null) {
      const lerp = 1 - Math.exp(-14 * dt);
      player.x += (touch.targetX - player.x) * lerp;
    } else if (movement !== 0) {
      player.x += movement * player.speed * dt;
    }

    const minX = player.w / 2 + 10;
    const maxX = game.width - player.w / 2 - 10;
    player.x = clamp(player.x, minX, maxX);

    if ((keys.fire || touch.fire) && player.cooldown === 0 && game.playerBullets.length < 4) {
      spawnPlayerBullet();
      player.cooldown = player.fireDelay;
    }
  }

  function updateEnemies(dt) {
    game.formationClock += dt * (0.8 + game.level * 0.04);
    const offsetX = Math.sin(game.formationClock * 1.2) * (26 + game.level * 1.8);
    const offsetY = Math.sin(game.formationClock * 2.3) * 6;

    for (const enemy of game.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const prevX = enemy.x;
      const prevY = enemy.y;

      if (enemy.inFormation) {
        const targetX = enemy.slotX + offsetX;
        const targetY = enemy.slotY + offsetY;
        const lerp = 1 - Math.exp(-7.5 * dt);
        enemy.x += (targetX - enemy.x) * lerp;
        enemy.y += (targetY - enemy.y) * lerp;
      } else if (enemy.diving) {
        enemy.diveT += dt * (1.02 + game.level * 0.07) * enemy.diveSpeed;

        const t = enemy.diveT;
        enemy.x = enemy.diveStartX + Math.sin(t * 4.4 + enemy.divePhase) * 94 + Math.cos(t * 1.5) * 42;
        enemy.y = enemy.diveStartY + t * 210;

        enemy.fireCooldown -= dt;
        if (enemy.fireCooldown <= 0) {
          spawnEnemyBullet(enemy.x, enemy.y + 8, true);
          enemy.fireCooldown = rand(0.45, 1.05);
        }

        if (enemy.y > game.height + 32) {
          enemy.diving = false;
          enemy.returning = true;
          enemy.x = clamp(enemy.x, 30, game.width - 30);
          enemy.y = -20 - rand(0, 54);
        }
      } else if (enemy.returning) {
        const targetX = enemy.slotX + offsetX;
        const targetY = enemy.slotY + offsetY;
        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const dist = Math.hypot(dx, dy);
        const speed = 215 + game.level * 16;

        if (dist <= speed * dt + 2) {
          enemy.x = targetX;
          enemy.y = targetY;
          enemy.returning = false;
          enemy.inFormation = true;
          enemy.fireCooldown = rand(0.6, 1.4);
        } else if (dist > 0) {
          enemy.x += (dx / dist) * speed * dt;
          enemy.y += (dy / dist) * speed * dt;
        }
      }

      enemy.vx = (enemy.x - prevX) / Math.max(dt, 0.0001);
      enemy.vy = (enemy.y - prevY) / Math.max(dt, 0.0001);
    }

    game.diveTimer -= dt;
    if (game.diveTimer <= 0) {
      chooseDiveAttacker();
      game.diveTimer = Math.max(0.52, 1.6 - game.level * 0.07) + rand(0, 0.45);
    }

    game.enemyFireTimer -= dt;
    if (game.enemyFireTimer <= 0) {
      fireEnemyVolley();
      game.enemyFireTimer = Math.max(0.43, 1.1 - game.level * 0.05) + rand(0, 0.35);
    }
  }

  function updateBullets(dt) {
    for (const bullet of game.playerBullets) {
      if (bullet.dead) {
        continue;
      }

      bullet.y -= bullet.speed * dt;
      if (bullet.y < -20) {
        bullet.dead = true;
      }
    }

    for (const bullet of game.enemyBullets) {
      if (bullet.dead) {
        continue;
      }

      bullet.y += bullet.speed * dt;
      if (bullet.y > game.height + 20) {
        bullet.dead = true;
      }
    }

    game.playerBullets = game.playerBullets.filter((bullet) => !bullet.dead);
    game.enemyBullets = game.enemyBullets.filter((bullet) => !bullet.dead);
  }

  function updateParticles(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
    }

    game.particles = game.particles.filter((particle) => particle.life > 0);
  }

  function handleCollisions() {
    const player = game.player;

    for (const bullet of game.playerBullets) {
      if (bullet.dead) {
        continue;
      }

      for (const enemy of game.enemies) {
        if (!enemy.alive) {
          continue;
        }

        if (overlap(bullet, enemy)) {
          bullet.dead = true;
          enemy.hp -= 1;

          if (enemy.hp <= 0) {
            destroyEnemy(enemy, true);
          } else {
            spawnExplosion(enemy.x, enemy.y, "#ffe3ba", 6);
            playSfx("enemyHit");
          }
          break;
        }
      }
    }

    if (!playerVulnerable()) {
      return;
    }

    for (const bullet of game.enemyBullets) {
      if (!bullet.dead && overlap(bullet, player)) {
        bullet.dead = true;
        triggerPlayerHit();
        return;
      }
    }

    for (const enemy of game.enemies) {
      if (enemy.alive && overlap(enemy, player)) {
        destroyEnemy(enemy, false);
        triggerPlayerHit();
        return;
      }
    }
  }

  function checkLevelClear() {
    const alive = game.enemies.some((enemy) => enemy.alive);
    if (alive) {
      return;
    }

    game.state = STATE.LEVEL_CLEAR;
    game.levelClearTimer = 2.1;
    game.level += 1;
    updateHud();
    playSfx("levelClear");
  }

  function update(dt) {
    game.clock += dt;
    updateStars(dt);
    updateParticles(dt);

    if (game.state === STATE.PLAYING) {
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      handleCollisions();
      checkLevelClear();
      return;
    }

    if (game.state === STATE.LEVEL_CLEAR) {
      updatePlayer(dt);

      game.levelClearTimer -= dt;
      if (game.levelClearTimer <= 0) {
        createWave();
        game.state = STATE.PLAYING;
      }
      return;
    }

    if (game.state === STATE.GAME_OVER || game.state === STATE.TITLE) {
      updatePlayer(dt);
      updateBullets(dt);
    }
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, game.height);
    gradient.addColorStop(0, "#030917");
    gradient.addColorStop(0.5, "#040d1f");
    gradient.addColorStop(1, "#02050f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, game.width, game.height);

    for (const star of game.stars) {
      const alpha = clamp((star.size / 2.6) * 0.95, 0.2, 0.95);
      ctx.fillStyle = `rgba(183, 236, 255, ${alpha})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  function drawPlayer() {
    const player = game.player;

    if (!player || player.respawnTimer > 0) {
      return;
    }

    if (player.invincible > 0 && Math.floor(game.clock * 18) % 2 === 0) {
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);

    ctx.fillStyle = "#8fdcff";
    ctx.beginPath();
    ctx.moveTo(0, -player.h / 2);
    ctx.lineTo(player.w / 2 - 3, player.h / 2);
    ctx.lineTo(0, player.h / 2 - 7);
    ctx.lineTo(-(player.w / 2 - 3), player.h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#163148";
    ctx.fillRect(-4, -7, 8, 12);

    ctx.fillStyle = "#ffd07a";
    ctx.fillRect(-1.5, -2, 3, 6);

    ctx.restore();
  }

  function drawBossEnemy(enemy) {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(-13, -3);
    ctx.lineTo(-8, -10);
    ctx.lineTo(8, -10);
    ctx.lineTo(13, -3);
    ctx.lineTo(11, 10);
    ctx.lineTo(-11, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffe1dc";
    ctx.fillRect(-5, -7, 10, 6);

    ctx.fillStyle = "#672632";
    ctx.fillRect(-11, 2, 5, 4);
    ctx.fillRect(6, 2, 5, 4);

    if (enemy.hp < enemy.maxHp) {
      ctx.strokeStyle = "#2f0f17";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.lineTo(-1, 3);
      ctx.lineTo(5, -2);
      ctx.stroke();
    }
  }

  function drawButterflyEnemy(enemy, flap) {
    ctx.fillStyle = enemy.color;

    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, -2);
    ctx.lineTo(6, 8);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffdfe8";
    ctx.beginPath();
    ctx.moveTo(-4, -1);
    ctx.lineTo(-14 - flap, -8);
    ctx.lineTo(-11, 5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(4, -1);
    ctx.lineTo(14 + flap, -8);
    ctx.lineTo(11, 5);
    ctx.closePath();
    ctx.fill();
  }

  function drawBeeEnemy(enemy, flap) {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e6fffb";
    ctx.fillRect(-2.5, -7, 5, 10);

    ctx.fillStyle = "#7ffff0";
    ctx.fillRect(-13 - flap * 0.9, -4, 7, 4);
    ctx.fillRect(6 + flap * 0.9, -4, 7, 4);
  }

  function drawEnemies() {
    for (const enemy of game.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const flap = Math.sin(game.clock * 12 + enemy.col * 0.7 + enemy.row) * 2.4;

      ctx.save();
      ctx.translate(enemy.x, enemy.y);

      if (enemy.diving || enemy.returning) {
        const angle = Math.atan2(enemy.vy, enemy.vx) + Math.PI / 2;
        if (Number.isFinite(angle)) {
          ctx.rotate(angle * 0.25);
        }
      }

      if (enemy.type === "boss") {
        drawBossEnemy(enemy);
      } else if (enemy.type === "butterfly") {
        drawButterflyEnemy(enemy, flap);
      } else {
        drawBeeEnemy(enemy, flap);
      }

      ctx.restore();
    }
  }

  function drawBullets() {
    for (const bullet of game.playerBullets) {
      ctx.fillStyle = "#ffd479";
      ctx.fillRect(bullet.x - bullet.w / 2, bullet.y - bullet.h / 2, bullet.w, bullet.h);
    }

    for (const bullet of game.enemyBullets) {
      ctx.fillStyle = "#ff7442";
      ctx.fillRect(bullet.x - bullet.w / 2, bullet.y - bullet.h / 2, bullet.w, bullet.h);
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = colorWithAlpha(particle.color, alpha.toFixed(3));
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
  }

  function drawCenterMessage() {
    if (game.state !== STATE.LEVEL_CLEAR) {
      return;
    }

    ctx.save();
    ctx.textAlign = "center";

    ctx.font = "18px 'Press Start 2P'";
    ctx.fillStyle = "#fefefe";
    ctx.fillText("WAVE CLEAR", game.width / 2, game.height / 2 - 16);

    ctx.font = "26px 'VT323'";
    ctx.fillStyle = "#8de8ff";
    ctx.fillText(`Preparing Level ${game.level}`, game.width / 2, game.height / 2 + 18);

    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawEnemies();
    drawBullets();
    drawPlayer();
    drawParticles();
    drawCenterMessage();
  }

  function pointerToCanvasX(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = game.width / rect.width;
    return (event.clientX - rect.left) * scaleX;
  }

  function setTouchTargetFromEvent(event) {
    const minX = game.player.w / 2 + 10;
    const maxX = game.width - game.player.w / 2 - 10;
    touch.targetX = clamp(pointerToCanvasX(event), minX, maxX);
  }

  const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
  const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
  const FIRE_KEYS = new Set(["Space", "KeyJ", "KeyK"]);

  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyM") {
      setMuted(!audio.muted);
      if (!audio.muted) {
        activateAudio();
        playSfx("muteOff");
      }
      event.preventDefault();
      return;
    }

    activateAudio();

    if (LEFT_KEYS.has(event.code)) {
      keys.left = true;
      event.preventDefault();
      return;
    }

    if (RIGHT_KEYS.has(event.code)) {
      keys.right = true;
      event.preventDefault();
      return;
    }

    if (FIRE_KEYS.has(event.code)) {
      if (game.state !== STATE.PLAYING) {
        startNewGame();
      } else {
        keys.fire = true;
      }
      event.preventDefault();
      return;
    }

    if (event.code === "Enter" && game.state !== STATE.PLAYING) {
      startNewGame();
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (LEFT_KEYS.has(event.code)) {
      keys.left = false;
      return;
    }

    if (RIGHT_KEYS.has(event.code)) {
      keys.right = false;
      return;
    }

    if (FIRE_KEYS.has(event.code)) {
      keys.fire = false;
    }
  });

  startBtn.addEventListener("click", () => {
    activateAudio();
    if (game.state !== STATE.PLAYING) {
      startNewGame();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    activateAudio();
    if (game.state !== STATE.PLAYING) {
      startNewGame();
      return;
    }

    touch.dragging = true;
    setTouchTargetFromEvent(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!touch.dragging || game.state !== STATE.PLAYING) {
      return;
    }

    setTouchTargetFromEvent(event);
  });

  window.addEventListener("pointerup", () => {
    touch.dragging = false;
    touch.targetX = null;
  });

  document.querySelectorAll("[data-control]").forEach((button) => {
    const control = button.getAttribute("data-control");

    const activate = (event) => {
      event.preventDefault();
      activateAudio();
      touch[control] = true;
      button.classList.add("active");

      if (control === "fire" && game.state !== STATE.PLAYING) {
        startNewGame();
      }
    };

    const deactivate = () => {
      touch[control] = false;
      button.classList.remove("active");
    };

    button.addEventListener("pointerdown", activate);
    button.addEventListener("pointerup", deactivate);
    button.addEventListener("pointerleave", deactivate);
    button.addEventListener("pointercancel", deactivate);
  });

  createStarField();
  game.player = createPlayer();
  updateHud();
  showOverlay("Galaga", "Press Enter or tap Start to begin.", "Start Game");

  let previousTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.034, Math.max(0.001, (now - previousTime) / 1000));
    previousTime = now;

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
