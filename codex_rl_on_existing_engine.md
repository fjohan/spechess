# Codex Agent Instructions: Add Self‑Learning to an Existing Browser Chess Self‑Play Engine

You already have:
- A chess engine (in JS) that can **generate legal moves**, **play random legal moves**, and **reach terminal states** (checkmate/stalemate/draw).
- A self-play loop that can run full games.

Your task is to **add learning** so the move selection improves over time.

Goal: the smallest reinforcement-learning upgrade that works in a browser.

---

## 0) Non‑Goals / Constraints

- Do **not** rewrite the engine rules.
- Do **not** implement full AlphaZero.
- Keep training simple and stable: terminal reward only (+1/0/−1).
- Keep UI responsive.

Preferred libs:
- If you already use **chess.js**, keep it.
- For learning: **TensorFlow.js** recommended. If you already have another ML lib, adapt accordingly.

Deliverable:
- A working “train” button that runs N self-play games and updates parameters.
- A “play” button that plays a game using the learned policy (not purely random).

---

## 1) Integration Plan (High Level)

Replace “choose a random legal move” with:

1) **Encode** position -> numeric features
2) **Policy model** outputs scores/probabilities for candidate moves
3) **Sample** (or pick argmax) among legal moves
4) During self-play, **record** (state, chosen move, player-to-move)
5) When game ends, compute terminal reward and **update** the model

This is standard **REINFORCE** policy gradient:
- If the game was a win for the side that made a move, increase probability of that move in that position.
- If loss, decrease it.

---

## 2) Required Engine Hooks (Adapt to Your Code)

Locate or create these functions in the existing code:

### 2.1 Game/Position API
You must provide:

- `getLegalMoves(state) -> Move[]`
- `applyMove(state, move) -> newState` (or mutates and returns)
- `isTerminal(state) -> boolean`
- `getTerminalResult(state) -> { winner: 'white'|'black'|null, reason: string }`
  - `winner=null` means draw
- `getSideToMove(state) -> 'white'|'black'`

### 2.2 Move Identity
A move needs a stable identity that can be stored and compared.
Implement:
- `moveToId(move) -> string`
  - Prefer UCI-like: `"e2e4"`, promotions `"e7e8q"`

If your move object already has `from`, `to`, `promotion`, just stringify those.

---

## 3) Learning Approach A (Fastest to Integrate): “Score Legal Moves” Model

This avoids a huge fixed action space.

### Idea
Instead of outputting logits for *all possible chess moves*, we score each **legal move** with a small network:

`score = f(positionFeatures, moveFeatures)`

Then:
- Compute score for each legal move
- Softmax across legal moves -> probability distribution
- Sample one move
- Train with REINFORCE using the chosen move’s log-prob

### Why this is good for your situation
- Works with any engine that can list legal moves
- No need for 20k-output network
- Easy to extend with better move features later

---

## 4) Feature Encoding (Keep it Simple)

### 4.1 Position Features
Pick one:

**Option 1 (recommended): 12×64 one-hot planes**
- 12 piece planes (P N B R Q K for white; same for black)
- Flatten to 768 floats

**Option 2 (lighter): piece counts + side-to-move**
- counts of each piece type, plus turn bit
- much weaker, but easiest

Implement:
- `encodePosition(state) -> Float32Array`

### 4.2 Move Features
For each move, build a small vector. Minimal and effective:

- from-square (0..63) as one-hot (64)
- to-square (0..63) as one-hot (64)
- promotion one-hot (5) [none,q,r,b,n]
- optional flags: isCapture, givesCheck, isCastle (3 bits) if your engine exposes them

Total move feature size: 64+64+5 (+ optional).

Implement:
- `encodeMove(move) -> Float32Array`

### 4.3 Concatenate
`input = concat(positionVec, moveVec)`

---

## 5) Model Definition (TFJS)

### 5.1 Network
Simple MLP:

- Input: positionSize + moveSize
- Dense 256 ReLU
- Dense 128 ReLU
- Dense 1 (linear) -> score

### 5.2 Move Selection
Given legal moves `M = {m1..mk}`:
1. For each mi: compute `si = model(concat(pos, enc(mi)))`
2. `pi = softmax(s)` across k moves
3. sample `a ~ pi` (temperature optional)

Store for training:
- Either store `logProb(chosen)` as a tensor, or store enough info to recompute it.

Recommended minimal storage per ply:
- `positionVec` (Float32Array)
- `legalMoves` (or their encoded move vectors)
- `chosenIndex`
- `player`

If it’s easy in your engine, an alternative is to store a seed and **replay** the game to regenerate legal moves at training time.

---

## 6) Training (REINFORCE, Terminal Reward Only)

At end of a self-play game:
- Determine result from White POV: `z ∈ {+1, 0, -1}`
  - If white won: +1
  - black won: -1
  - draw: 0

For each ply t:
- If player was white: `adv = z`
- If player was black: `adv = -z`

Loss per ply:
- `L_t = - adv * log( p(chosenMove | state) )`

Total loss = average over plies.

Implementation steps:
1. Run self-play using current policy (exploration: temperature > 1.0 early)
2. Collect trajectory data needed to compute log-probs
3. Compute loss inside `optimizer.minimize(() => ...)`
4. Use `tf.tidy()` to avoid leaks
5. Occasionally `await tf.nextFrame()` to keep UI responsive

---

## 7) How to Integrate with Your Existing Random Self‑Play Loop

Find the code that does:
- `move = randomChoice(legalMoves)`

Replace with:
- `move = await selectMoveWithPolicy(state, legalMoves)`

Where `selectMoveWithPolicy`:
- encodes position once
- scores each legal move
- softmax + sampling
- returns chosen move plus any training metadata

During training self-play, collect `trajectory.push(stepData)` each ply.

For “play” mode (demo), use:
- lower temperature (e.g. 0.7)
- or argmax move

---

## 8) Minimal UI / Controls

Expose constants at the top:
- `LEARNING_RATE = 1e-3`
- `GAMES_PER_TRAIN_CLICK = 50`
- `MAX_PLIES = 200`
- `TEMPERATURE_TRAIN = 1.2`
- `TEMPERATURE_PLAY = 0.7`

UI:
- Train button logs W/L/D + average plies
- Play button prints move list or PGN

---

## 9) Acceptance Criteria

✅ You can run 50+ training games without crashes or memory blow-ups  
✅ After some training, move selection is measurably non-random (distribution changes)  
✅ “Play” mode uses the learned policy and produces legal complete games

---

## 10) Optional Improvements (Only If Easy)

- Add a **baseline** to reduce variance:
  - maintain moving average of z, use `adv = z - baseline`
- Add **value head** to predict z from position features and use it as baseline
- Add lightweight search (1-ply lookahead) to reduce blunders
- Add experience replay buffer

---

## 11) Implementation Checklist

- [ ] Identify engine hooks (legal moves, apply move, terminal result)
- [ ] Implement `encodePosition`
- [ ] Implement `encodeMove`
- [ ] Implement TFJS model `score(position, move)`
- [ ] Implement `selectMoveWithPolicy`
- [ ] Modify self-play loop to record trajectory
- [ ] Implement training step with REINFORCE loss
- [ ] Add UI buttons + logging
- [ ] Validate memory with `tf.memory()` during long runs
