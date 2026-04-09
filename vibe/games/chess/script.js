const BOARD_SIZE = 8;
const HUMAN_COLOR = "w";
const COMPUTER_COLOR = "b";
const NOVICE_LEVEL = 1;
const NOVICE_COACH_DEPTH = 2;

const LEVEL_TO_DEPTH = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
};

const PIECE_SYMBOLS = {
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const PIECE_NAMES = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5"]);

const KNIGHT_OFFSETS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const KING_OFFSETS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const BISHOP_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const levelLabelEl = document.getElementById("level-label");
const newGameBtn = document.getElementById("new-game-btn");
const hintBtn = document.getElementById("hint-btn");
const coachFeedbackEl = document.getElementById("coach-feedback");
const levelModalEl = document.getElementById("level-modal");
const levelSelectEl = document.getElementById("level-select");
const startBtn = document.getElementById("start-btn");

let gameState = null;
let playerLevel = 3;
let selectedSquare = null;
let legalMovesForSelection = [];
let gameOver = false;
let computerThinking = false;
let lastMove = null;

initializeBoardSquares();
renderBoard();

startBtn.addEventListener("click", () => {
  const requestedLevel = Number.parseInt(levelSelectEl.value, 10);
  playerLevel = Number.isNaN(requestedLevel) ? 3 : requestedLevel;
  closeLevelModal();
  startNewGame(playerLevel);
});

newGameBtn.addEventListener("click", () => {
  levelSelectEl.value = String(playerLevel);
  openLevelModal();
});

hintBtn.addEventListener("click", () => {
  showNoviceHint();
});

function initializeBoardSquares() {
  boardEl.innerHTML = "";

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const squareBtn = document.createElement("button");
      squareBtn.type = "button";
      squareBtn.className = "square";
      squareBtn.classList.add((row + col) % 2 === 0 ? "light" : "dark");
      squareBtn.dataset.row = String(row);
      squareBtn.dataset.col = String(col);
      squareBtn.addEventListener("click", onSquareClick);
      boardEl.appendChild(squareBtn);
    }
  }
}

function startNewGame(level) {
  gameState = createInitialGameState();
  playerLevel = level;
  selectedSquare = null;
  legalMovesForSelection = [];
  gameOver = false;
  computerThinking = false;
  lastMove = null;
  setCoachFeedback("");
  if (isNoviceMode()) {
    setCoachFeedback("Novice coach is on. Press Hint when you want a suggestion.");
  }

  levelLabelEl.textContent = formatLevelLabel(playerLevel);
  updateGameStatus();
  renderBoard();
}

function openLevelModal() {
  levelModalEl.classList.add("open");
  renderBoard();
}

function closeLevelModal() {
  levelModalEl.classList.remove("open");
  renderBoard();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setCoachFeedback(text) {
  coachFeedbackEl.textContent = text;
}

function formatLevelLabel(level) {
  return level === NOVICE_LEVEL ? "Level: 1 (Novice)" : `Level: ${level}`;
}

function isNoviceMode() {
  return playerLevel === NOVICE_LEVEL;
}

function onSquareClick(event) {
  if (!gameState || gameOver || computerThinking || levelModalEl.classList.contains("open")) {
    return;
  }

  if (gameState.turn !== HUMAN_COLOR) {
    return;
  }

  const button = event.currentTarget;
  const row = Number.parseInt(button.dataset.row, 10);
  const col = Number.parseInt(button.dataset.col, 10);
  const clickedPiece = gameState.board[row][col];
  const clickedOwnPiece = clickedPiece && pieceColor(clickedPiece) === HUMAN_COLOR;

  if (selectedSquare) {
    const selectedMove = legalMovesForSelection.find(
      (move) => move.to.r === row && move.to.c === col
    );

    if (selectedMove) {
      playHumanMove(selectedMove);
      return;
    }

    if (clickedOwnPiece) {
      selectedSquare = { r: row, c: col };
      legalMovesForSelection = getHumanMovesFromSquare(row, col);
    } else {
      clearSelection();
    }

    renderBoard();
    return;
  }

  if (clickedOwnPiece) {
    selectedSquare = { r: row, c: col };
    legalMovesForSelection = getHumanMovesFromSquare(row, col);
    renderBoard();
  }
}

function clearSelection() {
  selectedSquare = null;
  legalMovesForSelection = [];
}

function getHumanMovesFromSquare(row, col) {
  const allHumanMoves = generateLegalMoves(gameState, HUMAN_COLOR);
  return allHumanMoves.filter((move) => move.from.r === row && move.from.c === col);
}

function canUseHint() {
  return (
    isNoviceMode() &&
    Boolean(gameState) &&
    !gameOver &&
    !computerThinking &&
    !levelModalEl.classList.contains("open") &&
    gameState.turn === HUMAN_COLOR
  );
}

function updateNoviceCoachUI() {
  const noviceMode = isNoviceMode();
  hintBtn.classList.toggle("hidden", !noviceMode);
  coachFeedbackEl.classList.toggle("hidden", !noviceMode);
  hintBtn.disabled = !canUseHint();
}

function showNoviceHint() {
  if (!canUseHint()) {
    return;
  }

  const analysis = analyzeCandidateMoves(gameState, HUMAN_COLOR, NOVICE_COACH_DEPTH);
  if (!analysis || !analysis.bestMove) {
    setCoachFeedback("No hint available in this position.");
    return;
  }

  const hintMove = analysis.bestMove;
  selectedSquare = { ...hintMove.from };
  legalMovesForSelection = [hintMove];
  setCoachFeedback(
    `Hint: ${formatMoveForCoach(gameState, hintMove)}. ${getMoveIdea(gameState, hintMove)}`
  );
  renderBoard();
}

function playHumanMove(move) {
  if (isNoviceMode()) {
    const feedback = getNoviceMoveFeedback(gameState, move);
    setCoachFeedback(feedback);
  }

  gameState = applyMove(gameState, move);
  lastMove = move;
  clearSelection();

  const finished = updateGameStatus();
  renderBoard();

  if (!finished && gameState.turn === COMPUTER_COLOR) {
    window.setTimeout(runComputerTurn, 180);
  }
}

function runComputerTurn() {
  if (!gameState || gameOver || gameState.turn !== COMPUTER_COLOR) {
    return;
  }

  computerThinking = true;
  setStatus(isKingInCheck(gameState, COMPUTER_COLOR) ? "Computer is in check and thinking..." : "Computer is thinking...");
  renderBoard();

  window.setTimeout(() => {
    const legalMoves = generateLegalMoves(gameState, COMPUTER_COLOR);
    if (legalMoves.length === 0) {
      computerThinking = false;
      updateGameStatus();
      renderBoard();
      return;
    }

    const computerMove = chooseComputerMove(gameState, playerLevel, legalMoves);
    gameState = applyMove(gameState, computerMove);
    lastMove = computerMove;

    computerThinking = false;
    updateGameStatus();
    renderBoard();
  }, 30);
}

function chooseComputerMove(state, level, legalMoves) {
  if (!legalMoves.length) {
    return null;
  }

  if (level === 1) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  const depth = LEVEL_TO_DEPTH[level] ?? 2;
  let bestScore = -Infinity;
  let bestMoves = [];

  for (const move of legalMoves) {
    const score = minimax(applyMove(state, move), Math.max(depth - 1, 0), -Infinity, Infinity);

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function analyzeCandidateMoves(state, color, depth) {
  const legalMoves = generateLegalMoves(state, color);
  if (!legalMoves.length) {
    return null;
  }

  const scoredMoves = [];
  const searchDepth = Math.max(depth - 1, 0);
  let bestScore = color === COMPUTER_COLOR ? -Infinity : Infinity;
  let bestMoves = [];

  for (const move of legalMoves) {
    const score = minimax(applyMove(state, move), searchDepth, -Infinity, Infinity);
    scoredMoves.push({ move, score });

    if (color === COMPUTER_COLOR) {
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
      continue;
    }

    if (score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return {
    bestMove: bestMoves[Math.floor(Math.random() * bestMoves.length)],
    bestScore,
    scoredMoves,
  };
}

function getNoviceMoveFeedback(beforeState, playedMove) {
  const analysis = analyzeCandidateMoves(beforeState, HUMAN_COLOR, NOVICE_COACH_DEPTH);
  if (!analysis) {
    return "";
  }

  const playedEntry =
    analysis.scoredMoves.find((entry) => isSameMove(entry.move, playedMove)) ||
    (() => ({
      score: minimax(
        applyMove(beforeState, playedMove),
        Math.max(NOVICE_COACH_DEPTH - 1, 0),
        -Infinity,
        Infinity
      ),
    }))();

  const cpGap = playedEntry.score - analysis.bestScore;

  if (cpGap <= 35) {
    return `Great move: ${formatMoveForCoach(beforeState, playedMove)}.`;
  }

  if (cpGap <= 130) {
    return `Good move: ${formatMoveForCoach(beforeState, playedMove)}. Slightly stronger was ${formatMoveForCoach(
      beforeState,
      analysis.bestMove
    )}.`;
  }

  if (cpGap <= 280) {
    return `Playable move: ${formatMoveForCoach(beforeState, playedMove)}. Better was ${formatMoveForCoach(
      beforeState,
      analysis.bestMove
    )}.`;
  }

  return `Risky move: ${formatMoveForCoach(beforeState, playedMove)}. Consider ${formatMoveForCoach(
    beforeState,
    analysis.bestMove
  )} next time.`;
}

function minimax(state, depth, alpha, beta) {
  const sideToMove = state.turn;
  const legalMoves = generateLegalMoves(state, sideToMove);

  if (depth === 0 || legalMoves.length === 0 || state.halfmove >= 100) {
    return evaluatePosition(state, legalMoves, depth);
  }

  if (sideToMove === COMPUTER_COLOR) {
    let bestValue = -Infinity;
    for (const move of legalMoves) {
      bestValue = Math.max(bestValue, minimax(applyMove(state, move), depth - 1, alpha, beta));
      alpha = Math.max(alpha, bestValue);
      if (beta <= alpha) {
        break;
      }
    }
    return bestValue;
  }

  let bestValue = Infinity;
  for (const move of legalMoves) {
    bestValue = Math.min(bestValue, minimax(applyMove(state, move), depth - 1, alpha, beta));
    beta = Math.min(beta, bestValue);
    if (beta <= alpha) {
      break;
    }
  }

  return bestValue;
}

function evaluatePosition(state, legalMoves, depth) {
  if (state.halfmove >= 100) {
    return 0;
  }

  if (legalMoves.length === 0) {
    if (!isKingInCheck(state, state.turn)) {
      return 0;
    }

    return state.turn === COMPUTER_COLOR ? -100000 - depth : 100000 + depth;
  }

  let score = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (!piece) {
        continue;
      }

      const side = pieceColor(piece);
      const sign = side === COMPUTER_COLOR ? 1 : -1;
      const pieceType = piece.toLowerCase();
      score += sign * PIECE_VALUES[pieceType];

      if (pieceType !== "k") {
        const centerBonus = 3.5 - (Math.abs(3.5 - row) + Math.abs(3.5 - col)) / 2;
        score += sign * centerBonus * 6;
      }
    }
  }

  return score;
}

function updateGameStatus() {
  if (!gameState) {
    return true;
  }

  if (gameState.halfmove >= 100) {
    gameOver = true;
    setStatus("Draw by 50-move rule.");
    return true;
  }

  const sideToMove = gameState.turn;
  const legalMoves = generateLegalMoves(gameState, sideToMove);

  if (legalMoves.length === 0) {
    gameOver = true;

    if (isKingInCheck(gameState, sideToMove)) {
      if (sideToMove === HUMAN_COLOR) {
        setStatus("Checkmate. Computer wins.");
      } else {
        setStatus("Checkmate. You win.");
      }
    } else {
      setStatus("Stalemate. Draw.");
    }

    return true;
  }

  gameOver = false;

  if (sideToMove === HUMAN_COLOR) {
    setStatus(isKingInCheck(gameState, HUMAN_COLOR) ? "Your king is in check." : "Your move.");
  } else {
    setStatus(isKingInCheck(gameState, COMPUTER_COLOR) ? "Computer is in check and thinking..." : "Computer is thinking...");
  }

  return false;
}

function renderBoard() {
  const boardLocked =
    !gameState || gameOver || computerThinking || levelModalEl.classList.contains("open") || gameState.turn !== HUMAN_COLOR;

  boardEl.classList.toggle("disabled", boardLocked);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const squareIndex = row * BOARD_SIZE + col;
      const squareEl = boardEl.children[squareIndex];
      const piece = gameState ? gameState.board[row][col] : "";

      squareEl.textContent = piece ? PIECE_SYMBOLS[piece] : "";
      squareEl.disabled = boardLocked;

      const isSelected = selectedSquare && selectedSquare.r === row && selectedSquare.c === col;
      const isLegalDestination = legalMovesForSelection.some((move) => move.to.r === row && move.to.c === col);
      const isLastMoveSquare =
        !!lastMove &&
        ((lastMove.from.r === row && lastMove.from.c === col) || (lastMove.to.r === row && lastMove.to.c === col));

      squareEl.classList.toggle("selected", Boolean(isSelected));
      squareEl.classList.toggle("legal", Boolean(isLegalDestination));
      squareEl.classList.toggle("last-move", Boolean(isLastMoveSquare));
    }
  }

  updateNoviceCoachUI();
}

function createInitialGameState() {
  return {
    board: [
      ["r", "n", "b", "q", "k", "b", "n", "r"],
      ["p", "p", "p", "p", "p", "p", "p", "p"],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["P", "P", "P", "P", "P", "P", "P", "P"],
      ["R", "N", "B", "Q", "K", "B", "N", "R"],
    ],
    turn: "w",
    castling: {
      wK: true,
      wQ: true,
      bK: true,
      bQ: true,
    },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

function generateLegalMoves(state, color) {
  const pseudoMoves = generatePseudoMoves(state, color);
  const legalMoves = [];

  for (const move of pseudoMoves) {
    const nextState = applyMove(state, move);
    if (!isKingInCheck(nextState, color)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

function generatePseudoMoves(state, color) {
  const moves = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (!piece || pieceColor(piece) !== color) {
        continue;
      }

      const type = piece.toLowerCase();
      if (type === "p") {
        addPawnMoves(state, color, row, col, moves);
      } else if (type === "n") {
        addKnightMoves(state, color, row, col, moves);
      } else if (type === "b") {
        addSlidingMoves(state, color, row, col, BISHOP_DIRECTIONS, moves);
      } else if (type === "r") {
        addSlidingMoves(state, color, row, col, ROOK_DIRECTIONS, moves);
      } else if (type === "q") {
        addSlidingMoves(state, color, row, col, BISHOP_DIRECTIONS, moves);
        addSlidingMoves(state, color, row, col, ROOK_DIRECTIONS, moves);
      } else if (type === "k") {
        addKingMoves(state, color, row, col, moves);
      }
    }
  }

  return moves;
}

function addPawnMoves(state, color, row, col, moves) {
  const direction = color === "w" ? -1 : 1;
  const startRow = color === "w" ? 6 : 1;
  const promotionRow = color === "w" ? 0 : 7;
  const board = state.board;

  const oneStepRow = row + direction;
  if (inBounds(oneStepRow, col) && !board[oneStepRow][col]) {
    if (oneStepRow === promotionRow) {
      moves.push(createMove(row, col, oneStepRow, col, { promotion: "q" }));
    } else {
      moves.push(createMove(row, col, oneStepRow, col));
    }

    const twoStepRow = row + direction * 2;
    if (row === startRow && inBounds(twoStepRow, col) && !board[twoStepRow][col]) {
      moves.push(createMove(row, col, twoStepRow, col));
    }
  }

  for (const colOffset of [-1, 1]) {
    const targetRow = row + direction;
    const targetCol = col + colOffset;

    if (!inBounds(targetRow, targetCol)) {
      continue;
    }

    const targetPiece = board[targetRow][targetCol];
    if (targetPiece && pieceColor(targetPiece) !== color) {
      if (targetRow === promotionRow) {
        moves.push(createMove(row, col, targetRow, targetCol, { promotion: "q" }));
      } else {
        moves.push(createMove(row, col, targetRow, targetCol));
      }
    }

    if (
      state.enPassant &&
      state.enPassant.r === targetRow &&
      state.enPassant.c === targetCol &&
      board[row][targetCol] &&
      pieceColor(board[row][targetCol]) !== color &&
      board[row][targetCol].toLowerCase() === "p"
    ) {
      moves.push(createMove(row, col, targetRow, targetCol, { enPassant: true }));
    }
  }
}

function addKnightMoves(state, color, row, col, moves) {
  const board = state.board;

  for (const [rowOffset, colOffset] of KNIGHT_OFFSETS) {
    const targetRow = row + rowOffset;
    const targetCol = col + colOffset;
    if (!inBounds(targetRow, targetCol)) {
      continue;
    }

    const targetPiece = board[targetRow][targetCol];
    if (!targetPiece || pieceColor(targetPiece) !== color) {
      moves.push(createMove(row, col, targetRow, targetCol));
    }
  }
}

function addSlidingMoves(state, color, row, col, directions, moves) {
  const board = state.board;

  for (const [rowDir, colDir] of directions) {
    let targetRow = row + rowDir;
    let targetCol = col + colDir;

    while (inBounds(targetRow, targetCol)) {
      const targetPiece = board[targetRow][targetCol];

      if (!targetPiece) {
        moves.push(createMove(row, col, targetRow, targetCol));
      } else {
        if (pieceColor(targetPiece) !== color) {
          moves.push(createMove(row, col, targetRow, targetCol));
        }
        break;
      }

      targetRow += rowDir;
      targetCol += colDir;
    }
  }
}

function addKingMoves(state, color, row, col, moves) {
  const board = state.board;

  for (const [rowOffset, colOffset] of KING_OFFSETS) {
    const targetRow = row + rowOffset;
    const targetCol = col + colOffset;

    if (!inBounds(targetRow, targetCol)) {
      continue;
    }

    const targetPiece = board[targetRow][targetCol];
    if (!targetPiece || pieceColor(targetPiece) !== color) {
      moves.push(createMove(row, col, targetRow, targetCol));
    }
  }

  const enemyColor = oppositeColor(color);
  if (color === "w" && row === 7 && col === 4) {
    if (
      state.castling.wK &&
      board[7][5] === "" &&
      board[7][6] === "" &&
      board[7][7] === "R" &&
      !isSquareAttacked(state, 7, 4, enemyColor) &&
      !isSquareAttacked(state, 7, 5, enemyColor) &&
      !isSquareAttacked(state, 7, 6, enemyColor)
    ) {
      moves.push(createMove(7, 4, 7, 6, { castle: "K" }));
    }

    if (
      state.castling.wQ &&
      board[7][1] === "" &&
      board[7][2] === "" &&
      board[7][3] === "" &&
      board[7][0] === "R" &&
      !isSquareAttacked(state, 7, 4, enemyColor) &&
      !isSquareAttacked(state, 7, 3, enemyColor) &&
      !isSquareAttacked(state, 7, 2, enemyColor)
    ) {
      moves.push(createMove(7, 4, 7, 2, { castle: "Q" }));
    }
  }

  if (color === "b" && row === 0 && col === 4) {
    if (
      state.castling.bK &&
      board[0][5] === "" &&
      board[0][6] === "" &&
      board[0][7] === "r" &&
      !isSquareAttacked(state, 0, 4, enemyColor) &&
      !isSquareAttacked(state, 0, 5, enemyColor) &&
      !isSquareAttacked(state, 0, 6, enemyColor)
    ) {
      moves.push(createMove(0, 4, 0, 6, { castle: "K" }));
    }

    if (
      state.castling.bQ &&
      board[0][1] === "" &&
      board[0][2] === "" &&
      board[0][3] === "" &&
      board[0][0] === "r" &&
      !isSquareAttacked(state, 0, 4, enemyColor) &&
      !isSquareAttacked(state, 0, 3, enemyColor) &&
      !isSquareAttacked(state, 0, 2, enemyColor)
    ) {
      moves.push(createMove(0, 4, 0, 2, { castle: "Q" }));
    }
  }
}

function createMove(fromRow, fromCol, toRow, toCol, extras = {}) {
  return {
    from: { r: fromRow, c: fromCol },
    to: { r: toRow, c: toCol },
    promotion: null,
    enPassant: false,
    castle: null,
    ...extras,
  };
}

function applyMove(state, move) {
  const nextState = copyState(state);
  const movingPiece = nextState.board[move.from.r][move.from.c];
  const movingColor = pieceColor(movingPiece);
  const opponentColor = oppositeColor(movingColor);

  let capturedPiece = nextState.board[move.to.r][move.to.c] || "";

  nextState.board[move.from.r][move.from.c] = "";

  if (move.enPassant) {
    const capturedPawnRow = movingColor === "w" ? move.to.r + 1 : move.to.r - 1;
    capturedPiece = nextState.board[capturedPawnRow][move.to.c] || "";
    nextState.board[capturedPawnRow][move.to.c] = "";
  }

  let pieceToPlace = movingPiece;
  if (move.promotion) {
    pieceToPlace = movingColor === "w" ? move.promotion.toUpperCase() : move.promotion.toLowerCase();
  }

  nextState.board[move.to.r][move.to.c] = pieceToPlace;

  if (move.castle) {
    const rookRow = movingColor === "w" ? 7 : 0;
    if (move.castle === "K") {
      nextState.board[rookRow][5] = nextState.board[rookRow][7];
      nextState.board[rookRow][7] = "";
    } else if (move.castle === "Q") {
      nextState.board[rookRow][3] = nextState.board[rookRow][0];
      nextState.board[rookRow][0] = "";
    }
  }

  if (movingPiece === "K") {
    nextState.castling.wK = false;
    nextState.castling.wQ = false;
  }
  if (movingPiece === "k") {
    nextState.castling.bK = false;
    nextState.castling.bQ = false;
  }
  if (movingPiece === "R" && move.from.r === 7 && move.from.c === 0) {
    nextState.castling.wQ = false;
  }
  if (movingPiece === "R" && move.from.r === 7 && move.from.c === 7) {
    nextState.castling.wK = false;
  }
  if (movingPiece === "r" && move.from.r === 0 && move.from.c === 0) {
    nextState.castling.bQ = false;
  }
  if (movingPiece === "r" && move.from.r === 0 && move.from.c === 7) {
    nextState.castling.bK = false;
  }

  if (!move.enPassant && capturedPiece === "R" && move.to.r === 7 && move.to.c === 0) {
    nextState.castling.wQ = false;
  }
  if (!move.enPassant && capturedPiece === "R" && move.to.r === 7 && move.to.c === 7) {
    nextState.castling.wK = false;
  }
  if (!move.enPassant && capturedPiece === "r" && move.to.r === 0 && move.to.c === 0) {
    nextState.castling.bQ = false;
  }
  if (!move.enPassant && capturedPiece === "r" && move.to.r === 0 && move.to.c === 7) {
    nextState.castling.bK = false;
  }

  nextState.enPassant = null;
  if (movingPiece.toLowerCase() === "p" && Math.abs(move.to.r - move.from.r) === 2) {
    nextState.enPassant = {
      r: (move.from.r + move.to.r) / 2,
      c: move.from.c,
    };
  }

  const didCapture = capturedPiece !== "";
  if (movingPiece.toLowerCase() === "p" || didCapture) {
    nextState.halfmove = 0;
  } else {
    nextState.halfmove = state.halfmove + 1;
  }

  nextState.turn = opponentColor;
  nextState.fullmove = state.fullmove + (movingColor === "b" ? 1 : 0);

  return nextState;
}

function copyState(state) {
  return {
    board: state.board.map((row) => row.slice()),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
  };
}

function isKingInCheck(state, color) {
  const kingPosition = findKing(state, color);
  if (!kingPosition) {
    return true;
  }

  return isSquareAttacked(state, kingPosition.r, kingPosition.c, oppositeColor(color));
}

function findKing(state, color) {
  const target = color === "w" ? "K" : "k";

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (state.board[row][col] === target) {
        return { r: row, c: col };
      }
    }
  }

  return null;
}

function isSquareAttacked(state, row, col, attackerColor) {
  const board = state.board;

  if (attackerColor === "w") {
    const sourceRow = row + 1;
    for (const colOffset of [-1, 1]) {
      const sourceCol = col + colOffset;
      if (inBounds(sourceRow, sourceCol) && board[sourceRow][sourceCol] === "P") {
        return true;
      }
    }
  } else {
    const sourceRow = row - 1;
    for (const colOffset of [-1, 1]) {
      const sourceCol = col + colOffset;
      if (inBounds(sourceRow, sourceCol) && board[sourceRow][sourceCol] === "p") {
        return true;
      }
    }
  }

  for (const [rowOffset, colOffset] of KNIGHT_OFFSETS) {
    const sourceRow = row + rowOffset;
    const sourceCol = col + colOffset;
    if (!inBounds(sourceRow, sourceCol)) {
      continue;
    }

    const piece = board[sourceRow][sourceCol];
    if (piece && pieceColor(piece) === attackerColor && piece.toLowerCase() === "n") {
      return true;
    }
  }

  for (const [rowDir, colDir] of BISHOP_DIRECTIONS) {
    let sourceRow = row + rowDir;
    let sourceCol = col + colDir;

    while (inBounds(sourceRow, sourceCol)) {
      const piece = board[sourceRow][sourceCol];
      if (piece) {
        if (pieceColor(piece) === attackerColor) {
          const type = piece.toLowerCase();
          if (type === "b" || type === "q") {
            return true;
          }
        }
        break;
      }

      sourceRow += rowDir;
      sourceCol += colDir;
    }
  }

  for (const [rowDir, colDir] of ROOK_DIRECTIONS) {
    let sourceRow = row + rowDir;
    let sourceCol = col + colDir;

    while (inBounds(sourceRow, sourceCol)) {
      const piece = board[sourceRow][sourceCol];
      if (piece) {
        if (pieceColor(piece) === attackerColor) {
          const type = piece.toLowerCase();
          if (type === "r" || type === "q") {
            return true;
          }
        }
        break;
      }

      sourceRow += rowDir;
      sourceCol += colDir;
    }
  }

  for (const [rowOffset, colOffset] of KING_OFFSETS) {
    const sourceRow = row + rowOffset;
    const sourceCol = col + colOffset;
    if (!inBounds(sourceRow, sourceCol)) {
      continue;
    }

    const piece = board[sourceRow][sourceCol];
    if (piece && pieceColor(piece) === attackerColor && piece.toLowerCase() === "k") {
      return true;
    }
  }

  return false;
}

function isSameMove(moveA, moveB) {
  return (
    moveA.from.r === moveB.from.r &&
    moveA.from.c === moveB.from.c &&
    moveA.to.r === moveB.to.r &&
    moveA.to.c === moveB.to.c &&
    moveA.promotion === moveB.promotion &&
    moveA.enPassant === moveB.enPassant &&
    moveA.castle === moveB.castle
  );
}

function formatMoveForCoach(state, move) {
  if (move.castle === "K") {
    return "castle kingside";
  }

  if (move.castle === "Q") {
    return "castle queenside";
  }

  const movingPiece = state.board[move.from.r][move.from.c];
  const pieceType = movingPiece ? movingPiece.toLowerCase() : "p";
  const pieceName = PIECE_NAMES[pieceType] || "piece";
  const fromSquare = squareToCoord(move.from.r, move.from.c);
  const toSquare = squareToCoord(move.to.r, move.to.c);
  const isCapture = move.enPassant || Boolean(state.board[move.to.r][move.to.c]);
  const action = isCapture ? "x" : "->";

  return `${pieceName} ${fromSquare}${action}${toSquare}`;
}

function getMoveIdea(state, move) {
  if (move.castle) {
    return "Castling makes your king safer.";
  }

  const movingPiece = state.board[move.from.r][move.from.c];
  if (!movingPiece) {
    return "This improves your position.";
  }

  if (move.enPassant || state.board[move.to.r][move.to.c]) {
    return "This wins material or removes pressure.";
  }

  const pieceType = movingPiece.toLowerCase();
  const toSquare = squareToCoord(move.to.r, move.to.c);

  if (pieceType === "p" && CENTER_SQUARES.has(toSquare)) {
    return "This helps control the center.";
  }

  if (pieceType === "n" || pieceType === "b") {
    if (move.from.r === 7) {
      return "This develops a piece toward active squares.";
    }
  }

  return "This improves your position.";
}

function squareToCoord(row, col) {
  return `${"abcdefgh"[col]}${8 - row}`;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function pieceColor(piece) {
  if (!piece) {
    return null;
  }

  return piece === piece.toUpperCase() ? "w" : "b";
}

function oppositeColor(color) {
  return color === "w" ? "b" : "w";
}
