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
const policyBadge = document.getElementById("policyBadge");
const messageEl = document.getElementById("message");
const trainLogEl = document.getElementById("trainLog");
const randomBtn = document.getElementById("randomBtn");
const autoplayBtn = document.getElementById("autoplayBtn");
const trainBtn = document.getElementById("trainBtn");
const policyPlayBtn = document.getElementById("policyPlayBtn");
const trainModelSelect = document.getElementById("trainModelSelect");
const newModelNameInput = document.getElementById("newModelNameInput");
const newModelBtn = document.getElementById("newModelBtn");
const deleteModelBtn = document.getElementById("deleteModelBtn");
const trainGamesInput = document.getElementById("trainGamesInput");
const trainWhiteModelSelect = document.getElementById("trainWhiteModelSelect");
const trainBlackModelSelect = document.getElementById("trainBlackModelSelect");
const whiteModelSelect = document.getElementById("whiteModelSelect");
const blackModelSelect = document.getElementById("blackModelSelect");
const matchGamesInput = document.getElementById("matchGamesInput");
const resetBtn = document.getElementById("resetBtn");
const submitBtn = moveForm.querySelector('button[type="submit"]');

const LEARNING_RATE = 0.01;
const DEFAULT_GAMES_PER_TRAIN_CLICK = 1000;
const DEFAULT_MATCH_GAMES = 50;
const MAX_PLIES = 200;
const TEMPERATURE_TRAIN = 0.9;
const TEMPERATURE_PLAY = 0.45;
const TRAIN_OPENING_RANDOM_MIN = 0;
const TRAIN_OPENING_RANDOM_MAX = 2;
const PLAY_OPENING_RANDOM_PLIES = 2;
const PLAY_EPSILON_RANDOM = 0.02;
const PER_PLY_PENALTY = 0.0025;
const LOOP_DRAW_PENALTY = 0.1;
const REPEAT_POSITION_PENALTY = 0.02;
const ANTI_REPEAT_BASE_PENALTY = 1.25;
const ANTI_REPEAT_AHEAD_MULTIPLIER = 2.5;
const HEURISTIC_WEIGHT_TRAIN = 0.75;
const HEURISTIC_WEIGHT_PLAY = 1.0;
const NO_PROGRESS_WINDOW = 12;
const NO_PROGRESS_THRESHOLD = 0.35;
const NO_PROGRESS_PENALTY = 0.06;
const COVERAGE_THREAT_BONUS_WEIGHT = 0.35;
const POSITION_FEATURE_SIZE = 12 * 64 + 1;
const MOVE_FEATURE_SIZE = 64 + 64 + 5 + 3;
const POLICY_FEATURE_SIZE = POSITION_FEATURE_SIZE + MOVE_FEATURE_SIZE;
const RANDOM_MODEL_ID = "random";
const HEURISTIC_MODEL_ID = "heuristic";
const MODEL_DB_NAME = "spechess-models";
const MODEL_DB_VERSION = 1;
const MODEL_STORE_NAME = "models";

let isAutoplaying = false;
let isTraining = false;
let isMatchPlaying = false;
let autoplayStartMs = null;
let lastAutoplayDurationMs = null;
let trainLogLines = ["No training run yet."];
let runSeedCounter = 1;
let modelCounter = 1;
let models = [];
let activeTrainModelId = null;
let modelsDb = null;

const PIECE_TO_PLANE = {
  P: 0,
  N: 1,
  B: 2,
  R: 3,
  Q: 4,
  K: 5,
  p: 6,
  n: 7,
  b: 8,
  r: 9,
  q: 10,
  k: 11,
};

const PROMOTION_TO_INDEX = {
  NONE: 0,
  Q: 1,
  R: 2,
  B: 3,
  N: 4,
};

const PIECE_VALUES = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 0,
};

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

  const state = {
    board,
    sideToMove: "w",
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: -1,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    lastMove: null,
    result: null,
    positionKey: "",
    positionCounts: {},
  };

  state.positionKey = computePositionKey(state);
  state.positionCounts[state.positionKey] = 1;
  return state;
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

function castlingRightsString(castling) {
  let rights = "";
  if (castling.K) rights += "K";
  if (castling.Q) rights += "Q";
  if (castling.k) rights += "k";
  if (castling.q) rights += "q";
  return rights || "-";
}

function computePositionKey(state) {
  const boardPart = state.board.map((piece) => piece || ".").join("");
  const sidePart = state.sideToMove;
  const castlingPart = castlingRightsString(state.castling);
  const epPart = state.enPassant >= 0 ? toSquare(state.enPassant) : "-";
  return `${boardPart}|${sidePart}|${castlingPart}|${epPart}`;
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
    positionKey: state.positionKey || "",
    positionCounts: state.positionCounts || {},
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

function applyMove(state, move, options = {}) {
  const { trackRepetition = true } = options;
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

  if (trackRepetition) {
    next.positionCounts = { ...(state.positionCounts || {}) };
    next.positionKey = computePositionKey(next);
    next.positionCounts[next.positionKey] = (next.positionCounts[next.positionKey] || 0) + 1;
  } else {
    next.positionCounts = state.positionCounts || {};
    next.positionKey = state.positionKey || "";
  }

  return next;
}

function generateLegalMoves(state) {
  const pseudo = generatePseudoMoves(state);
  const legal = [];

  for (const move of pseudo) {
    const next = applyMove(state, move, { trackRepetition: false });
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

  const next = applyMove(state, move, { trackRepetition: false });
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

  const repetitionCount = (state.positionCounts && state.positionKey && state.positionCounts[state.positionKey]) || 0;
  if (repetitionCount >= 3) {
    state.result = "Draw by threefold repetition";
    return { terminal: true, text: "Draw" };
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
      square.className = `square ${(file + rank) % 2 === 0 ? "dark" : "light"}`;
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

function renderTrainLog() {
  trainLogEl.textContent = trainLogLines.join("\n");
}

function appendTrainLog(line) {
  if (trainLogLines.length === 1 && trainLogLines[0] === "No training run yet.") {
    trainLogLines = [];
  }
  trainLogLines.push(line);
  if (trainLogLines.length > 40) {
    trainLogLines = trainLogLines.slice(trainLogLines.length - 40);
  }
  renderTrainLog();
}

function defaultModelName(index) {
  return `model-${index}`;
}

function createModel(name = defaultModelName(modelCounter)) {
  const id = `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  modelCounter += 1;
  return {
    id,
    name,
    gamesTrained: 0,
    createdAt: now,
    updatedAt: now,
    weights: new Float32Array(POLICY_FEATURE_SIZE),
  };
}

function getModelById(modelId) {
  return models.find((m) => m.id === modelId) || null;
}

function currentTrainModel() {
  return getModelById(activeTrainModelId);
}

function modelDisplayName(modelId) {
  if (modelId === RANDOM_MODEL_ID) return "Random";
  if (modelId === HEURISTIC_MODEL_ID) return "Heuristic";
  const model = getModelById(modelId);
  return model ? `${model.name} (${model.gamesTrained})` : "Unknown";
}

function updateModelCounterFromModels() {
  modelCounter = Math.max(
    1,
    ...models.map((m) => {
      const match = /model-(\d+)/.exec(m.name || "");
      return match ? Number.parseInt(match[1], 10) + 1 : 1;
    })
  );
}

function replaceSelectOptions(selectEl, entries, selectedValue = null) {
  selectEl.innerHTML = "";
  for (const entry of entries) {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    if (selectedValue !== null && selectedValue === entry.value) option.selected = true;
    selectEl.appendChild(option);
  }
}

function refreshModelSelectors() {
  const trainSelected = activeTrainModelId || trainModelSelect.value;
  const trainWhiteSelected = trainWhiteModelSelect.value || trainSelected || RANDOM_MODEL_ID;
  const trainBlackSelected = trainBlackModelSelect.value || RANDOM_MODEL_ID;
  const whiteSelected = whiteModelSelect.value || RANDOM_MODEL_ID;
  const blackSelected = blackModelSelect.value || RANDOM_MODEL_ID;

  const trainEntries = models.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.gamesTrained})`,
  }));
  replaceSelectOptions(trainModelSelect, trainEntries, trainSelected);

  const modelChoiceEntries = [{ value: RANDOM_MODEL_ID, label: "Random" }, { value: HEURISTIC_MODEL_ID, label: "Heuristic" }].concat(
    models.map((m) => ({
      value: m.id,
      label: `${m.name} (${m.gamesTrained})`,
    }))
  );
  replaceSelectOptions(trainWhiteModelSelect, modelChoiceEntries, trainWhiteSelected);
  replaceSelectOptions(trainBlackModelSelect, modelChoiceEntries, trainBlackSelected);
  replaceSelectOptions(whiteModelSelect, modelChoiceEntries, whiteSelected);
  replaceSelectOptions(blackModelSelect, modelChoiceEntries, blackSelected);

  if (trainModelSelect.value) {
    activeTrainModelId = trainModelSelect.value;
  }
}

function serializeModel(model) {
  return {
    id: model.id,
    name: model.name,
    gamesTrained: model.gamesTrained,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    weights: Array.from(model.weights),
  };
}

function hydrateModel(raw) {
  return {
    id: raw.id,
    name: raw.name,
    gamesTrained: raw.gamesTrained || 0,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    weights: new Float32Array(raw.weights || []),
  };
}

function openModelsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE_NAME)) {
        db.createObjectStore(MODEL_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbReadAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = modelsDb.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = modelsDb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = modelsDb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function persistModel(model) {
  if (!modelsDb) return;
  model.updatedAt = new Date().toISOString();
  await idbPut(MODEL_STORE_NAME, serializeModel(model));
}

async function deleteModelFromStorage(modelId) {
  if (!modelsDb) return;
  await idbDelete(MODEL_STORE_NAME, modelId);
}

async function loadModels() {
  const raws = await idbReadAll(MODEL_STORE_NAME);
  models = raws.map(hydrateModel).filter((m) => m.weights.length === POLICY_FEATURE_SIZE);

  if (models.length === 0) {
    const fresh = createModel(defaultModelName(1));
    models = [fresh];
    activeTrainModelId = fresh.id;
    await persistModel(fresh);
  } else if (!activeTrainModelId || !getModelById(activeTrainModelId)) {
    activeTrainModelId = models[0].id;
  }

  updateModelCounterFromModels();
  refreshModelSelectors();
  if (activeTrainModelId) {
    trainWhiteModelSelect.value = activeTrainModelId;
    whiteModelSelect.value = activeTrainModelId;
  }
  trainBlackModelSelect.value = RANDOM_MODEL_ID;
  blackModelSelect.value = RANDOM_MODEL_ID;
}

async function initializeModels() {
  try {
    modelsDb = await openModelsDb();
    await loadModels();
    appendTrainLog(`[models] loaded ${models.length} model(s), train=${modelDisplayName(activeTrainModelId)}`);
  } catch (error) {
    appendTrainLog(`[models] IndexedDB unavailable (${String(error)}), using in-memory model`);
    const fallback = createModel(defaultModelName(1));
    models = [fallback];
    activeTrainModelId = fallback.id;
    refreshModelSelectors();
  }
}

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function nextSeed() {
  const seed = (Date.now() ^ (runSeedCounter * 0x9e3779b1)) >>> 0;
  runSeedCounter += 1;
  return seed;
}

function randInt(minInclusive, maxInclusive, rng = Math.random) {
  if (maxInclusive <= minInclusive) return minInclusive;
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng() * span);
}

function isBusy() {
  return isAutoplaying || isTraining || isMatchPlaying;
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

function updatePolicyBadge() {
  const trainModel = currentTrainModel();
  if (!trainModel) {
    policyBadge.textContent = "Policy: no model";
    return;
  }
  const trainModelLabel = `${trainModel.name} (${trainModel.gamesTrained})`;
  if (trainModel.gamesTrained === 0) {
    policyBadge.textContent = `Policy: ${trainModelLabel} untrained`;
    return;
  }

  const legalMoves = getLegalMoves(game);
  if (!legalMoves.length) {
    policyBadge.textContent = `Policy: ${trainModelLabel} terminal`;
    return;
  }

  const decision = selectMoveWithPolicy(game, legalMoves, {
    temperature: 1,
    sample: false,
    collectGradient: false,
    model: trainModel,
  });

  const probs = decision.probs;
  const topProb = Math.max(...probs);
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) entropy -= p * Math.log(p);
  }
  const maxEntropy = Math.log(Math.max(2, probs.length));
  const sharpness = maxEntropy > 0 ? 1 - entropy / maxEntropy : 0;

  policyBadge.textContent = `${trainModelLabel} top ${(topProb * 100).toFixed(1)}% | sharp ${(
    sharpness * 100
  ).toFixed(1)}%`;
}

function refreshUI() {
  renderBoard(game);
  renderMoveList(game);

  turnBadge.textContent = game.sideToMove === "w" ? "White to move" : "Black to move";
  const status = evaluateGameState(game);
  stateBadge.textContent = status.text;
  updateTimerBadge();
  updatePolicyBadge();

  if (!isBusy()) {
    if (game.result) {
      setMessage(game.result, "warn");
    } else {
      setMessage("", "info");
    }
  }

  const gameLocked = !!game.result || isBusy();
  randomBtn.disabled = gameLocked;
  autoplayBtn.disabled = gameLocked;
  moveInput.disabled = gameLocked;
  submitBtn.disabled = gameLocked;
  trainBtn.disabled = isBusy();
  policyPlayBtn.disabled = isBusy();
  resetBtn.disabled = isBusy();
  trainGamesInput.disabled = isBusy();
  trainModelSelect.disabled = isBusy();
  newModelNameInput.disabled = isBusy();
  newModelBtn.disabled = isBusy();
  deleteModelBtn.disabled = isBusy() || models.length <= 1 || !currentTrainModel();
  trainWhiteModelSelect.disabled = isBusy();
  trainBlackModelSelect.disabled = isBusy();
  whiteModelSelect.disabled = isBusy();
  blackModelSelect.disabled = isBusy();
  matchGamesInput.disabled = isBusy();
}

function playMoveInput(inputSan) {
  if (game.result || isBusy()) return;

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
  if (isBusy()) return;
  const value = moveInput.value;
  if (!value.trim()) return;
  playMoveInput(value);
  moveInput.value = "";
  moveInput.focus();
});

randomBtn.addEventListener("click", () => {
  if (game.result || isBusy()) return;
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

function getLegalMoves(state) {
  return generateLegalMoves(state);
}

function isTerminal(state) {
  if (state.result) return true;
  return evaluateGameState(state).terminal;
}

function getTerminalResult(state) {
  if (!isTerminal(state)) {
    return { winner: null, reason: "in-progress" };
  }

  const reason = state.result || "Draw";
  if (reason.startsWith("White wins")) return { winner: "white", reason };
  if (reason.startsWith("Black wins")) return { winner: "black", reason };
  return { winner: null, reason };
}

function getSideToMove(state) {
  return state.sideToMove === "w" ? "white" : "black";
}

function moveToId(move) {
  const promo = move.promotion ? move.promotion.toLowerCase() : "";
  return `${toSquare(move.from)}${toSquare(move.to)}${promo}`;
}

function encodePosition(state) {
  const vec = new Float32Array(POSITION_FEATURE_SIZE);
  for (let i = 0; i < 64; i += 1) {
    const piece = state.board[i];
    if (!piece) continue;
    const plane = PIECE_TO_PLANE[piece];
    if (plane !== undefined) {
      vec[plane * 64 + i] = 1;
    }
  }
  vec[12 * 64] = state.sideToMove === "w" ? 1 : 0;
  return vec;
}

function encodeMove(move) {
  const vec = new Float32Array(MOVE_FEATURE_SIZE);
  vec[move.from] = 1;
  vec[64 + move.to] = 1;

  const promo = move.promotion ? move.promotion.toUpperCase() : "NONE";
  const promoIdx = PROMOTION_TO_INDEX[promo] ?? 0;
  vec[128 + promoIdx] = 1;

  vec[133] = move.capture || move.enPassant ? 1 : 0;
  vec[134] = move.castle ? 1 : 0;
  vec[135] = move.enPassant ? 1 : 0;
  return vec;
}

function combineFeatureVectors(positionVec, moveVec) {
  const combined = new Float32Array(POLICY_FEATURE_SIZE);
  combined.set(positionVec);
  combined.set(moveVec, POSITION_FEATURE_SIZE);
  return combined;
}

function scoreFeaturesLinear(features, model) {
  const targetModel = model || currentTrainModel();
  if (!targetModel) return 0;
  let score = 0;
  const { weights } = targetModel;
  for (let i = 0; i < weights.length; i += 1) {
    score += weights[i] * features[i];
  }
  return score;
}

function softmaxFromScores(scores, temperature = 1) {
  const scaled = scores.map((s) => s / Math.max(temperature, 1e-6));
  const maxScore = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - maxScore));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    return exps.map(() => 1 / exps.length);
  }
  return exps.map((value) => value / sum);
}

function sampleIndexFromDistribution(probs, rng = Math.random) {
  let roll = rng();
  for (let i = 0; i < probs.length; i += 1) {
    roll -= probs[i];
    if (roll <= 0) return i;
  }
  return probs.length - 1;
}

function argmaxIndex(values) {
  let bestIdx = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[bestIdx]) bestIdx = i;
  }
  return bestIdx;
}

function coverageCount(state, side) {
  let covered = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    if (isSquareAttacked(state, sq, side)) covered += 1;
  }
  return covered;
}

function threatScore(state, side) {
  const enemy = enemyColor(side);
  let score = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = state.board[sq];
    if (!piece || pieceColor(piece) !== enemy) continue;
    if (isSquareAttacked(state, sq, side)) {
      score += PIECE_VALUES[piece.toUpperCase()] || 0;
    }
  }
  return score;
}

function selectMoveWithCoverageHeuristic(state, legalMoves, options = {}) {
  const { temperature = 1, sample = true, rng = Math.random, forcedMoveId = null } = options;
  const side = state.sideToMove;
  const enemy = enemyColor(side);
  const myBefore = coverageCount(state, side);
  const oppBefore = coverageCount(state, enemy);
  const threatBefore = threatScore(state, side);
  const scores = [];

  for (const move of legalMoves) {
    const next = applyMove(state, move, { trackRepetition: false });
    const myAfter = coverageCount(next, side);
    const oppAfter = coverageCount(next, enemy);
    const threatAfter = threatScore(next, side);
    const threatDelta = threatAfter - threatBefore;
    const score = (myAfter - myBefore) - (oppAfter - oppBefore) + COVERAGE_THREAT_BONUS_WEIGHT * threatDelta;
    scores.push(score);
  }

  const probs = softmaxFromScores(scores, temperature);
  let chosenIndex;
  if (forcedMoveId) {
    chosenIndex = legalMoves.findIndex((m) => moveToId(m) === forcedMoveId);
    if (chosenIndex < 0) chosenIndex = argmaxIndex(probs);
  } else {
    chosenIndex = sample ? sampleIndexFromDistribution(probs, rng) : argmaxIndex(probs);
  }

  return {
    move: legalMoves[chosenIndex],
    moveId: moveToId(legalMoves[chosenIndex]),
    chosenIndex,
    probs,
    policyGradient: null,
  };
}

function materialBalance(state) {
  let score = 0;
  for (const piece of state.board) {
    if (!piece) continue;
    const value = PIECE_VALUES[piece.toUpperCase()] || 0;
    score += piece === piece.toUpperCase() ? value : -value;
  }
  return score;
}

function sideMaterialAdvantage(state) {
  const balance = materialBalance(state);
  return state.sideToMove === "w" ? balance : -balance;
}

function nonPawnMaterialTotal(state) {
  let total = 0;
  for (const piece of state.board) {
    if (!piece) continue;
    const type = piece.toUpperCase();
    if (type === "K" || type === "P") continue;
    total += PIECE_VALUES[type] || 0;
  }
  return total;
}

function gamePhase(state) {
  const nonPawn = nonPawnMaterialTotal(state);
  if (nonPawn >= 26) return "opening";
  if (nonPawn >= 14) return "middlegame";
  return "endgame";
}

function isPassedPawn(state, square, side) {
  const file = fileOf(square);
  const rank = rankOf(square);
  const enemyPawn = side === "w" ? "p" : "P";
  const dir = side === "w" ? 1 : -1;

  for (let df = -1; df <= 1; df += 1) {
    const f = file + df;
    if (f < 0 || f > 7) continue;
    let r = rank + dir;
    while (r >= 0 && r < 8) {
      if (state.board[idx(f, r)] === enemyPawn) return false;
      r += dir;
    }
  }

  return true;
}

function kingDistance(a, b) {
  if (a < 0 || b < 0) return 8;
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

function progressScoreWhitePOV(state) {
  let score = materialBalance(state);
  let whitePassed = 0;
  let blackPassed = 0;

  for (let i = 0; i < 64; i += 1) {
    const piece = state.board[i];
    if (!piece) continue;
    if (piece === "P") {
      // Higher rank is better for white pawns.
      score += rankOf(i) * 0.04;
      if (isPassedPawn(state, i, "w")) whitePassed += 1;
    } else if (piece === "p") {
      // Lower rank is better for black pawns (white POV subtracts).
      score -= (7 - rankOf(i)) * 0.04;
      if (isPassedPawn(state, i, "b")) blackPassed += 1;
    }
  }

  score += (whitePassed - blackPassed) * 0.45;
  return score;
}

function isCentralSquare(index) {
  const f = fileOf(index);
  const r = rankOf(index);
  return (f === 3 || f === 4) && (r === 3 || r === 4);
}

function isExtendedCenterSquare(index) {
  const f = fileOf(index);
  const r = rankOf(index);
  return f >= 2 && f <= 5 && r >= 2 && r <= 5;
}

function fileDistance(a, b) {
  return Math.abs(fileOf(a) - fileOf(b));
}

function findKing(state, side) {
  return kingSquare(state, side);
}

function heuristicMoveBonus(state, move, nextState, ply = 0) {
  const piece = state.board[move.from];
  if (!piece) return 0;
  const type = piece.toUpperCase();
  const side = pieceColor(piece);
  const enemy = enemyColor(side);
  const phase = gamePhase(state);
  let bonus = 0;

  if (move.castle) bonus += 0.9;

  // Core center and development incentives (down-weight king center in non-endgames).
  const centerBonus = isCentralSquare(move.to) ? 0.55 : isExtendedCenterSquare(move.to) ? 0.2 : 0;
  if (type !== "K") {
    bonus += centerBonus;
  } else if (phase === "endgame") {
    bonus += centerBonus * 0.8;
  }

  // Develop minor pieces off the back rank in opening.
  if ((type === "N" || type === "B") && (phase === "opening" || ply < 18)) {
    const startRank = side === "w" ? 0 : 7;
    if (rankOf(move.from) === startRank && rankOf(move.to) !== startRank) bonus += 0.32;
  }

  // Discourage king wandering before endgame.
  if (type === "K" && !move.castle && phase !== "endgame" && ply < 26) bonus -= 0.45;

  // Endgame king activity and conversion pressure.
  if (type === "K" && phase === "endgame") {
    const enemyKingBefore = findKing(state, enemy);
    const enemyKingAfter = findKing(nextState, enemy);
    if (enemyKingBefore >= 0 && enemyKingAfter >= 0) {
      const dBefore = kingDistance(move.from, enemyKingBefore);
      const dAfter = kingDistance(move.to, enemyKingAfter);
      if (dAfter < dBefore) bonus += 0.2;
    }
  }

  // Encourage exchanges/winning material patterns.
  const captured = move.enPassant
    ? state.board[idx(fileOf(move.to), rankOf(move.from))]
    : state.board[move.to];
  if (captured) {
    const capValue = PIECE_VALUES[captured.toUpperCase()] || 0;
    const ownValue = PIECE_VALUES[type] || 0;
    bonus += 0.25 + Math.max(0, capValue - ownValue) * 0.15;
  }

  // Reward giving check.
  if (inCheck(nextState, enemy)) bonus += 0.3;

  // Pawn storm heuristic: if opponent king is castled to a wing, reward pawn advances on that wing.
  if (type === "P") {
    const enemyKingSq = findKing(nextState, enemy);
    const ownKingSq = findKing(nextState, side);
    const fromRank = rankOf(move.from);
    const toRank = rankOf(move.to);
    const progress = side === "w" ? toRank - fromRank : fromRank - toRank;
    const promotionDistance = side === "w" ? 7 - toRank : toRank;

    // Passed pawn creation/advancement is critical.
    if (isPassedPawn(nextState, move.to, side)) {
      bonus += 0.45;
      bonus += (6 - promotionDistance) * 0.06;
      if (ownKingSq >= 0 && kingDistance(ownKingSq, move.to) <= 2) {
        bonus += 0.18;
      }
    }

    if (enemyKingSq >= 0) {
      if (progress > 0 && fileDistance(move.to, enemyKingSq) <= 2) {
        bonus += 0.18 * progress;
      }

      // Extra for central pawn breaks.
      const toFile = fileOf(move.to);
      if ((toFile === 3 || toFile === 4) && progress > 0) bonus += 0.18;

      // Push pawns toward enemy king zone after opening.
      if ((phase !== "opening" || ply > 16) && progress > 0 && fileDistance(move.to, enemyKingSq) <= 3) {
        bonus += 0.1;
      }
    }
  }

  return bonus;
}

function selectMoveWithPolicy(state, legalMoves, options = {}) {
  const {
    temperature = 1,
    sample = true,
    collectGradient = false,
    antiRepeat = true,
    rng = Math.random,
    epsilonRandom = 0,
    heuristicWeight = 0,
    ply = 0,
    model = null,
    forcedMoveId = null,
  } = options;

  const positionVec = encodePosition(state);
  const featureVectors = [];
  const scores = [];
  for (const move of legalMoves) {
    const features = combineFeatureVectors(positionVec, encodeMove(move));
    featureVectors.push(features);
    scores.push(scoreFeaturesLinear(features, model));
  }

  const adjustedScores = scores.slice();
  if (heuristicWeight > 0) {
    for (let i = 0; i < legalMoves.length; i += 1) {
      const next = applyMove(state, legalMoves[i], { trackRepetition: false });
      adjustedScores[i] += heuristicWeight * heuristicMoveBonus(state, legalMoves[i], next, ply);
    }
  }
  if (antiRepeat && legalMoves.length > 1) {
    const repeatCounts = Array(legalMoves.length).fill(0);
    const nonRepeatingIndices = [];
    const materialAdvantage = sideMaterialAdvantage(state);

    for (let i = 0; i < legalMoves.length; i += 1) {
      const next = applyMove(state, legalMoves[i], { trackRepetition: false });
      const nextKey = computePositionKey(next);
      const repeats = (state.positionCounts && state.positionCounts[nextKey]) || 0;
      repeatCounts[i] = repeats;
      if (repeats === 0) nonRepeatingIndices.push(i);
    }

    if (materialAdvantage > 0 && nonRepeatingIndices.length > 0) {
      for (let i = 0; i < repeatCounts.length; i += 1) {
        if (repeatCounts[i] > 0) {
          adjustedScores[i] = -1e9;
        }
      }
    } else {
      const penaltyScale =
        ANTI_REPEAT_BASE_PENALTY * (materialAdvantage > 0 ? ANTI_REPEAT_AHEAD_MULTIPLIER : 1);
      for (let i = 0; i < repeatCounts.length; i += 1) {
        if (repeatCounts[i] > 0) {
          adjustedScores[i] -= penaltyScale * repeatCounts[i];
        }
      }
    }
  }

  const probs = softmaxFromScores(adjustedScores, temperature);
  let chosenIndex;
  if (forcedMoveId) {
    chosenIndex = legalMoves.findIndex((m) => moveToId(m) === forcedMoveId);
    if (chosenIndex < 0) chosenIndex = argmaxIndex(probs);
  } else if (epsilonRandom > 0 && rng() < epsilonRandom) {
    chosenIndex = Math.floor(rng() * legalMoves.length);
  } else {
    chosenIndex = sample ? sampleIndexFromDistribution(probs, rng) : argmaxIndex(probs);
  }
  const chosenMove = legalMoves[chosenIndex];
  let policyGradient = null;

  if (collectGradient) {
    const expected = new Float32Array(POLICY_FEATURE_SIZE);
    for (let i = 0; i < featureVectors.length; i += 1) {
      const p = probs[i];
      const fv = featureVectors[i];
      for (let j = 0; j < expected.length; j += 1) {
        expected[j] += p * fv[j];
      }
    }

    policyGradient = new Float32Array(POLICY_FEATURE_SIZE);
    const chosen = featureVectors[chosenIndex];
    for (let j = 0; j < policyGradient.length; j += 1) {
      policyGradient[j] = chosen[j] - expected[j];
    }
  }

  return {
    move: chosenMove,
    moveId: moveToId(chosenMove),
    chosenIndex,
    probs,
    policyGradient,
  };
}

function updatePolicyFromTrajectory(model, trajectory, whiteReward, sharedBias = 0) {
  if (!model) return;
  if (!trajectory.length) return;

  const stepScale = LEARNING_RATE / trajectory.length;
  const { weights } = model;
  for (const step of trajectory) {
    const advantage = (step.player === "white" ? whiteReward : -whiteReward) + sharedBias + (step.movePenalty || 0);
    if (advantage === 0) continue;
    const scale = stepScale * advantage;
    const grad = step.policyGradient;

    for (let i = 0; i < weights.length; i += 1) {
      weights[i] += scale * grad[i];
      if (weights[i] > 5) weights[i] = 5;
      if (weights[i] < -5) weights[i] = -5;
    }
  }
}

async function runPolicySelfPlayGame(options = {}) {
  const {
    whiteModelId = RANDOM_MODEL_ID,
    blackModelId = RANDOM_MODEL_ID,
    trainModel = null,
    temperature = TEMPERATURE_TRAIN,
    collectTrajectory = true,
    maxPlies = MAX_PLIES,
    seed = nextSeed(),
  } = options;

  const rng = createRng(seed);
  let sim = createInitialState();
  const trajectory = [];
  let plies = 0;
  let stagnantPlies = 0;
  const visitedCounts = new Map();
  visitedCounts.set(sim.positionKey, 1);
  const progressHistory = [progressScoreWhitePOV(sim)];

    const openingRandomPlies = randInt(TRAIN_OPENING_RANDOM_MIN, TRAIN_OPENING_RANDOM_MAX, rng);
  for (let i = 0; i < openingRandomPlies && !isTerminal(sim) && plies < maxPlies; i += 1) {
    const legalMoves = getLegalMoves(sim);
    if (!legalMoves.length) break;
    const randomMove = legalMoves[Math.floor(rng() * legalMoves.length)];
    sim = applyMove(sim, randomMove);
    plies += 1;
    const occurrence = visitedCounts.get(sim.positionKey) || 0;
    visitedCounts.set(sim.positionKey, occurrence + 1);
    progressHistory.push(progressScoreWhitePOV(sim));
  }

  while (!isTerminal(sim) && plies < maxPlies) {
    const legalMoves = getLegalMoves(sim);
    if (!legalMoves.length) break;

    const player = getSideToMove(sim);
    const modelId = player === "white" ? whiteModelId : blackModelId;
    const decision = chooseMoveForModel(sim, legalMoves, modelId, rng, plies, {
      training: true,
      temperature,
      heuristicWeight: HEURISTIC_WEIGHT_TRAIN,
      collectGradient: false,
    });
    const chosenMoveId = moveToId(decision.move);
    let trainedView = null;
    if (collectTrajectory && trainModel) {
      trainedView = selectMoveWithPolicy(sim, legalMoves, {
        temperature,
        sample: false,
        collectGradient: true,
        antiRepeat: true,
        rng,
        epsilonRandom: 0,
        heuristicWeight: HEURISTIC_WEIGHT_TRAIN,
        ply: plies,
        model: trainModel,
        forcedMoveId: chosenMoveId,
      });
    }

    sim = applyMove(sim, decision.move);
    plies += 1;
    const occurrence = visitedCounts.get(sim.positionKey) || 0;
    const repeatPenalty = occurrence > 0 ? REPEAT_POSITION_PENALTY * occurrence : 0;
    visitedCounts.set(sim.positionKey, occurrence + 1);
    const progressNow = progressScoreWhitePOV(sim);
    let noProgressPenalty = 0;
    if (progressHistory.length > NO_PROGRESS_WINDOW && sim.halfmoveClock >= 8) {
      const anchor = progressHistory[progressHistory.length - 1 - NO_PROGRESS_WINDOW];
      if (Math.abs(progressNow - anchor) < NO_PROGRESS_THRESHOLD) {
        noProgressPenalty = NO_PROGRESS_PENALTY;
        stagnantPlies += 1;
      }
    }
    progressHistory.push(progressNow);
    const movePenalty = -(repeatPenalty + noProgressPenalty);

    if (trainedView && trainedView.policyGradient) {
      trajectory.push({
        player,
        policyGradient: trainedView.policyGradient,
        movePenalty,
      });
    }
  }

  if (!isTerminal(sim) && plies >= maxPlies) {
    sim.result = "Draw by max plies limit";
  }

  const terminal = getTerminalResult(sim);
  const whiteReward = terminal.winner === "white" ? 1 : terminal.winner === "black" ? -1 : 0;
  const isLoopDraw = terminal.winner === null && /threefold repetition|50-move/i.test(terminal.reason);
  const sharedBias = -PER_PLY_PENALTY + (isLoopDraw ? -LOOP_DRAW_PENALTY : 0);
  return {
    finalState: sim,
    trajectory,
    plies,
    terminal,
    whiteReward,
    sharedBias,
    isLoopDraw,
    seed,
    openingRandomPlies,
    stagnantPlies,
  };
}

async function autoplayFullGame() {
  if (game.result || isBusy()) return;

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

async function trainPolicyBatch(gameCount = DEFAULT_GAMES_PER_TRAIN_CLICK) {
  if (isBusy()) return;
  const model = currentTrainModel();
  if (!model) {
    setMessage("No train model selected.", "error");
    return;
  }
  const whiteModelId = trainWhiteModelSelect.value || RANDOM_MODEL_ID;
  const blackModelId = trainBlackModelSelect.value || RANDOM_MODEL_ID;

  isTraining = true;
  const startMs = performance.now();
  let whiteWins = 0;
  let blackWins = 0;
  let draws = 0;
  let loopDraws = 0;
  let totalPlies = 0;
  let totalStagnantPlies = 0;

  try {
    setMessage(
      `Training ${model.name} using games=${gameCount} white=${modelLabel(whiteModelId)} black=${modelLabel(
        blackModelId
      )}...`,
      "info"
    );
    appendTrainLog(
      `[train] start target=${model.name} games=${gameCount} white=${modelLabel(whiteModelId)} black=${modelLabel(
        blackModelId
      )}`
    );
    refreshUI();

    for (let i = 0; i < gameCount; i += 1) {
      const gameRun = await runPolicySelfPlayGame({
        whiteModelId,
        blackModelId,
        trainModel: model,
        temperature: TEMPERATURE_TRAIN,
        collectTrajectory: true,
        maxPlies: MAX_PLIES,
        seed: nextSeed(),
      });

      updatePolicyFromTrajectory(model, gameRun.trajectory, gameRun.whiteReward, gameRun.sharedBias);
      model.gamesTrained += 1;

      totalPlies += gameRun.plies;
      totalStagnantPlies += gameRun.stagnantPlies || 0;

      if (gameRun.terminal.winner === "white") whiteWins += 1;
      else if (gameRun.terminal.winner === "black") blackWins += 1;
      else {
        draws += 1;
        if (gameRun.isLoopDraw) loopDraws += 1;
      }

      if ((i + 1) % 10 === 0 || i + 1 === gameCount) {
        setMessage(`Training... ${i + 1}/${gameCount} games`, "info");
        appendTrainLog(
          `[train] ${i + 1}/${gameCount} W:${whiteWins} B:${blackWins} D:${draws} loopD:${loopDraws} avgPlies:${(
            totalPlies / (i + 1)
          ).toFixed(1)} avgStag:${(totalStagnantPlies / (i + 1)).toFixed(
            1
          )} targetGames:${model.gamesTrained} lastSeed:${gameRun.seed} openRnd:${gameRun.openingRandomPlies}`
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await persistModel(model);
    refreshModelSelectors();

    const elapsed = performance.now() - startMs;
    setMessage(
      `Training ${model.name} complete: ${gameCount} games in ${formatDuration(elapsed)} (W:${whiteWins} B:${blackWins} D:${draws}, loopD:${loopDraws})`,
      "ok"
    );
    appendTrainLog(
      `[train] done target=${model.name} games=${gameCount} totalTrained:${model.gamesTrained} white=${modelLabel(
        whiteModelId
      )} black=${modelLabel(blackModelId)} loopD:${loopDraws} time=${formatDuration(elapsed)}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMessage(`Training failed: ${message}`, "error");
    appendTrainLog(`[train] error ${message}`);
  } finally {
    isTraining = false;
    refreshUI();
  }
}

function chooseMoveForModel(state, legalMoves, modelId, rng, ply, options = {}) {
  const {
    training = false,
    temperature = training ? TEMPERATURE_TRAIN : TEMPERATURE_PLAY,
    heuristicWeight = training ? HEURISTIC_WEIGHT_TRAIN : HEURISTIC_WEIGHT_PLAY,
    collectGradient = false,
  } = options;

  if (modelId === RANDOM_MODEL_ID) {
    const move = legalMoves[Math.floor(rng() * legalMoves.length)];
    return { move };
  }
  if (modelId === HEURISTIC_MODEL_ID) {
    return selectMoveWithCoverageHeuristic(state, legalMoves, {
      temperature,
      sample: training,
      rng,
    });
  }

  const model = getModelById(modelId);
  if (!model) {
    const move = legalMoves[Math.floor(rng() * legalMoves.length)];
    return { move };
  }

  return selectMoveWithPolicy(state, legalMoves, {
    temperature,
    sample: training ? true : ply < PLAY_OPENING_RANDOM_PLIES,
    collectGradient,
    antiRepeat: true,
    rng,
    epsilonRandom: training ? 0 : PLAY_EPSILON_RANDOM,
    heuristicWeight,
    ply,
    model,
  });
}

function modelLabel(modelId) {
  return modelDisplayName(modelId);
}

async function playOneModelGame(options = {}) {
  const {
    whiteModel = activeTrainModelId || RANDOM_MODEL_ID,
    blackModel = RANDOM_MODEL_ID,
    rng = Math.random,
    animate = false,
    seed = nextSeed(),
  } = options;

  let sim = createInitialState();
  let plies = 0;
  if (animate) {
    game = sim;
    refreshUI();
  }

  while (!sim.result && plies < MAX_PLIES) {
    const legalMoves = getLegalMoves(sim);
    if (!legalMoves.length) break;

    const toMove = getSideToMove(sim);
    const modelId = toMove === "white" ? whiteModel : blackModel;
    const decision = chooseMoveForModel(sim, legalMoves, modelId, rng, plies);
    const san = sanForMove(sim, decision.move, legalMoves);
    sim = applyMove(sim, decision.move);
    sim.history.push(san);
    plies += 1;

    if (animate) {
      game = sim;
      refreshUI();
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  if (!sim.result && plies >= MAX_PLIES) {
    sim.result = "Draw by max plies limit";
  }

  return {
    finalState: sim,
    terminal: getTerminalResult(sim),
    plies,
    seed,
    whiteModel,
    blackModel,
  };
}

async function playModelMatch(games, whiteModel, blackModel) {
  if (isBusy()) return;

  isMatchPlaying = true;
  const startMs = performance.now();
  const animate = games === 1;
  let whiteWins = 0;
  let blackWins = 0;
  let draws = 0;
  const modelWins = {};
  let totalPlies = 0;
  let lastGame = null;

  try {
    setMessage(
      `Running model match: white=${modelLabel(whiteModel)} black=${modelLabel(blackModel)} games=${games}`,
      "info"
    );
    appendTrainLog(`[match] start white=${modelLabel(whiteModel)} black=${modelLabel(blackModel)} games=${games}`);
    refreshUI();

    for (let i = 0; i < games; i += 1) {
      const seed = nextSeed();
      const rng = createRng(seed);
      const gameRun = await playOneModelGame({
        whiteModel,
        blackModel,
        rng,
        animate,
        seed,
      });
      lastGame = gameRun;
      totalPlies += gameRun.plies;

      if (gameRun.terminal.winner === "white") {
        whiteWins += 1;
        modelWins[whiteModel] = (modelWins[whiteModel] || 0) + 1;
      } else if (gameRun.terminal.winner === "black") {
        blackWins += 1;
        modelWins[blackModel] = (modelWins[blackModel] || 0) + 1;
      } else {
        draws += 1;
      }

      if (!animate && ((i + 1) % 10 === 0 || i + 1 === games)) {
        setMessage(`Match in progress... ${i + 1}/${games}`, "info");
        appendTrainLog(
          `[match] ${i + 1}/${games} Ww:${whiteWins} Bw:${blackWins} D:${draws} ${modelLabel(whiteModel)}W:${
            modelWins[whiteModel] || 0
          } ${modelLabel(blackModel)}W:${modelWins[blackModel] || 0} avgPlies:${(
            totalPlies / (i + 1)
          ).toFixed(1)}`
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (lastGame) {
      game = lastGame.finalState;
    }

    const elapsed = performance.now() - startMs;
    setMessage(
      `Match done in ${formatDuration(elapsed)}: whiteWins=${whiteWins}, blackWins=${blackWins}, draws=${draws}, ${modelLabel(
        whiteModel
      )}Wins=${modelWins[whiteModel] || 0}, ${modelLabel(blackModel)}Wins=${modelWins[blackModel] || 0}`,
      "ok"
    );
    appendTrainLog(
      `[match] done in ${formatDuration(elapsed)} Ww:${whiteWins} Bw:${blackWins} D:${draws} ${modelLabel(
        whiteModel
      )}W:${modelWins[whiteModel] || 0} ${modelLabel(blackModel)}W:${modelWins[blackModel] || 0} avgPlies:${(
        totalPlies / Math.max(1, games)
      ).toFixed(1)}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMessage(`Match failed: ${message}`, "error");
    appendTrainLog(`[match] error ${message}`);
  } finally {
    isMatchPlaying = false;
    refreshUI();
  }
}

trainBtn.addEventListener("click", () => {
  const requested = Number.parseInt(trainGamesInput.value, 10);
  const gameCount = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_GAMES_PER_TRAIN_CLICK;
  trainGamesInput.value = String(gameCount);
  trainPolicyBatch(gameCount);
});

trainModelSelect.addEventListener("change", () => {
  activeTrainModelId = trainModelSelect.value;
  refreshUI();
});

trainWhiteModelSelect.addEventListener("change", () => {
  refreshUI();
});

trainBlackModelSelect.addEventListener("change", () => {
  refreshUI();
});

newModelBtn.addEventListener("click", async () => {
  if (isBusy()) return;
  const rawName = newModelNameInput.value.trim();
  const name = rawName || defaultModelName(modelCounter);
  if (models.some((m) => m.name === name)) {
    setMessage("Model name already exists.", "error");
    return;
  }
  const model = createModel(name);
  models.push(model);
  activeTrainModelId = model.id;
  refreshModelSelectors();
  await persistModel(model);
  newModelNameInput.value = "";
  refreshUI();
  setMessage(`Created model ${model.name}.`, "ok");
  appendTrainLog(`[models] created ${model.name}`);
});

deleteModelBtn.addEventListener("click", async () => {
  if (isBusy()) return;
  const target = currentTrainModel();
  if (!target) {
    setMessage("No model selected to delete.", "error");
    return;
  }
  if (models.length <= 1) {
    setMessage("Cannot delete the last remaining model.", "error");
    return;
  }

  const deletedName = target.name;
  models = models.filter((m) => m.id !== target.id);
  await deleteModelFromStorage(target.id);

  if (!getModelById(activeTrainModelId)) {
    activeTrainModelId = models[0]?.id || null;
  }
  refreshModelSelectors();

  if (trainWhiteModelSelect.value === target.id) {
    trainWhiteModelSelect.value = activeTrainModelId || RANDOM_MODEL_ID;
  }
  if (trainBlackModelSelect.value === target.id) {
    trainBlackModelSelect.value = RANDOM_MODEL_ID;
  }
  if (whiteModelSelect.value === target.id) {
    whiteModelSelect.value = activeTrainModelId || RANDOM_MODEL_ID;
  }
  if (blackModelSelect.value === target.id) {
    blackModelSelect.value = RANDOM_MODEL_ID;
  }

  refreshUI();
  setMessage(`Deleted model ${deletedName}.`, "ok");
  appendTrainLog(`[models] deleted ${deletedName}`);
});

policyPlayBtn.addEventListener("click", () => {
  const whiteModel = whiteModelSelect.value || RANDOM_MODEL_ID;
  const blackModel = blackModelSelect.value || RANDOM_MODEL_ID;
  const requested = Number.parseInt(matchGamesInput.value, 10);
  const games = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_MATCH_GAMES;
  matchGamesInput.value = String(games);
  playModelMatch(games, whiteModel, blackModel);
});

resetBtn.addEventListener("click", () => {
  isAutoplaying = false;
  isTraining = false;
  isMatchPlaying = false;
  autoplayStartMs = null;
  lastAutoplayDurationMs = null;
  game = createInitialState();
  refreshUI();
  setMessage("Game reset.", "info");
});

appendTrainLog(
  `[policy] init linear model with ${POLICY_FEATURE_SIZE} features, lr=${LEARNING_RATE}, trainGames=${DEFAULT_GAMES_PER_TRAIN_CLICK}, tempTrain=${TEMPERATURE_TRAIN}, tempPlay=${TEMPERATURE_PLAY}, heurTrain=${HEURISTIC_WEIGHT_TRAIN}, heurPlay=${HEURISTIC_WEIGHT_PLAY}, plyPen=${PER_PLY_PENALTY}, loopDrawPen=${LOOP_DRAW_PENALTY}, repeatPen=${REPEAT_POSITION_PENALTY}, noProgWin=${NO_PROGRESS_WINDOW}, noProgThresh=${NO_PROGRESS_THRESHOLD}, noProgPen=${NO_PROGRESS_PENALTY}, antiRepBase=${ANTI_REPEAT_BASE_PENALTY}, antiRepAheadMult=${ANTI_REPEAT_AHEAD_MULTIPLIER}, trainOpenRnd:${TRAIN_OPENING_RANDOM_MIN}-${TRAIN_OPENING_RANDOM_MAX}, playOpenRnd:${PLAY_OPENING_RANDOM_PLIES}, playEps:${PLAY_EPSILON_RANDOM}`
);
initializeModels().finally(() => {
  refreshUI();
  moveInput.focus();
});
