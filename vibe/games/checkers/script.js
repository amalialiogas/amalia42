"use strict";

const HUMAN = "r";
const COMPUTER = "b";
const EMPTY = ".";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const turnIndicatorEl = document.getElementById("turn-indicator");
const moveListEl = document.getElementById("move-list");
const redCountEl = document.getElementById("count-red");
const blackCountEl = document.getElementById("count-black");
const newGameBtn = document.getElementById("new-game");
const difficultyEl = document.getElementById("difficulty");

let board = createInitialBoard();
let currentPlayer = HUMAN;
let legalMoves = [];
let selectedSource = null;
let filteredMoveIndexes = [];
let aiThinking = false;
let gameOver = false;
let aiDepth = Number(difficultyEl.value);

function createInitialBoard() {
  const next = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row + col) % 2 === 1) next[row][col] = "b";
    }
  }
  for (let row = 5; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row + col) % 2 === 1) next[row][col] = "r";
    }
  }
  return next;
}

function cloneBoard(src) {
  return src.map((row) => row.slice());
}

function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function owner(piece) {
  if (piece === EMPTY) return "";
  return piece.toLowerCase();
}

function opponent(player) {
  return player === HUMAN ? COMPUTER : HUMAN;
}

function isKing(piece) {
  return piece === "R" || piece === "B";
}

function moveDirections(piece) {
  if (piece === "r") return [[-1, -1], [-1, 1]];
  if (piece === "b") return [[1, -1], [1, 1]];
  return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
}

function crownPiece(piece, row) {
  if (piece === "r" && row === 0) return "R";
  if (piece === "b" && row === 7) return "B";
  return piece;
}

function samePos(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function pathCaptureCount(path) {
  let count = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (Math.abs(path[i + 1][0] - path[i][0]) === 2) count += 1;
  }
  return count;
}

function toMove(path) {
  return {
    path,
    captureCount: pathCaptureCount(path),
  };
}

function findCapturesFrom(state, row, col, piece) {
  const results = [];

  function dfs(curBoard, curRow, curCol, curPiece, path) {
    let found = false;
    const dirs = moveDirections(curPiece);
    for (const [dr, dc] of dirs) {
      const midRow = curRow + dr;
      const midCol = curCol + dc;
      const landRow = curRow + dr * 2;
      const landCol = curCol + dc * 2;

      if (!inBounds(midRow, midCol) || !inBounds(landRow, landCol)) continue;
      const midPiece = curBoard[midRow][midCol];
      if (midPiece === EMPTY || owner(midPiece) !== opponent(owner(curPiece))) continue;
      if (curBoard[landRow][landCol] !== EMPTY) continue;

      found = true;
      const nextBoard = cloneBoard(curBoard);
      nextBoard[curRow][curCol] = EMPTY;
      nextBoard[midRow][midCol] = EMPTY;

      const nextPiece = crownPiece(curPiece, landRow);
      nextBoard[landRow][landCol] = nextPiece;
      const nextPath = path.concat([[landRow, landCol]]);

      // American checkers rule: if a man becomes king during a jump, turn ends.
      if (!isKing(curPiece) && isKing(nextPiece)) {
        results.push(nextPath);
        continue;
      }

      dfs(nextBoard, landRow, landCol, nextPiece, nextPath);
    }

    if (!found && path.length > 1) {
      results.push(path);
    }
  }

  dfs(state, row, col, piece, [[row, col]]);
  return results.map(toMove);
}

function simpleMovesFrom(state, row, col, piece) {
  const moves = [];
  for (const [dr, dc] of moveDirections(piece)) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (inBounds(nextRow, nextCol) && state[nextRow][nextCol] === EMPTY) {
      moves.push(toMove([[row, col], [nextRow, nextCol]]));
    }
  }
  return moves;
}

function generateMoves(state, player) {
  const captures = [];
  const normals = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state[row][col];
      if (piece === EMPTY || owner(piece) !== player) continue;

      const pieceCaptures = findCapturesFrom(state, row, col, piece);
      if (pieceCaptures.length > 0) {
        captures.push(...pieceCaptures);
      } else {
        normals.push(...simpleMovesFrom(state, row, col, piece));
      }
    }
  }
  if (captures.length > 0) {
    captures.sort((a, b) => b.captureCount - a.captureCount);
    return captures;
  }
  return normals;
}

function applyMove(state, move) {
  const nextBoard = cloneBoard(state);
  const start = move.path[0];
  let piece = nextBoard[start[0]][start[1]];
  nextBoard[start[0]][start[1]] = EMPTY;

  let cur = start;
  for (let i = 1; i < move.path.length; i += 1) {
    const next = move.path[i];
    if (Math.abs(next[0] - cur[0]) === 2) {
      const midRow = (cur[0] + next[0]) / 2;
      const midCol = (cur[1] + next[1]) / 2;
      nextBoard[midRow][midCol] = EMPTY;
    }
    cur = next;
  }

  piece = crownPiece(piece, cur[0]);
  nextBoard[cur[0]][cur[1]] = piece;
  return nextBoard;
}

function hasPieces(state, player) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (owner(state[row][col]) === player) return true;
    }
  }
  return false;
}

function evaluate(state) {
  let score = 0;
  const blackMobility = generateMoves(state, COMPUTER).length;
  const redMobility = generateMoves(state, HUMAN).length;

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state[row][col];
      if (piece === EMPTY) continue;

      if (piece === "b") {
        score += 100 + row * 4;
      } else if (piece === "B") {
        score += 180;
      } else if (piece === "r") {
        score -= 100 + (7 - row) * 4;
      } else if (piece === "R") {
        score -= 180;
      }

      if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
        score += owner(piece) === COMPUTER ? 4 : -4;
      }
    }
  }

  score += (blackMobility - redMobility) * 3;
  return score;
}

function minimax(state, depth, player, alpha, beta, rootDepth) {
  const moves = generateMoves(state, player);
  const redAlive = hasPieces(state, HUMAN);
  const blackAlive = hasPieces(state, COMPUTER);

  if (depth === 0 || moves.length === 0 || !redAlive || !blackAlive) {
    if (moves.length === 0) {
      if (player === COMPUTER) return { score: -100000 + (rootDepth - depth), move: null };
      return { score: 100000 - (rootDepth - depth), move: null };
    }
    if (!redAlive) return { score: 100000, move: null };
    if (!blackAlive) return { score: -100000, move: null };
    return { score: evaluate(state), move: null };
  }

  if (player === COMPUTER) {
    let bestScore = -Infinity;
    let bestMove = moves[0] || null;
    for (const move of moves) {
      const child = applyMove(state, move);
      const result = minimax(child, depth - 1, HUMAN, alpha, beta, rootDepth);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }

  let bestScore = Infinity;
  let bestMove = moves[0] || null;
  for (const move of moves) {
    const child = applyMove(state, move);
    const result = minimax(child, depth - 1, COMPUTER, alpha, beta, rootDepth);
    if (result.score < bestScore) {
      bestScore = result.score;
      bestMove = move;
    }
    beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }
  return { score: bestScore, move: bestMove };
}

function moveToText(move) {
  return move.path.map(coordToLabel).join(" -> ");
}

function coordToLabel([row, col]) {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return `${file}${rank}`;
}

function countPieces(state) {
  let red = 0;
  let black = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state[row][col];
      if (owner(piece) === HUMAN) red += 1;
      if (owner(piece) === COMPUTER) black += 1;
    }
  }
  return { red, black };
}

function getWinner(state) {
  const humanHas = hasPieces(state, HUMAN);
  const aiHas = hasPieces(state, COMPUTER);
  const humanMoves = generateMoves(state, HUMAN);
  const aiMoves = generateMoves(state, COMPUTER);

  if (!humanHas || humanMoves.length === 0) return "Computer";
  if (!aiHas || aiMoves.length === 0) return "You";
  return null;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setTurnIndicator(mode, text) {
  turnIndicatorEl.textContent = text;
  turnIndicatorEl.classList.remove("human", "computer", "over");
  turnIndicatorEl.classList.add(mode);
}

function squareKey(row, col) {
  return `${row},${col}`;
}

function renderBoard() {
  boardEl.textContent = "";
  boardEl.classList.toggle("locked", aiThinking || gameOver || currentPlayer !== HUMAN);

  const sourceSet = new Set();
  const destinationSet = new Set();
  legalMoves.forEach((move, idx) => {
    if (currentPlayer !== HUMAN || gameOver || aiThinking) return;
    if (selectedSource) {
      const [srcRow, srcCol] = move.path[0];
      if (srcRow === selectedSource[0] && srcCol === selectedSource[1]) {
        sourceSet.add(squareKey(srcRow, srcCol));
        const end = move.path[move.path.length - 1];
        destinationSet.add(squareKey(end[0], end[1]));
      }
    } else {
      const [srcRow, srcCol] = move.path[0];
      sourceSet.add(squareKey(srcRow, srcCol));
    }
  });

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      square.dataset.row = String(row);
      square.dataset.col = String(col);
      square.setAttribute("aria-label", `Square ${coordToLabel([row, col])}`);

      const key = squareKey(row, col);
      if (sourceSet.has(key)) square.classList.add("selectable");
      if (destinationSet.has(key)) square.classList.add("target");
      if (selectedSource && selectedSource[0] === row && selectedSource[1] === col) {
        square.classList.add("selected");
      }

      const piece = board[row][col];
      if (piece !== EMPTY) {
        const pieceEl = document.createElement("div");
        const colorClass = owner(piece) === HUMAN ? "red" : "black";
        pieceEl.className = `piece ${colorClass}${isKing(piece) ? " king" : ""}`;
        square.appendChild(pieceEl);
      }

      square.addEventListener("click", () => onSquareClick(row, col));
      boardEl.appendChild(square);
    }
  }
}

function renderMoveList() {
  moveListEl.textContent = "";
  const humanTurn = currentPlayer === HUMAN && !gameOver && !aiThinking;
  const moves = legalMoves;

  if (moves.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No legal moves.";
    moveListEl.appendChild(empty);
    return;
  }

  filteredMoveIndexes = [];
  const filterBySource = Boolean(selectedSource);

  moves.forEach((move, idx) => {
    const startsHere = !filterBySource || samePos(move.path[0], selectedSource);
    if (startsHere) filteredMoveIndexes.push(idx);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `move-option${startsHere ? " filtered" : ""}`;
    button.disabled = !humanTurn || !startsHere;
    const captureTag = move.captureCount > 0 ? " x" : "";
    button.textContent = `${idx + 1}. ${moveToText(move)}${captureTag}`;
    button.title = moveToText(move);

    button.addEventListener("click", () => {
      if (!humanTurn) return;
      playHumanMove(idx);
    });

    moveListEl.appendChild(button);
  });
}

function renderCounts() {
  const counts = countPieces(board);
  redCountEl.textContent = `Red: ${counts.red}`;
  blackCountEl.textContent = `Black: ${counts.black}`;
}

function renderAll() {
  renderCounts();
  renderBoard();
  renderMoveList();
}

function onSquareClick(row, col) {
  if (currentPlayer !== HUMAN || aiThinking || gameOver) return;
  const piece = board[row][col];
  const key = [row, col];

  const ownPiece = piece !== EMPTY && owner(piece) === HUMAN;
  if (ownPiece) {
    const hasMove = legalMoves.some((move) => samePos(move.path[0], key));
    selectedSource = hasMove ? key : null;
    renderAll();
    return;
  }

  if (!selectedSource) return;

  const matching = legalMoves
    .map((move, idx) => ({ move, idx }))
    .filter(({ move }) => {
      const end = move.path[move.path.length - 1];
      return samePos(move.path[0], selectedSource) && samePos(end, key);
    });

  if (matching.length === 1) {
    playHumanMove(matching[0].idx);
    return;
  }

  if (matching.length > 1) {
    setStatus("Multiple paths share that destination. Choose one from Legal Moves.");
  }
}

function playHumanMove(moveIdx) {
  const move = legalMoves[moveIdx];
  if (!move) return;

  board = applyMove(board, move);
  selectedSource = null;

  const winner = getWinner(board);
  if (winner) {
    gameOver = true;
    setTurnIndicator("over", "Game Over");
    setStatus(`${winner} win${winner === "You" ? "" : "s"}! Press New Game.`);
    legalMoves = [];
    renderAll();
    return;
  }

  currentPlayer = COMPUTER;
  beginTurn();
}

function chooseAIMove() {
  const result = minimax(board, aiDepth, COMPUTER, -Infinity, Infinity, aiDepth);
  return result.move;
}

function beginTurn() {
  legalMoves = generateMoves(board, currentPlayer);
  selectedSource = null;

  if (legalMoves.length === 0) {
    gameOver = true;
    setTurnIndicator("over", "Game Over");
    if (currentPlayer === HUMAN) setStatus("Computer wins. Press New Game.");
    else setStatus("You win. Press New Game.");
    renderAll();
    return;
  }

  if (currentPlayer === HUMAN) {
    const mandatory = legalMoves[0].captureCount > 0;
    setTurnIndicator("human", "Your Turn");
    setStatus(
      mandatory
        ? "Your turn. Capture is mandatory. Select a highlighted piece."
        : "Your turn. Select a highlighted piece."
    );
    aiThinking = false;
    renderAll();
    return;
  }

  aiThinking = true;
  setTurnIndicator("computer", "Computer Turn");
  setStatus("Computer is thinking...");
  renderAll();

  window.setTimeout(() => {
    if (gameOver || currentPlayer !== COMPUTER) return;
    const move = chooseAIMove();
    if (!move) {
      gameOver = true;
      aiThinking = false;
      setTurnIndicator("over", "Game Over");
      setStatus("You win. Computer has no legal moves.");
      legalMoves = [];
      renderAll();
      return;
    }

    board = applyMove(board, move);
    const winner = getWinner(board);
    if (winner) {
      gameOver = true;
      aiThinking = false;
      setTurnIndicator("over", "Game Over");
      setStatus(`${winner} win${winner === "You" ? "" : "s"}! Press New Game.`);
      legalMoves = [];
      renderAll();
      return;
    }

    currentPlayer = HUMAN;
    aiThinking = false;
    beginTurn();
  }, 220);
}

function resetGame() {
  board = createInitialBoard();
  currentPlayer = HUMAN;
  legalMoves = [];
  selectedSource = null;
  aiThinking = false;
  gameOver = false;
  beginTurn();
}

newGameBtn.addEventListener("click", resetGame);
difficultyEl.addEventListener("change", () => {
  aiDepth = Number(difficultyEl.value);
  if (!aiThinking && !gameOver) {
    if (currentPlayer === HUMAN) {
      setStatus(
        legalMoves.length > 0 && legalMoves[0].captureCount > 0
          ? "Your turn. Capture is mandatory."
          : "Your turn."
      );
    } else {
      setStatus("Computer will use the new difficulty next turn.");
    }
  }
});

resetGame();
