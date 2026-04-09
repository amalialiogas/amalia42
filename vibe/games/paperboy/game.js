(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const muteBtn = document.getElementById("muteBtn");

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const papersEl = document.getElementById("papers");
  const deliveriesEl = document.getElementById("deliveries");
  const distanceEl = document.getElementById("distance");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const ROAD_WIDTH = 380;
  const ROAD_X = (WIDTH - ROAD_WIDTH) / 2;
  const ROAD_RIGHT = ROAD_X + ROAD_WIDTH;

  const PLAYER_W = 42;
  const PLAYER_H = 62;

  const GOAL_DISTANCE = 9200;
  const SUBSCRIBER_CHANCE = 0.62;

  const state = {
    mode: "start",
    score: 0,
    lives: 3,
    papers: 15,
    deliveries: 0,
    distance: 0,
    speed: 245,
    minSpeed: 150,
    maxSpeed: 360,
    throwCooldown: 0,
    invuln: 0,
    houseSpawnMeter: 0,
    obstacleTimer: 0,
    bundleTimer: 0,
    time: 0,
    keys: {
      left: false,
      right: false,
      boost: false,
      brake: false,
    },
    player: {
      x: WIDTH / 2,
      y: HEIGHT - 95,
      vx: 0,
    },
    houses: [],
    papersInFlight: [],
    obstacles: [],
    bundles: [],
  };

  class SoundFX {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      this.ctx = new AudioContextCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
    }

    setMuted(value) {
      this.muted = value;
      if (!this.master) {
        return;
      }
      this.master.gain.setTargetAtTime(value ? 0 : 0.28, this.ctx.currentTime, 0.02);
    }

    tone(freq, type, duration, from, to, when = 0) {
      if (!this.ctx || this.muted) {
        return;
      }
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(from, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + duration);

      osc.connect(gain);
      gain.connect(this.master);

      osc.start(t);
      osc.stop(t + duration);
    }

    noise(duration, from, to) {
      if (!this.ctx || this.muted) {
        return;
      }
      const sampleRate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;

      src.buffer = buffer;
      gain.gain.setValueAtTime(from, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + duration);

      src.connect(gain);
      gain.connect(this.master);
      src.start(t);
    }

    throwPaper() {
      this.tone(980, "triangle", 0.06, 0.09, 0.001);
      this.tone(680, "square", 0.09, 0.05, 0.001, 0.03);
    }

    deliver() {
      this.tone(880, "sine", 0.07, 0.11, 0.001);
      this.tone(1170, "triangle", 0.11, 0.08, 0.001, 0.06);
    }

    miss() {
      this.tone(220, "sawtooth", 0.16, 0.08, 0.001);
    }

    crash() {
      this.noise(0.22, 0.13, 0.001);
      this.tone(120, "square", 0.12, 0.09, 0.001);
    }

    pickup() {
      this.tone(520, "triangle", 0.07, 0.09, 0.001);
      this.tone(740, "triangle", 0.1, 0.06, 0.001, 0.04);
    }

    gameOver() {
      this.tone(390, "square", 0.15, 0.08, 0.001);
      this.tone(290, "square", 0.19, 0.07, 0.001, 0.13);
      this.tone(180, "square", 0.28, 0.06, 0.001, 0.27);
    }

    win() {
      this.tone(660, "triangle", 0.08, 0.07, 0.001);
      this.tone(920, "triangle", 0.08, 0.07, 0.001, 0.09);
      this.tone(1220, "triangle", 0.13, 0.07, 0.001, 0.18);
    }
  }

  const audio = new SoundFX();

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function intersects(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function resetGame() {
    state.mode = "playing";
    state.score = 0;
    state.lives = 3;
    state.papers = 15;
    state.deliveries = 0;
    state.distance = 0;
    state.speed = 245;
    state.throwCooldown = 0;
    state.invuln = 0;
    state.houseSpawnMeter = 120;
    state.obstacleTimer = 0.8;
    state.bundleTimer = 3;
    state.time = 0;
    state.keys.left = false;
    state.keys.right = false;
    state.keys.boost = false;
    state.keys.brake = false;

    state.player.x = WIDTH / 2;
    state.player.y = HEIGHT - 95;
    state.player.vx = 0;

    state.houses = [];
    state.papersInFlight = [];
    state.obstacles = [];
    state.bundles = [];

    for (let i = 0; i < 7; i += 1) {
      spawnHouseRow(-i * 115 - 80);
    }

    overlay.classList.remove("visible");
    syncHUD();
  }

  function endGame(win) {
    if (state.mode !== "playing") {
      return;
    }

    state.mode = win ? "win" : "gameover";
    startBtn.textContent = "Restart Route";

    overlay.innerHTML = `
      <h1>${win ? "Route Complete" : "Route Failed"}</h1>
      <p>${win ? "Nice delivery run." : "Traffic got the better of you."}</p>
      <p>Score: <strong>${state.score}</strong> | Deliveries: <strong>${state.deliveries}</strong></p>
      <p>Press R or click below to restart.</p>
      <button id="startBtn" type="button">Restart Route</button>
    `;

    overlay.classList.add("visible");

    const replacementStart = document.getElementById("startBtn");
    replacementStart.addEventListener("click", () => {
      audio.init();
      resetGame();
    });

    if (win) {
      audio.win();
    } else {
      audio.gameOver();
    }
  }

  function spawnHouseRow(y) {
    const houseW = 170;
    const houseH = 90;

    const leftSubscriber = Math.random() < SUBSCRIBER_CHANCE;
    const rightSubscriber = Math.random() < SUBSCRIBER_CHANCE;

    state.houses.push({
      side: "left",
      x: 18,
      y,
      w: houseW,
      h: houseH,
      subscriber: leftSubscriber,
      delivered: false,
      windowHit: false,
      mailbox: {
        x: ROAD_X - 26,
        y: y + 58,
        w: 16,
        h: 20,
      },
    });

    state.houses.push({
      side: "right",
      x: WIDTH - 18 - houseW,
      y,
      w: houseW,
      h: houseH,
      subscriber: rightSubscriber,
      delivered: false,
      windowHit: false,
      mailbox: {
        x: ROAD_RIGHT + 10,
        y: y + 58,
        w: 16,
        h: 20,
      },
    });
  }

  function spawnObstacle() {
    const r = Math.random();
    if (r < 0.5) {
      const laneX = random(ROAD_X + 28, ROAD_RIGHT - 28);
      state.obstacles.push({
        type: "car",
        x: laneX - 24,
        y: -120,
        w: 48,
        h: 92,
        vy: random(40, 110),
        vx: random(-22, 22),
      });
      return;
    }

    if (r < 0.8) {
      const laneX = random(ROAD_X + 18, ROAD_RIGHT - 18);
      state.obstacles.push({
        type: "cone",
        x: laneX - 14,
        y: -70,
        w: 28,
        h: 30,
        vy: random(20, 70),
        vx: 0,
      });
      return;
    }

    const fromLeft = Math.random() < 0.5;
    state.obstacles.push({
      type: "dog",
      x: fromLeft ? ROAD_X - 70 : ROAD_RIGHT + 20,
      y: random(-120, -20),
      w: 36,
      h: 24,
      vy: random(15, 60),
      vx: fromLeft ? random(70, 130) : random(-130, -70),
    });
  }

  function spawnBundle() {
    state.bundles.push({
      x: random(ROAD_X + 28, ROAD_RIGHT - 56),
      y: -80,
      w: 28,
      h: 18,
    });
  }

  function findTarget(preferredSide = "auto") {
    const playerCenter = {
      x: state.player.x,
      y: state.player.y,
    };

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const house of state.houses) {
      if (house.delivered || !house.subscriber) {
        continue;
      }
      if (house.mailbox.y > playerCenter.y + 60 || house.mailbox.y < playerCenter.y - 240) {
        continue;
      }

      const side = house.side;
      if (preferredSide !== "auto" && preferredSide !== side) {
        continue;
      }

      const dx = house.mailbox.x + house.mailbox.w * 0.5 - playerCenter.x;
      const dy = house.mailbox.y - playerCenter.y;
      const dist = Math.hypot(dx, dy);

      const sidePenalty = preferredSide === "auto" ? (side === "left" ? (playerCenter.x > WIDTH * 0.5 ? 45 : 0) : playerCenter.x < WIDTH * 0.5 ? 45 : 0) : 0;

      const score = dist + sidePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = house;
      }
    }

    return best;
  }

  function throwPaper(side = "auto") {
    if (state.mode !== "playing" || state.throwCooldown > 0 || state.papers <= 0) {
      return;
    }

    const targetHouse = findTarget(side);
    state.papers -= 1;

    const startX = state.player.x;
    const startY = state.player.y - 18;

    let vx = state.player.x < WIDTH * 0.5 ? -200 : 200;
    let vy = -130;

    if (targetHouse) {
      const tx = targetHouse.mailbox.x + targetHouse.mailbox.w * 0.5;
      const ty = targetHouse.mailbox.y + targetHouse.mailbox.h * 0.5;
      const dx = tx - startX;
      const dy = ty - startY;
      const mag = Math.max(0.001, Math.hypot(dx, dy));
      const speed = 430;
      vx = (dx / mag) * speed;
      vy = (dy / mag) * speed * 0.8;
    }

    state.papersInFlight.push({
      x: startX - 6,
      y: startY - 2,
      w: 12,
      h: 6,
      vx,
      vy,
      life: 1.6,
    });

    state.throwCooldown = 0.22;
    audio.throwPaper();
    syncHUD();
  }

  function hitPlayer() {
    if (state.invuln > 0) {
      return;
    }

    state.lives -= 1;
    state.invuln = 1.15;
    state.player.x = WIDTH / 2;
    state.player.vx = 0;
    audio.crash();
    syncHUD();

    if (state.lives <= 0) {
      endGame(false);
    }
  }

  function update(dt) {
    if (state.mode !== "playing") {
      return;
    }

    state.time += dt;
    state.throwCooldown = Math.max(0, state.throwCooldown - dt);
    state.invuln = Math.max(0, state.invuln - dt);

    if (state.keys.boost) {
      state.speed += 115 * dt;
    } else if (state.keys.brake) {
      state.speed -= 125 * dt;
    } else {
      state.speed += (245 - state.speed) * dt * 2.8;
    }
    state.speed = clamp(state.speed, state.minSpeed, state.maxSpeed);

    const steer = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    state.player.vx += steer * 950 * dt;
    state.player.vx *= Math.pow(0.0025, dt);
    state.player.vx = clamp(state.player.vx, -230, 230);
    state.player.x += state.player.vx * dt;
    state.player.x = clamp(state.player.x, ROAD_X + 24, ROAD_RIGHT - 24);

    const moveY = state.speed * dt;
    state.distance += moveY;

    state.houseSpawnMeter += moveY;
    while (state.houseSpawnMeter >= 114) {
      state.houseSpawnMeter -= 114;
      spawnHouseRow(-110);
    }

    state.obstacleTimer -= dt;
    if (state.obstacleTimer <= 0) {
      spawnObstacle();
      state.obstacleTimer = random(0.55, 1.3);
    }

    state.bundleTimer -= dt;
    if (state.bundleTimer <= 0) {
      spawnBundle();
      state.bundleTimer = random(4.8, 8.4);
    }

    for (const house of state.houses) {
      house.y += moveY;
      house.mailbox.y += moveY;
    }
    state.houses = state.houses.filter((house) => house.y < HEIGHT + 120);

    for (const bundle of state.bundles) {
      bundle.y += moveY;
    }

    state.bundles = state.bundles.filter((bundle) => bundle.y < HEIGHT + 80);

    const playerRect = {
      x: state.player.x - PLAYER_W * 0.5,
      y: state.player.y - PLAYER_H * 0.5,
      w: PLAYER_W,
      h: PLAYER_H,
    };

    for (const bundle of [...state.bundles]) {
      if (intersects(bundle, playerRect)) {
        state.papers += 5;
        state.score += 15;
        audio.pickup();
        bundle.collected = true;
      }
    }
    state.bundles = state.bundles.filter((bundle) => !bundle.collected);

    for (const obstacle of state.obstacles) {
      obstacle.y += (moveY + obstacle.vy * dt);
      obstacle.x += obstacle.vx * dt;

      if (obstacle.type === "dog") {
        if (obstacle.x < ROAD_X - 90 || obstacle.x > ROAD_RIGHT + 52) {
          obstacle.vx *= -1;
        }
      } else if (obstacle.type === "car") {
        if (obstacle.x < ROAD_X + 8 || obstacle.x + obstacle.w > ROAD_RIGHT - 8) {
          obstacle.vx *= -1;
        }
      }

      if (intersects(obstacle, playerRect)) {
        obstacle.hit = true;
        hitPlayer();
      }
    }
    state.obstacles = state.obstacles.filter((obstacle) => !obstacle.hit && obstacle.y < HEIGHT + 130);

    for (const paper of state.papersInFlight) {
      paper.x += paper.vx * dt;
      paper.y += paper.vy * dt;
      paper.vy += 58 * dt;
      paper.life -= dt;

      let resolved = false;

      for (const house of state.houses) {
        if (resolved) {
          break;
        }

        if (intersects(paper, house.mailbox)) {
          if (house.subscriber && !house.delivered) {
            house.delivered = true;
            state.deliveries += 1;
            state.score += 100;
            audio.deliver();
          } else {
            state.score = Math.max(0, state.score - 20);
            audio.miss();
          }
          paper.life = 0;
          resolved = true;
          break;
        }

        if (intersects(paper, house)) {
          if (!house.windowHit) {
            house.windowHit = true;
          }
          if (house.subscriber && !house.delivered) {
            state.score = Math.max(0, state.score - 12);
          }
          audio.miss();
          paper.life = 0;
          resolved = true;
        }
      }

      if (resolved) {
        continue;
      }

      for (const obstacle of state.obstacles) {
        if (intersects(paper, obstacle)) {
          state.score += obstacle.type === "car" ? 25 : 10;
          obstacle.hit = true;
          paper.life = 0;
          audio.pickup();
          break;
        }
      }
    }

    state.papersInFlight = state.papersInFlight.filter(
      (paper) =>
        paper.life > 0 &&
        paper.x > -30 &&
        paper.x < WIDTH + 30 &&
        paper.y > -40 &&
        paper.y < HEIGHT + 40,
    );

    if (state.distance >= GOAL_DISTANCE) {
      endGame(true);
    }

    syncHUD();
  }

  function drawRoad(distanceOffset) {
    const grass = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grass.addColorStop(0, "#3fb54d");
    grass.addColorStop(1, "#2b8f37");

    ctx.fillStyle = grass;
    ctx.fillRect(0, 0, ROAD_X, HEIGHT);
    ctx.fillRect(ROAD_RIGHT, 0, WIDTH - ROAD_RIGHT, HEIGHT);

    ctx.fillStyle = "#2f3640";
    ctx.fillRect(ROAD_X, 0, ROAD_WIDTH, HEIGHT);

    ctx.fillStyle = "#4a5f77";
    ctx.fillRect(ROAD_X - 7, 0, 7, HEIGHT);
    ctx.fillRect(ROAD_RIGHT, 0, 7, HEIGHT);

    ctx.fillStyle = "#f8f1b2";
    const stripeHeight = 40;
    const stripeGap = 34;
    const cycle = stripeHeight + stripeGap;
    const offset = distanceOffset % cycle;
    for (let y = -cycle; y < HEIGHT + cycle; y += cycle) {
      const sy = y + offset;
      ctx.fillRect(WIDTH / 2 - 4, sy, 8, stripeHeight);
    }
  }

  function drawHouse(house) {
    const baseColor = house.subscriber ? "#f2f2ea" : "#cdd1d4";
    const roofColor = house.subscriber ? "#e06d58" : "#64727d";

    ctx.fillStyle = baseColor;
    ctx.fillRect(house.x, house.y, house.w, house.h);

    ctx.fillStyle = roofColor;
    ctx.fillRect(house.x - 6, house.y - 12, house.w + 12, 14);

    ctx.fillStyle = house.windowHit ? "#b6c4d6" : "#88cdf4";
    ctx.fillRect(house.x + 24, house.y + 24, 30, 22);
    ctx.fillRect(house.x + house.w - 54, house.y + 24, 30, 22);

    if (house.windowHit) {
      ctx.strokeStyle = "#7e8ea2";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(house.x + 24, house.y + 24);
      ctx.lineTo(house.x + 54, house.y + 46);
      ctx.moveTo(house.x + 54, house.y + 24);
      ctx.lineTo(house.x + 24, house.y + 46);
      ctx.stroke();
    }

    ctx.fillStyle = house.subscriber ? "#4ebd5f" : "#d65959";
    ctx.fillRect(house.mailbox.x, house.mailbox.y, house.mailbox.w, house.mailbox.h);

    ctx.fillStyle = house.delivered ? "#ffe27c" : "#f2f2f2";
    if (house.side === "left") {
      ctx.fillRect(house.mailbox.x + 12, house.mailbox.y + 2, 10, 4);
    } else {
      ctx.fillRect(house.mailbox.x - 6, house.mailbox.y + 2, 10, 4);
    }
  }

  function drawObstacle(obstacle) {
    if (obstacle.type === "car") {
      ctx.fillStyle = "#d74a3a";
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(obstacle.x + 6, obstacle.y + 8, obstacle.w - 12, 18);
      ctx.fillRect(obstacle.x + 6, obstacle.y + obstacle.h - 26, obstacle.w - 12, 18);
      return;
    }

    if (obstacle.type === "cone") {
      ctx.fillStyle = "#ff8a2b";
      ctx.beginPath();
      ctx.moveTo(obstacle.x + obstacle.w * 0.5, obstacle.y);
      ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h);
      ctx.lineTo(obstacle.x, obstacle.y + obstacle.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe3b7";
      ctx.fillRect(obstacle.x + 4, obstacle.y + obstacle.h - 9, obstacle.w - 8, 3);
      return;
    }

    ctx.fillStyle = "#8f5f3b";
    ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.w, obstacle.h - 8);
    ctx.fillStyle = "#231f1a";
    ctx.fillRect(obstacle.x + 4, obstacle.y + 3, 10, 8);
    ctx.fillRect(obstacle.x + obstacle.w - 14, obstacle.y + 3, 10, 8);
  }

  function drawBundle(bundle) {
    ctx.fillStyle = "#ececec";
    ctx.fillRect(bundle.x, bundle.y, bundle.w, bundle.h);
    ctx.strokeStyle = "#343434";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bundle.x + bundle.w * 0.5, bundle.y);
    ctx.lineTo(bundle.x + bundle.w * 0.5, bundle.y + bundle.h);
    ctx.stroke();
  }

  function drawPlayer() {
    const x = state.player.x;
    const y = state.player.y;
    const flash = state.invuln > 0 && Math.floor(state.time * 22) % 2 === 0;

    if (flash) {
      return;
    }

    ctx.fillStyle = "#232323";
    ctx.beginPath();
    ctx.arc(x - 13, y + 22, 11, 0, Math.PI * 2);
    ctx.arc(x + 13, y + 22, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f6d46e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 13, y + 22);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x + 13, y + 22);
    ctx.lineTo(x - 2, y + 22);
    ctx.lineTo(x + 8, y + 6);
    ctx.stroke();

    ctx.fillStyle = "#4f83ff";
    ctx.fillRect(x - 8, y - 10, 16, 18);

    ctx.fillStyle = "#f2ccb0";
    ctx.beginPath();
    ctx.arc(x, y - 14, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPaper(paper) {
    ctx.save();
    ctx.translate(paper.x + paper.w * 0.5, paper.y + paper.h * 0.5);
    ctx.rotate(Math.atan2(paper.vy, paper.vx));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-paper.w * 0.5, -paper.h * 0.5, paper.w, paper.h);
    ctx.strokeStyle = "#363636";
    ctx.lineWidth = 1;
    ctx.strokeRect(-paper.w * 0.5, -paper.h * 0.5, paper.w, paper.h);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawRoad(state.distance);

    for (const house of state.houses) {
      drawHouse(house);
    }

    for (const bundle of state.bundles) {
      drawBundle(bundle);
    }

    for (const obstacle of state.obstacles) {
      drawObstacle(obstacle);
    }

    for (const paper of state.papersInFlight) {
      drawPaper(paper);
    }

    drawPlayer();

    if (state.mode === "paused") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fff7c5";
      ctx.font = "700 48px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
    }
  }

  function syncHUD() {
    scoreEl.textContent = String(state.score);
    livesEl.textContent = String(state.lives);
    papersEl.textContent = String(state.papers);
    deliveriesEl.textContent = String(state.deliveries);
    const pct = Math.min(100, Math.floor((state.distance / GOAL_DISTANCE) * 100));
    distanceEl.textContent = `${pct}%`;
  }

  function setPause(pause) {
    if (state.mode === "playing" && pause) {
      state.mode = "paused";
      return;
    }
    if (state.mode === "paused" && !pause) {
      state.mode = "playing";
    }
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    audio.init();

    if (key === "arrowleft" || key === "a") {
      state.keys.left = true;
    }
    if (key === "arrowright" || key === "d") {
      state.keys.right = true;
    }
    if (key === "arrowup" || key === "w") {
      state.keys.boost = true;
    }
    if (key === "arrowdown" || key === "s") {
      state.keys.brake = true;
    }
    if (key === " " || key === "spacebar") {
      event.preventDefault();
      throwPaper("auto");
    }
    if (key === "q") {
      throwPaper("left");
    }
    if (key === "e") {
      throwPaper("right");
    }
    if (key === "p") {
      if (state.mode === "playing") {
        setPause(true);
      } else if (state.mode === "paused") {
        setPause(false);
      }
    }
    if (key === "r" && (state.mode === "gameover" || state.mode === "win")) {
      resetGame();
    }
  }

  function handleKeyUp(event) {
    const key = event.key.toLowerCase();

    if (key === "arrowleft" || key === "a") {
      state.keys.left = false;
    }
    if (key === "arrowright" || key === "d") {
      state.keys.right = false;
    }
    if (key === "arrowup" || key === "w") {
      state.keys.boost = false;
    }
    if (key === "arrowdown" || key === "s") {
      state.keys.brake = false;
    }
  }

  function bindTouchControls() {
    const buttons = document.querySelectorAll("[data-control]");
    for (const button of buttons) {
      const control = button.getAttribute("data-control");
      const onDown = (event) => {
        event.preventDefault();
        audio.init();
        if (control === "left") {
          state.keys.left = true;
        }
        if (control === "right") {
          state.keys.right = true;
        }
        if (control === "throw") {
          throwPaper("auto");
        }
      };
      const onUp = (event) => {
        event.preventDefault();
        if (control === "left") {
          state.keys.left = false;
        }
        if (control === "right") {
          state.keys.right = false;
        }
      };

      button.addEventListener("pointerdown", onDown);
      button.addEventListener("pointerup", onUp);
      button.addEventListener("pointercancel", onUp);
      button.addEventListener("pointerleave", onUp);
      button.addEventListener("touchstart", onDown, { passive: false });
      button.addEventListener("touchend", onUp, { passive: false });
    }
  }

  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(0.032, (now - lastFrame) / 1000);
    lastFrame = now;

    if (state.mode === "playing") {
      update(dt);
    }

    draw();
    requestAnimationFrame(frame);
  }

  startBtn.addEventListener("click", () => {
    audio.init();
    resetGame();
  });

  muteBtn.addEventListener("click", () => {
    audio.init();
    const nextMuted = !audio.muted;
    audio.setMuted(nextMuted);
    muteBtn.textContent = nextMuted ? "Sound: Off" : "Sound: On";
    muteBtn.setAttribute("aria-pressed", String(nextMuted));
  });

  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);

  bindTouchControls();
  syncHUD();
  requestAnimationFrame(frame);
})();
