(() => {
  const GRID_SIZE = 20;
  const TICK_MS = 140;

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_DIR = {
    ArrowUp: DIRECTIONS.up,
    ArrowDown: DIRECTIONS.down,
    ArrowLeft: DIRECTIONS.left,
    ArrowRight: DIRECTIONS.right,
    Up: DIRECTIONS.up,
    Down: DIRECTIONS.down,
    Left: DIRECTIONS.left,
    Right: DIRECTIONS.right,
    up: DIRECTIONS.up,
    down: DIRECTIONS.down,
    left: DIRECTIONS.left,
    right: DIRECTIONS.right,
    w: DIRECTIONS.up,
    s: DIRECTIONS.down,
    a: DIRECTIONS.left,
    d: DIRECTIONS.right,
  };

  const CODE_DIR = {
    ArrowUp: DIRECTIONS.up,
    ArrowDown: DIRECTIONS.down,
    ArrowLeft: DIRECTIONS.left,
    ArrowRight: DIRECTIONS.right,
    KeyW: DIRECTIONS.up,
    KeyS: DIRECTIONS.down,
    KeyA: DIRECTIONS.left,
    KeyD: DIRECTIONS.right,
  };

  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const pauseBtn = document.getElementById("pause");
  const restartBtn = document.getElementById("restart");
  const soundBtn = document.getElementById("sound");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const renderState = {
    size: 400,
    cell: 20,
  };

  function createRng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const sound = {
    ctx: null,
    enabled: true,
    ready: false,
    ensure() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
    },
    unlock() {
      if (!this.enabled) {
        return;
      }
      this.ensure();
      if (!this.ctx) {
        return;
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().then(() => {
          this.ready = true;
        });
      } else {
        this.ready = true;
      }
    },
    setEnabled(next) {
      this.enabled = next;
      if (!next && this.ctx) {
        this.ctx.suspend();
      } else {
        this.unlock();
      }
    },
    tone({ freq, duration, type = "sine", gain = 0.12 }) {
      if (!this.enabled) {
        return;
      }
      this.ensure();
      if (!this.ctx || !this.ready || this.ctx.state === "suspended") {
        return;
      }
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      amp.gain.setValueAtTime(0, now);
      amp.gain.linearRampToValueAtTime(gain, now + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },
    eat() {
      this.tone({ freq: 520, duration: 0.12, type: "triangle", gain: 0.1 });
    },
    lose() {
      this.tone({ freq: 160, duration: 0.4, type: "sawtooth", gain: 0.14 });
    },
  };

  function positionsEqual(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function placeFood(gridSize, snake, rng) {
    const occupied = new Set(snake.map((pos) => `${pos.x},${pos.y}`));
    const empty = [];

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) {
          empty.push({ x, y });
        }
      }
    }

    if (empty.length === 0) {
      return null;
    }

    const idx = Math.floor(rng() * empty.length);
    return empty[idx];
  }

  function createGame({ gridSize = GRID_SIZE, rng = Math.random } = {}) {
    const startX = Math.floor(gridSize / 2);
    const startY = Math.floor(gridSize / 2);
    const snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    const food = placeFood(gridSize, snake, rng);

    return {
      gridSize,
      snake,
      dir: DIRECTIONS.right,
      nextDir: DIRECTIONS.right,
      food,
      score: 0,
      alive: true,
      paused: false,
      rng,
    };
  }

  function setDirection(state, dir) {
    if (!state.alive) {
      return state;
    }

    const current = state.nextDir || state.dir;
    if (isOpposite(dir, current)) {
      return state;
    }

    return { ...state, nextDir: dir };
  }

  function advance(state) {
    if (!state.alive || state.paused) {
      return state;
    }

    const dir = state.nextDir || state.dir;
    const head = {
      x: state.snake[0].x + dir.x,
      y: state.snake[0].y + dir.y,
    };

    if (
      head.x < 0 ||
      head.x >= state.gridSize ||
      head.y < 0 ||
      head.y >= state.gridSize
    ) {
      return { ...state, alive: false };
    }

    const ate = state.food && positionsEqual(head, state.food);
    const body = ate ? state.snake : state.snake.slice(0, -1);

    if (body.some((segment) => positionsEqual(segment, head))) {
      return { ...state, alive: false };
    }

    const nextSnake = [head, ...state.snake];
    if (!ate) {
      nextSnake.pop();
    }

    const nextFood = ate ? placeFood(state.gridSize, nextSnake, state.rng) : state.food;

    return {
      ...state,
      snake: nextSnake,
      dir,
      nextDir: dir,
      food: nextFood,
      score: ate ? state.score + 1 : state.score,
      alive: nextFood !== null,
    };
  }

  let rng = createRng(Date.now());
  let game = createGame({ rng });
  let lastTick = 0;

  function updateStatus() {
    scoreEl.textContent = String(game.score);

    if (!game.alive) {
      statusEl.textContent = game.food === null ? "You win" : "Game over";
    } else if (game.paused) {
      statusEl.textContent = "Paused";
    } else {
      statusEl.textContent = "Playing";
    }

    pauseBtn.textContent = game.paused ? "Resume" : "Pause";
  }

  function resizeCanvas() {
    const containerWidth = canvas.parentElement.clientWidth;
    const maxSize = Math.min(520, containerWidth);
    const size = Math.max(260, Math.floor(maxSize / GRID_SIZE) * GRID_SIZE);
    const dpr = window.devicePixelRatio || 1;

    renderState.size = size;
    renderState.cell = size / GRID_SIZE;

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function drawGrid() {
    const { size, cell } = renderState;
    ctx.strokeStyle = "rgba(80, 70, 60, 0.12)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const pos = i * cell;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }
  }

  function drawSnake() {
    const { cell } = renderState;
    game.snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? "#2f6a3f" : "#3f7f4b";
      ctx.fillRect(
        segment.x * cell + 1,
        segment.y * cell + 1,
        cell - 2,
        cell - 2
      );
    });
  }

  function drawFood() {
    if (!game.food) {
      return;
    }

    const { cell } = renderState;
    const x = game.food.x * cell + cell / 2;
    const y = game.food.y * cell + cell / 2;
    const radius = Math.max(4, cell * 0.3);

    ctx.fillStyle = "#c5483d";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    const { size } = renderState;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#f6f0e6";
    ctx.fillRect(0, 0, size, size);
    drawGrid();
    drawFood();
    drawSnake();
    updateStatus();
  }

  function resetGame() {
    rng = createRng(Date.now());
    game = createGame({ rng });
    lastTick = 0;
    render();
  }

  function togglePause() {
    if (!game.alive) {
      return;
    }
    game = { ...game, paused: !game.paused };
    render();
  }

  function handleDirectionInput(dir) {
    game = setDirection(game, dir);
  }

  function getDirectionFromEvent(event) {
    const key = event.key;
    if (key && KEY_DIR[key]) {
      return KEY_DIR[key];
    }
    if (typeof key === "string") {
      const lowered = key.toLowerCase();
      if (KEY_DIR[lowered]) {
        return KEY_DIR[lowered];
      }
    }
    const code = event.code;
    if (code && CODE_DIR[code]) {
      return CODE_DIR[code];
    }
    return null;
  }

  function handleKeyDown(event) {
    sound.unlock();
    const dir = getDirectionFromEvent(event);

    if (dir) {
      event.preventDefault();
      handleDirectionInput(dir);
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
      return;
    }

    if (event.code === "Enter") {
      event.preventDefault();
      resetGame();
      return;
    }

    if (event.key && event.key.toLowerCase() === "m") {
      event.preventDefault();
      sound.setEnabled(!sound.enabled);
      updateSoundUI();
    }
  }

  function tick(timestamp) {
    if (!lastTick) {
      lastTick = timestamp;
    }

    const delta = timestamp - lastTick;
    if (delta >= TICK_MS) {
      const previous = game;
      game = advance(game);
      if (game.score > previous.score) {
        sound.eat();
      }
      if (previous.alive && !game.alive) {
        sound.lose();
      }
      lastTick = timestamp;
      render();
    }

    requestAnimationFrame(tick);
  }

  function updateSoundUI() {
    const enabled = sound.enabled;
    soundBtn.textContent = enabled ? "Sound: On" : "Sound: Off";
    soundBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  window.addEventListener("keydown", handleKeyDown, { capture: true });
  window.addEventListener(
    "pointerdown",
    () => {
      sound.unlock();
    },
    { once: true }
  );

  document.querySelectorAll(".control").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      sound.unlock();
      const dir = button.dataset.dir;
      if (dir && DIRECTIONS[dir]) {
        handleDirectionInput(DIRECTIONS[dir]);
        button.blur();
      }
    });
  });

  pauseBtn.addEventListener("click", () => {
    sound.unlock();
    togglePause();
  });
  restartBtn.addEventListener("click", () => {
    sound.unlock();
    resetGame();
  });
  soundBtn.addEventListener("click", () => {
    sound.setEnabled(!sound.enabled);
    updateSoundUI();
  });

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  render();
  updateSoundUI();
  requestAnimationFrame(tick);
})();
