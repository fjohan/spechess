const FILES = "abcdefgh";
const RANKS = "12345678";
const PIECE_GLYPHS = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const boardEl = document.getElementById("board");
const moveForm = document.getElementById("moveForm");
const moveInput = document.getElementById("moveInput");
const moveList = document.getElementById("moveList");
const turnBadge = document.getElementById("turnBadge");
const stateBadge = document.getElementById("stateBadge");
const timerBadge = document.getElementById("timerBadge");
const messageEl = document.getElementById("message");
const randomBtn = document.getElementById("randomBtn");
const autoplayBtn = document.getElementById("autoplayBtn");
const resetBtn = document.getElementById("resetBtn");
const submitBtn = moveForm.querySelector('button[type="submit"]');

let isAutoplaying = false;
let autoplayStartMs = null;
let lastAutoplayDurationMs = null;

let game = createInitialState();

function createInitialState() {
  const board = Array(64).fill(null);
  const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let file = 0; file < 8; file += 1) {
    board[idx(file, 0)] = backRank[file];
    board[idx(file, 1)] = "P";
    board[idx(file, 6)] = "p";
    board[idx(file, 7)] = backRank[file].toLowerCase();
  }

  return {
    board,
    sideToMove: "w",
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: -1,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    lastMove: null,
    result: null,
  };
}

function idx(file, rank) {
  return rank * 8 + file;
}

function fileOf(index) {
  return index % 8;
}

function rankOf(index) {
  return Math.floor(index / 8);
}

function onBoard(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function toSquare(index) {
  return `${FILES[fileOf(index)]}${RANKS[rankOf(index)]}`;
}

function pieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

function sameColor(piece, side) {
  return piece && pieceColor(piece) === side;
}

function enemyColor(side) {
  return side === "w" ? "b" : "w";
}

function cloneState(state) {
  return {
    board: state.board.slice(),
    sideToMove: state.sideToMove,
    castling: { ...state.castling },
    enPassant: state.enPassant,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    history: state.history.slice(),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    result: state.result,
  };
}

function isSquareAttacked(state, target, bySide) {
  const board = state.board;
  const tf = fileOf(target);
  const tr = rankOf(target);

  const pawnDir = bySide === "w" ? 1 : -1;
  for (const df of [-1, 1]) {
    const pf = tf - df;
    const pr = tr - pawnDir;
    if (!onBoard(pf, pr)) continue;
    const p = board[idx(pf, pr)];
    if (!p) continue;
    if (bySide === "w" && p === "P") return true;
    if (bySide === "b" && p === "p") return true;
  }

  const knightSteps = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ];
  for (const [df, dr] of knightSteps) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = board[idx(f, r)];
    if (bySide === "w" && p === "N") return true;
    if (bySide === "b" && p === "n") return true;
  }

  const kingDirs = [
    [1, 1],
    [1, 0],
    [1, -1],
    [0, 1],
    [0, -1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  for (const [df, dr] of kingDirs) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = board[idx(f, r)];
    if (bySide === "w" && p === "K") return true;
    if (bySide === "b" && p === "k") return true;
  }

  const rookDirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [df, dr] of rookDirs) {
    let f = tf + df;
    let r = tr + dr;
    while (onBoard(f, r)) {
      const p = board[idx(f, r)];
      if (p) {
        if (bySide === "w" && (p === "R" || p === "Q")) return true;
        if (bySide === "b" && (p === "r" || p === "q")) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }

  const bishopDirs = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (const [df, dr] of bishopDirs) {
    let f = tf + df;
    let r = tr + dr;
    while (onBoard(f, r)) {
      const p = board[idx(f, r)];
      if (p) {
        if (bySide === "w" && (p === "B" || p === "Q")) return true;
        if (bySide === "b" && (p === "b" || p === "q")) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }

  return false;
}

function kingSquare(state, side) {
  const target = side === "w" ? "K" : "k";
  for (let i = 0; i < 64; i += 1) {
    if (state.board[i] === target) return i;
  }
  return -1;
}

function inCheck(state, side) {
  const ksq = kingSquare(state, side);
  if (ksq === -1) return false;
  return isSquareAttacked(state, ksq, enemyColor(side));
}

function generatePseudoMoves(state) {
  const moves = [];
  const side = state.sideToMove;

  for (let from = 0; from < 64; from += 1) {
    const piece = state.board[from];
    if (!piece || pieceColor(piece) !== side) continue;

    const type = piece.toUpperCase();
    const f = fileOf(from);
    const r = rankOf(from);

    if (type === "P") {
      const dir = side === "w" ? 1 : -1;
      const startRank = side === "w" ? 1 : 6;
      const promoRank = side === "w" ? 7 : 0;

      const oneR = r + dir;
      if (onBoard(f, oneR) && !state.board[idx(f, oneR)]) {
        const to = idx(f, oneR);
        if (oneR === promoRank) {
          for (const promo of ["Q", "R", "B", "N"]) {
            moves.push({ from, to, promotion: promo });
          }
        } else {
          moves.push({ from, to });
        }

        if (r === startRank) {
          const twoR = r + dir * 2;
          const two = idx(f, twoR);
          if (!state.board[two]) {
            moves.push({ from, to: two, doublePawnPush: true });
          }
        }
      }

      for (const df of [-1, 1]) {
        const cf = f + df;
        const cr = r + dir;
        if (!onBoard(cf, cr)) continue;
        const to = idx(cf, cr);
        const target = state.board[to];

        if (target && pieceColor(target) !== side) {
          if (cr === promoRank) {
            for (const promo of ["Q", "R", "B", "N"]) {
              moves.push({ from, to, promotion: promo, capture: true });
            }
          } else {
            moves.push({ from, to, capture: true });
          }
        }

        if (to === state.enPassant) {
          moves.push({ from, to, capture: true, enPassant: true });
        }
      }
      continue;
    }

    if (type === "N") {
      const jumps = [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ];
      for (const [df, dr] of jumps) {
        const nf = f + df;
        const nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        const to = idx(nf, nr);
        const target = state.board[to];
        if (!target || pieceColor(target) !== side) {
          moves.push({ from, to, capture: !!target });
        }
      }
      continue;
    }

    if (type === "K") {
      const dirs = [
        [1, 1],
        [1, 0],
        [1, -1],
        [0, 1],
        [0, -1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
      ];
      for (const [df, dr] of dirs) {
        const nf = f + df;
        const nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        const to = idx(nf, nr);
        const target = state.board[to];
        if (!target || pieceColor(target) !== side) {
          moves.push({ from, to, capture: !!target });
        }
      }

      const enemy = enemyColor(side);
      const homeRank = side === "w" ? 0 : 7;
      const kingFrom = idx(4, homeRank);
      if (from === kingFrom && !inCheck(state, side)) {
        if ((side === "w" ? state.castling.K : state.castling.k)) {
          const f5 = idx(5, homeRank);
          const f6 = idx(6, homeRank);
          if (!state.board[f5] && !state.board[f6]) {
            if (!isSquareAttacked(state, f5, enemy) && !isSquareAttacked(state, f6, enemy)) {
              moves.push({ from, to: f6, castle: "K" });
            }
          }
        }

        if ((side === "w" ? state.castling.Q : state.castling.q)) {
          const f3 = idx(3, homeRank);
          const f2 = idx(2, homeRank);
          const f1 = idx(1, homeRank);
          if (!state.board[f3] && !state.board[f2] && !state.board[f1]) {
            if (!isSquareAttacked(state, f3, enemy) && !isSquareAttacked(state, f2, enemy)) {
              moves.push({ from, to: f2, castle: "Q" });
            }
          }
        }
      }
      continue;
    }

    const slidingDirs = [];
    if (type === "B" || type === "Q") {
      slidingDirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    }
    if (type === "R" || type === "Q") {
      slidingDirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    }

    for (const [df, dr] of slidingDirs) {
      let nf = f + df;
      let nr = r + dr;
      while (onBoard(nf, nr)) {
        const to = idx(nf, nr);
        const target = state.board[to];
        if (!target) {
          moves.push({ from, to });
        } else {
          if (pieceColor(target) !== side) moves.push({ from, to, capture: true });
          break;
        }
        nf += df;
        nr += dr;
      }
    }
  }

  return moves;
}

function applyMove(state, move) {
  const next = cloneState(state);
  const board = next.board;
  const side = state.sideToMove;
  const enemy = enemyColor(side);
  const piece = board[move.from];
  const type = piece.toUpperCase();
  const capturedPiece = move.enPassant
    ? board[idx(fileOf(move.to), rankOf(move.from))]
    : board[move.to];

  board[move.from] = null;

  if (move.enPassant) {
    board[idx(fileOf(move.to), rankOf(move.from))] = null;
  }

  if (move.castle) {
    const homeRank = side === "w" ? 0 : 7;
    if (move.castle === "K") {
      board[idx(6, homeRank)] = piece;
      board[idx(5, homeRank)] = board[idx(7, homeRank)];
      board[idx(7, homeRank)] = null;
    } else {
      board[idx(2, homeRank)] = piece;
      board[idx(3, homeRank)] = board[idx(0, homeRank)];
      board[idx(0, homeRank)] = null;
    }
  } else {
    let placed = piece;
    if (type === "P" && move.promotion) {
      placed = side === "w" ? move.promotion : move.promotion.toLowerCase();
    }
    board[move.to] = placed;
  }

  if (piece === "K") {
    next.castling.K = false;
    next.castling.Q = false;
  }
  if (piece === "k") {
    next.castling.k = false;
    next.castling.q = false;
  }
  if (move.from === idx(0, 0) || move.to === idx(0, 0)) next.castling.Q = false;
  if (move.from === idx(7, 0) || move.to === idx(7, 0)) next.castling.K = false;
  if (move.from === idx(0, 7) || move.to === idx(0, 7)) next.castling.q = false;
  if (move.from === idx(7, 7) || move.to === idx(7, 7)) next.castling.k = false;

  next.enPassant = -1;
  if (type === "P" && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    const epRank = (rankOf(move.to) + rankOf(move.from)) / 2;
    next.enPassant = idx(fileOf(move.from), epRank);
  }

  if (type === "P" || capturedPiece) next.halfmoveClock = 0;
  else next.halfmoveClock += 1;

  if (side === "b") next.fullmoveNumber += 1;

  next.sideToMove = enemy;
  next.lastMove = {
    from: move.from,
    to: move.to,
    piece,
    capture: !!capturedPiece,
    promotion: move.promotion || null,
    castle: move.castle || null,
  };

  return next;
}

function generateLegalMoves(state) {
  const pseudo = generatePseudoMoves(state);
  const legal = [];

  for (const move of pseudo) {
    const next = applyMove(state, move);
    if (!inCheck(next, state.sideToMove)) {
      legal.push(move);
    }
  }

  return legal;
}

function disambiguation(state, move, legalMoves) {
  const piece = state.board[move.from];
  const type = piece.toUpperCase();
  if (type === "P" || type === "K") return "";

  const sameTargets = legalMoves.filter((m) => {
    if (m.from === move.from || m.to !== move.to) return false;
    const otherPiece = state.board[m.from];
    return otherPiece && otherPiece.toUpperCase() === type;
  });

  if (sameTargets.length === 0) return "";

  const sameFile = sameTargets.some((m) => fileOf(m.from) === fileOf(move.from));
  const sameRank = sameTargets.some((m) => rankOf(m.from) === rankOf(move.from));

  if (!sameFile) return FILES[fileOf(move.from)];
  if (!sameRank) return RANKS[rankOf(move.from)];
  return `${FILES[fileOf(move.from)]}${RANKS[rankOf(move.from)]}`;
}

function sanForMove(state, move, legalMoves) {
  const piece = state.board[move.from];
  const type = piece.toUpperCase();

  let san = "";
  if (move.castle) {
    san = move.castle === "K" ? "O-O" : "O-O-O";
  } else {
    const capture = move.enPassant || !!state.board[move.to];
    const to = toSquare(move.to);

    if (type !== "P") {
      san += type;
      san += disambiguation(state, move, legalMoves);
    } else if (capture) {
      san += FILES[fileOf(move.from)];
    }

    if (capture) san += "x";
    san += to;

    if (type === "P" && move.promotion) {
      san += `=${move.promotion}`;
    }
  }

  const next = applyMove(state, move);
  const oppMoves = generateLegalMoves(next);
  if (inCheck(next, next.sideToMove)) {
    san += oppMoves.length === 0 ? "#" : "+";
  }

  return san;
}

function normalizedSan(san) {
  return san
    .trim()
    .replace(/0/g, "O")
    .replace(/[!?]+/g, "")
    .replace(/\s+/g, "")
    .replace(/[+#]$/, "")
    .toUpperCase();
}

function matchMoveFromInput(input, legalEntries) {
  const norm = normalizedSan(input);

  for (const entry of legalEntries) {
    if (normalizedSan(entry.san) === norm) return entry;

    if (entry.san.includes("=") && normalizedSan(entry.san.replace("=", "")) === norm) {
      return entry;
    }
  }

  return null;
}

function squareColor(index) {
  return (fileOf(index) + rankOf(index)) % 2;
}

function hasInsufficientMatingMaterial(state) {
  const nonKings = [];
  let hasHeavyOrPawn = false;

  for (let i = 0; i < 64; i += 1) {
    const piece = state.board[i];
    if (!piece) continue;
    const type = piece.toUpperCase();
    if (type === "K") continue;
    if (type === "P" || type === "Q" || type === "R") {
      hasHeavyOrPawn = true;
      break;
    }
    nonKings.push({ type, index: i });
  }

  if (hasHeavyOrPawn) return false;
  if (nonKings.length === 0) return true; // K vs K
  if (nonKings.length === 1) return true; // K+B vs K or K+N vs K

  // K+B vs K+B with bishops on same color is dead.
  if (
    nonKings.length === 2 &&
    nonKings[0].type === "B" &&
    nonKings[1].type === "B" &&
    squareColor(nonKings[0].index) === squareColor(nonKings[1].index)
  ) {
    return true;
  }

  return false;
}

function evaluateGameState(state) {
  const legal = generateLegalMoves(state);
  const check = inCheck(state, state.sideToMove);

  if (legal.length === 0) {
    if (check) {
      state.result = state.sideToMove === "w" ? "Black wins by checkmate" : "White wins by checkmate";
      return { terminal: true, text: "Checkmate" };
    }
    state.result = "Draw by stalemate";
    return { terminal: true, text: "Stalemate" };
  }

  if (hasInsufficientMatingMaterial(state)) {
    state.result = "Draw by insufficient mating material";
    return { terminal: true, text: "Draw" };
  }

  if (state.halfmoveClock >= 100) {
    state.result = "Draw by 50-move rule";
    return { terminal: true, text: "Draw" };
  }

  if (check) return { terminal: false, text: "Check" };
  return { terminal: false, text: "In progress" };
}

function renderBoard(state) {
  boardEl.innerHTML = "";

  for (let rank = 7; rank >= 0; rank -= 1) {
    for (let file = 0; file < 8; file += 1) {
      const square = document.createElement("div");
      square.className = `square ${(file + rank) % 2 === 0 ? "light" : "dark"}`;
      const sq = idx(file, rank);

      if (state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq)) {
        square.classList.add("last");
      }

      const piece = state.board[sq];
      if (piece) {
        square.textContent = PIECE_GLYPHS[piece];
      }

      square.setAttribute("aria-label", `${toSquare(sq)}${piece ? ` ${piece}` : ""}`);
      boardEl.appendChild(square);
    }
  }
}

function renderMoveList(state) {
  moveList.innerHTML = "";
  for (let i = 0; i < state.history.length; i += 2) {
    const li = document.createElement("li");
    const white = state.history[i] || "";
    const black = state.history[i + 1] || "";
    li.textContent = black ? `${white} ${black}` : white;
    moveList.appendChild(li);
  }
}

function setMessage(text, type = "info") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

function formatDuration(ms) {
  const totalMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function updateTimerBadge() {
  if (isAutoplaying && autoplayStartMs !== null) {
    timerBadge.textContent = `Auto timer: ${formatDuration(performance.now() - autoplayStartMs)}`;
    return;
  }
  if (lastAutoplayDurationMs !== null) {
    timerBadge.textContent = `Last auto: ${formatDuration(lastAutoplayDurationMs)}`;
    return;
  }
  timerBadge.textContent = "Auto timer: --";
}

function refreshUI() {
  renderBoard(game);
  renderMoveList(game);

  turnBadge.textContent = game.sideToMove === "w" ? "White to move" : "Black to move";
  const status = evaluateGameState(game);
  stateBadge.textContent = status.text;
  updateTimerBadge();

  if (game.result) {
    setMessage(game.result, "warn");
  } else {
    setMessage("", "info");
  }

  const locked = !!game.result || isAutoplaying;
  randomBtn.disabled = locked;
  autoplayBtn.disabled = locked;
  moveInput.disabled = locked;
  submitBtn.disabled = locked;
}

function playMoveInput(inputSan) {
  if (game.result) return;

  const legalMoves = generateLegalMoves(game);
  const entries = legalMoves.map((move) => ({ move, san: sanForMove(game, move, legalMoves) }));

  const matched = matchMoveFromInput(inputSan, entries);
  if (!matched) {
    setMessage("Illegal or unknown SAN move for this position.", "error");
    return;
  }

  game = applyMove(game, matched.move);
  game.history.push(matched.san);

  refreshUI();
  if (!game.result) {
    setMessage(`Played ${matched.san}`, "ok");
  }
}

moveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isAutoplaying) return;
  const value = moveInput.value;
  if (!value.trim()) return;
  playMoveInput(value);
  moveInput.value = "";
  moveInput.focus();
});

randomBtn.addEventListener("click", () => {
  if (game.result || isAutoplaying) return;
  const legalMoves = generateLegalMoves(game);
  if (legalMoves.length === 0) {
    refreshUI();
    return;
  }

  const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
  const san = sanForMove(game, move, legalMoves);
  game = applyMove(game, move);
  game.history.push(san);
  refreshUI();
  if (!game.result) {
    setMessage(`Random move: ${san}`, "ok");
  }
});

async function autoplayFullGame() {
  if (game.result || isAutoplaying) return;

  isAutoplaying = true;
  autoplayStartMs = performance.now();
  lastAutoplayDurationMs = null;
  setMessage("Autoplay in progress...", "info");
  refreshUI();

  while (!game.result) {
    const legalMoves = generateLegalMoves(game);
    if (legalMoves.length === 0) {
      refreshUI();
      break;
    }

    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    const san = sanForMove(game, move, legalMoves);
    game = applyMove(game, move);
    game.history.push(san);
    refreshUI();

    await new Promise((resolve) => {
      setTimeout(resolve, 16);
    });
  }

  lastAutoplayDurationMs = performance.now() - autoplayStartMs;
  isAutoplaying = false;
  autoplayStartMs = null;
  refreshUI();

  if (game.result) {
    setMessage(`${game.result}. Autoplay finished in ${formatDuration(lastAutoplayDurationMs)}.`, "warn");
  }
}

autoplayBtn.addEventListener("click", () => {
  autoplayFullGame();
});

resetBtn.addEventListener("click", () => {
  isAutoplaying = false;
  autoplayStartMs = null;
  lastAutoplayDurationMs = null;
  game = createInitialState();
  refreshUI();
  setMessage("Game reset.", "info");
  moveInput.focus();
});

refreshUI();
moveInput.focus();
