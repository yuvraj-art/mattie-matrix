"use strict";

const size = 7;
const cast = [
  { name: "Luna", file: "luna", color: "#aa7cff" },
  { name: "Monk", file: "monk", color: "#ffd34e" },
  { name: "Momo", file: "momo", color: "#ff79b8" },
  { name: "Jade", file: "jade", color: "#56f5ba" },
  { name: "Sora", file: "sora", color: "#ff9c73" },
  { name: "The Mark", file: "mark", color: "#9692ad" }
];
const stages = [
  { name: "First Light", moves: 25, goals: [[0, 9], [3, 9]], stars: [1000, 2500, 4300] },
  { name: "Golden Hour", moves: 24, goals: [[1, 11], [4, 11]], stars: [1300, 2700, 4600] },
  { name: "Pink Static", moves: 24, goals: [[2, 13], [5, 12]], stars: [1500, 2900, 4900] },
  { name: "Split Signal", moves: 25, goals: [[0, 10], [2, 10]], ice: [[16, 17, 18, 23, 24, 25, 30, 31, 32]], stars: [1600, 3400, 5500] },
  { name: "Heatwave", moves: 24, goals: [[1, 13], [4, 13], [3, 10]], stars: [1800, 3600, 5800] },
  { name: "Night Circuit", moves: 26, goals: [[5, 12], [0, 12]], ice: [[8, 10, 12, 22, 24, 26, 36, 38, 40], [10, 24, 38]], stars: [2000, 3900, 6200] },
  { name: "Afterglow", moves: 24, goals: [[2, 15], [1, 15], [4, 14]], stars: [2200, 4200, 6600] },
  { name: "Full Circuit", moves: 28, goals: [[3, 14], [5, 14]], ice: [[8, 9, 10, 11, 12, 15, 19, 22, 24, 26, 29, 33, 36, 37, 38, 39, 40], [10, 22, 24, 26, 38]], stars: [2500, 4600, 7100] }
];
const powers = {
  burst: { name: "Starburst", icon: "✦", action: "clear its row and column" },
  nova: { name: "Nova", icon: "✹", action: "clear a 3 × 3 area" },
  prism: { name: "Prism", icon: "◆", action: "clear every portrait of the chosen type" }
};
const maxCharge = 24;
const maxCascade = 40;
const $ = id => document.getElementById(id);
const boardEl = $("board");
const dialog = $("dialog");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const storageKey = "portrait-parade-v1"; // Retain saved progress from the game's previous name.
const whole = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {}; } catch {}
const records = Object.fromEntries(stages.flatMap((_, i) => {
  const record = saved.records?.[i];
  return record && whole(record.score, 0) && whole(record.stars, 1, 3) ? [[i, { score: record.score, stars: record.stars }]] : [];
}));
let sound = saved.sound === true;
let motionPreference = typeof saved.motion === "boolean" ? saved.motion : null;
const motionEnabled = () => motionPreference ?? !reducedMotion.matches;
let audio;
let stageIndex;
let board, moves, score, collected, charges, selected, hinted, targeting, ended;
let ice, iceLeft, encoreCharge, bestChain;
let checkpoint = null;
let stageArtType = null;
let busy = false;
let focusIndex = 0;
let pointer;
let skipPointerClick = false;

const newTile = (type = Math.floor(Math.random() * cast.length)) => ({ type, power: false });
const row = i => Math.floor(i / size);
const col = i => i % size;
const neighbor = (a, b) => Math.abs(row(a) - row(b)) + Math.abs(col(a) - col(b)) === 1;
const sprite = type => "tiles/" + cast[type].file + ".webp";
const resultImage = won => "results/" + (won ? "win" : "loss") + ".webp";
const swap = (grid, a, b) => { [grid[a], grid[b]] = [grid[b], grid[a]]; };
function status(message, positive = false) {
  $("status").textContent = message;
  $("boardFooter").dataset.tone = positive ? "success" : "normal";
}
const number = value => value.toLocaleString();
function nearby(center) {
  return board.map((_, i) => i).filter(i => Math.abs(row(i) - row(center)) <= 1 && Math.abs(col(i) - col(center)) <= 1);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ records, sound, motion: motionPreference, run: checkpoint })); } catch {}
}
function iceFor(index) {
  const layers = Array(size * size).fill(0);
  for (const layer of stages[index].ice || []) {
    for (const i of layer) layers[i]++;
  }
  return layers;
}
function snapshot() {
  return { stageIndex, moves, score, collected: [...collected], charges: { ...charges }, ice: [...ice],
    encoreCharge, bestChain, board: board.map(tile => ({ ...tile })), ended };
}
function saveRun() {
  checkpoint = snapshot();
  persist();
}
function validRun(run) {
  if (!run || !whole(run.stageIndex, 0, unlockedStage())) return false;
  const limit = stages[run.stageIndex];
  if (!whole(run.moves, 0, limit.moves) || !whole(run.score, 0) || !whole(run.bestChain, 0, maxCascade)
    || !whole(run.encoreCharge, 0, maxCharge) || !whole(run.charges?.shuffle, 0, 2) || !whole(run.charges?.zap, 0, 1)) return false;
  if (!Array.isArray(run.collected) || run.collected.length !== cast.length || !run.collected.every(value => whole(value, 0))) return false;
  const maxIce = iceFor(run.stageIndex);
  if (!Array.isArray(run.ice) || run.ice.length !== maxIce.length || !run.ice.every((value, i) => whole(value, 0, maxIce[i]))) return false;
  if (!Array.isArray(run.board) || run.board.length !== size * size
    || !run.board.every(tile => tile && whole(tile.type, 0, cast.length - 1)
      && (tile.power === false || (typeof tile.power === "string" && Object.hasOwn(powers, tile.power))))) return false;
  const won = run.ice.every(value => value === 0) && limit.goals.every(([type, goal]) => run.collected[type] >= goal);
  return typeof run.ended === "boolean" && run.ended === (won || run.moves === 0) && !matches(run.board).length
    && (run.ended || Boolean(findSwap(run.board)));
}
function restoreRun(run) {
  stageIndex = run.stageIndex;
  moves = run.moves;
  score = run.score;
  collected = [...run.collected];
  charges = { ...run.charges };
  ice = [...run.ice];
  iceLeft = ice.reduce((sum, depth) => sum + depth, 0);
  encoreCharge = run.encoreCharge;
  bestChain = run.bestChain;
  board = run.board.map(tile => ({ ...tile }));
  ended = run.ended;
}
function tone(notes) {
  if (!sound) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const time = audio.currentTime;
    notes.forEach((note, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const begin = time + i * .072;
      osc.type = "sine";
      osc.frequency.value = note;
      gain.gain.setValueAtTime(.001, begin);
      gain.gain.exponentialRampToValueAtTime(.10, begin + .018);
      gain.gain.exponentialRampToValueAtTime(.001, begin + .18);
      osc.connect(gain).connect(audio.destination);
      osc.start(begin);
      osc.stop(begin + .19);
    });
  } catch {}
}
function matches(grid) {
  const runs = [];
  for (let line = 0; line < size; line++) {
    for (const vertical of [false, true]) {
      let run = [];
      for (let pos = 0; pos <= size; pos++) {
        const i = vertical ? pos * size + line : line * size + pos;
        const type = pos < size ? grid[i]?.type : undefined;
        if (run.length && grid[run[0]].type !== type) {
          if (run.length >= 3) runs.push(run);
          run = [];
        }
        if (type !== undefined) run.push(i);
      }
    }
  }
  return runs;
}
function findSwap(grid, prioritize = false) {
  let best = null;
  let bestValue = -1;
  for (let a = 0; a < grid.length; a++) {
    const candidates = [];
    if (col(a) < size - 1) candidates.push(a + 1);
    if (row(a) < size - 1) candidates.push(a + size);
    for (const b of candidates) {
      const powered = grid[a].power || grid[b].power;
      if (!powered && grid[a].type === grid[b].type) continue;
      swap(grid, a, b);
      const runs = matches(grid);
      if (prioritize && (powered || runs.length)) {
        const triggered = [a, b].filter(i => grid[i].power);
        const { clear, spawn } = planClear(runs, [b, a], triggered, swapColors(a, b));
        const goals = stages[stageIndex].goals.filter(([type, goal]) => collected[type] < goal).map(([type]) => type);
        let value = 0;
        for (const i of clear) value += (ice[i] ? 10 : 0) + (spawn.has(i) ? 0 : 1 + (goals.includes(grid[i].type) ? 4 : 0));
        if (value > bestValue) {
          bestValue = value;
          best = [a, b];
        }
      }
      swap(grid, a, b);
      if (!prioritize && (powered || runs.length)) return [a, b];
    }
  }
  return best;
}
function freshBoard() {
  let grid;
  do {
    grid = [];
    for (let i = 0; i < size * size; i++) {
      let tile;
      do {
        tile = newTile();
      } while ((col(i) >= 2 && grid[i - 1].type === tile.type && grid[i - 2].type === tile.type)
        || (row(i) >= 2 && grid[i - size].type === tile.type && grid[i - size * 2].type === tile.type));
      grid.push(tile);
    }
  } while (!findSwap(grid));
  return grid;
}
function remixBoard() {
  const copy = [...board];
  for (let attempt = 0; attempt < 160; attempt++) {
    for (let i = copy.length - 1; i > 0; i--) swap(copy, i, Math.floor(Math.random() * (i + 1)));
    if (!matches(copy).length && findSwap(copy)) return copy;
  }
  const replacement = freshBoard();
  let slot = 0;
  for (const tile of copy) {
    if (tile.power) replacement[slot++].power = tile.power;
  }
  return replacement;
}
function groupedRuns(runs) {
  const groups = [];
  for (const run of runs) {
    const merged = new Set(run);
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].some(cell => merged.has(cell))) {
        for (const cell of groups[i]) merged.add(cell);
        groups.splice(i, 1);
      }
    }
    groups.push([...merged]);
  }
  return groups;
}
function planClear(runs, preferred, triggered, prismColors = new Map()) {
  const clear = new Set(triggered);
  const spawn = new Map();
  for (const group of groupedRuns(runs)) {
    for (const i of group) clear.add(i);
    if (group.length < 4) continue;
    const choices = [...preferred, group[Math.floor(group.length / 2)], ...group];
    const at = choices.find(i => group.includes(i) && !board[i].power);
    if (at !== undefined) {
      const straight = runs.find(run => run.length >= 5 && run.every(i => group.includes(i)));
      const power = straight ? "prism" : group.length >= 5 ? "nova" : "burst";
      spawn.set(at, { ...board[at], power });
    }
  }
  const activations = [];
  for (const at of clear) {
    const tile = board[at];
    if (!tile?.power) continue;
    activations.push({ at, power: tile.power });
    if (tile.power === "nova") {
      for (const i of nearby(at)) clear.add(i);
      continue;
    }
    for (let i = 0; i < board.length; i++) {
      if (tile.power === "prism") {
        const color = prismColors.has(at) ? prismColors.get(at) : tile.type;
        if (color === null || board[i].type === color) clear.add(i);
      } else if (row(i) === row(at) || col(i) === col(at)) clear.add(i);
    }
  }
  return { clear, spawn, activations };
}
function swapColors(a, b) {
  const colors = new Map();
  for (const [at, other] of [[a, b], [b, a]]) {
    if (board[at].power === "prism") colors.set(at, board[other].power === "prism" ? null : board[other].type);
  }
  return colors;
}

const cells = Array.from({ length: size * size }, (_, i) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tile";
  button.dataset.index = i;
  button.innerHTML = '<span class="portrait"><span class="tile-face"><img alt="" draggable="false"><span class="power" hidden aria-hidden="true"></span></span></span><span class="frost" hidden aria-hidden="true"><i></i></span>';
  boardEl.append(button);
  return button;
});
const cellFaces = cells.map(button => ({
  image: button.querySelector("img"), badge: button.querySelector(".power"), frost: button.querySelector(".frost"), type: null
}));
const stageSteps = stages.map((stage, i) => {
  const step = document.createElement("button");
  step.type = "button";
  step.className = "stage-step";
  step.textContent = i + 1;
  step.title = stage.name;
  step.onclick = () => selectStage(i);
  $("stageTrack").append(step);
  return step;
});
function unlockedStage() {
  const firstUncleared = stages.findIndex((_, i) => !records[i]);
  return firstUncleared < 0 ? stages.length - 1 : firstUncleared;
}
function renderStageTrack() {
  const unlocked = unlockedStage();
  stageSteps.forEach((step, i) => {
    const current = i === stageIndex;
    const locked = i > unlocked;
    step.disabled = busy || current || locked;
    step.classList.toggle("complete", Boolean(records[i]));
    if (current) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
    step.setAttribute("aria-label", "Stage " + (i + 1) + ", " + stages[i].name + (locked ? ", locked" : records[i] ? ", cleared" : ""));
  });
}
function renderBoard() {
  boardEl.classList.toggle("targeting", targeting);
  cells.forEach((button, i) => {
    const tile = board[i];
    const power = powers[tile.power];
    const frost = ice[i];
    button.tabIndex = i === focusIndex ? 0 : -1;
    button.disabled = ended;
    button.classList.toggle("selected", selected === i);
    button.classList.toggle("hinted", hinted.includes(i));
    button.classList.toggle("powered", Boolean(power));
    button.classList.toggle("prism", tile.power === "prism");
    button.classList.toggle("nova", tile.power === "nova");
    button.classList.toggle("thick-frost", frost === 2);
    if (targeting !== "encore") button.classList.remove("blast-preview");
    button.setAttribute("aria-pressed", String(selected === i));
    button.setAttribute("aria-label", cast[tile.type].name + (power ? " " + power.name : "") + (frost ? ", frost " + frost + (frost === 1 ? " layer" : " layers") : "") + ", row " + (row(i) + 1) + ", column " + (col(i) + 1));
    button.style.setProperty("--tile-edge", cast[tile.type].color);
    const face = cellFaces[i];
    if (face.type !== tile.type) {
      face.type = tile.type;
      face.image.src = sprite(tile.type);
    }
    const badge = face.badge;
    badge.hidden = !power;
    badge.textContent = power?.icon || "";
    face.frost.hidden = !frost;
  });
}
function renderHud() {
  const stage = stages[stageIndex];
  $("stageChip").textContent = "Stage " + String(stageIndex + 1).padStart(2, "0") + " / " + String(stages.length).padStart(2, "0");
  renderStageTrack();
  $("stageName").textContent = stage.name;
  const lead = stage.goals[0][0];
  if (stageArtType !== lead) {
    stageArtType = lead;
    $("stagePortrait").src = sprite(lead);
  }
  updateStat($("moves"), String(moves));
  $("moves").classList.toggle("low", moves <= 5);
  updateStat($("score"), number(score));
  const goals = stage.goals.map(([type, goal]) => {
    const left = Math.max(0, goal - collected[type]);
    const el = document.createElement("div");
    el.className = "goal" + (left ? "" : " done");
    el.setAttribute("aria-label", cast[type].name + ": " + (left ? left + " left" : "complete"));
    el.style.setProperty("--tile-edge", cast[type].color);
    el.innerHTML = '<img src="' + sprite(type) + '" alt=""><span>' + cast[type].name + '</span><strong>' + (left || "✓") + '</strong>';
    return el;
  });
  if (stage.ice) {
    const frost = document.createElement("div");
    frost.className = "goal frost-goal" + (iceLeft ? "" : " done");
    frost.setAttribute("aria-label", iceLeft ? iceLeft + " frost layers left" : "Frost cleared");
    frost.innerHTML = '<i aria-hidden="true">❄</i><span>Frost layers</span><strong>' + (iceLeft || "✓") + '</strong>';
    goals.push(frost);
  }
  $("goals").replaceChildren(...goals);
  const max = stage.stars.at(-1);
  $("meter").firstElementChild.style.width = Math.min(100, score / max * 100) + "%";
  $("meter").setAttribute("aria-valuemax", max);
  $("meter").setAttribute("aria-valuenow", Math.min(score, max));
  [...$("starTrack").children].forEach((el, i) => {
    el.classList.toggle("earned", score >= stage.stars[i]);
    el.style.left = stage.stars[i] / max * 100 + "%";
  });
  $("shuffleCount").textContent = charges.shuffle;
  $("zapCount").textContent = charges.zap;
  updateStat($("bestChain"), bestChain ? "×" + bestChain : "—");
  const charge = Math.floor(encoreCharge / maxCharge * 100);
  $("encoreCharge").textContent = charge === 100 ? "Ready" : charge + "%";
  $("encoreMeter").firstElementChild.style.width = charge + "%";
  $("encoreMeter").setAttribute("aria-valuenow", charge);
  $("encore").disabled = busy || ended || charge < 100;
  $("encore").classList.toggle("ready", charge === 100 && !ended);
  $("encore").setAttribute("aria-pressed", String(targeting === "encore"));
  $("hint").disabled = busy || ended;
  $("shuffle").disabled = busy || ended || charges.shuffle <= 0;
  $("zap").disabled = busy || ended || charges.zap <= 0;
  $("zap").setAttribute("aria-pressed", String(targeting === "flash"));
  $("restart").disabled = busy;
  $("restartLabel").textContent = ended ? "View result" : "Restart";
  $("restartIcon").textContent = ended ? "▤" : "↻";
  $("restart").title = ended ? "View stage result" : "Restart stage";
  $("levelsBtn").disabled = busy;
}
function updateStat(el, value) {
  if (el.textContent === value) return;
  el.textContent = value;
  if (busy) void anim(el, [{ opacity: .63, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }], 200);
}
function start(index, moveFocus = true) {
  if (busy || !whole(index, 0, stages.length - 1)) return;
  cancelDrag();
  stageIndex = index;
  moves = stages[index].moves;
  score = 0;
  collected = cast.map(() => 0);
  charges = { shuffle: 2, zap: 1 };
  encoreCharge = 0;
  bestChain = 0;
  ice = iceFor(index);
  iceLeft = ice.reduce((total, depth) => total + depth, 0);
  selected = null;
  hinted = [];
  targeting = false;
  ended = false;
  focusIndex = 0;
  board = freshBoard();
  $("effects").replaceChildren();
  if (dialog.open) dialog.close();
  renderBoard();
  renderHud();
  status(iceLeft ? "Match over frosted cells to crack the ice." : "Drag or tap adjacent portraits to swap.");
  saveRun();
  if (moveFocus) {
    cells[0].focus({ preventScroll: true });
    void anim(boardEl, [{ opacity: .55 }, { opacity: 1 }], 260);
  }
}
function hasActiveRun() {
  return !ended && (moves < stages[stageIndex].moves || score > 0 || charges.shuffle < 2 || charges.zap < 1);
}
function selectStage(index) {
  if (busy || !whole(index, 0, unlockedStage())) return;
  if (index === stageIndex && !ended) {
    if (dialog.open) dialog.close();
    return;
  }
  if (hasActiveRun()) {
    openDialog('<p class="eyebrow">' + stages[stageIndex].name + '</p><h2>Switch to ' + stages[index].name + '?</h2>'
      + '<p>Switching stages ends the current run. Your completed stages and high scores stay saved.</p>'
      + '<div class="dialog-actions"><button class="primary" data-switch="' + index + '">Switch stage</button><button class="nav-btn" data-cancel>Keep playing</button></div>');
    return;
  }
  start(index);
}
function openDialog(html, isResult = false) {
  dialog.classList.toggle("result", isResult);
  const content = $("dialogContent");
  content.innerHTML = html;
  content.querySelector("h2").id = "dialogTitle";
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  if (isResult) content.querySelector(".primary").focus({ preventScroll: true });
}
function showOutcome(won, stars = 0) {
  const stage = stages[stageIndex];
  const finalStage = stageIndex === stages.length - 1;
  const summary = won
    ? '<span class="result-stars" aria-label="' + stars + ' out of 3 stars">' + "✦".repeat(stars) + "✧".repeat(3 - stars) + '</span>' + (finalStage ? '<p>All eight stages cleared.</p>' : "")
    : '<p>Out of moves. Give this stage another try.</p>';
  const actions = won
    ? (finalStage ? '<button class="primary" data-levels>View stages</button>' : '<button class="primary" data-next>Next stage</button>') + '<button class="nav-btn" data-retry>Replay</button>'
    : '<button class="primary" data-retry>Try again</button><button class="nav-btn" data-levels>View stages</button>';
  openDialog('<div class="result-layout"><img class="result-art" width="1254" height="1254" src="' + resultImage(won) + '" alt="Luna holding the result sign"><div class="result-detail"><p class="eyebrow">' + stage.name + '</p><h2>' + (won ? "You won" : "You lost") + '</h2>' + summary
    + '<dl class="result-stats"><div><dt>Score</dt><dd>' + number(score) + '</dd></div><div><dt>Best chain</dt><dd>' + (bestChain ? "×" + bestChain : "—") + '</dd></div></dl><div class="dialog-actions">' + actions + '</div></div></div>', true);
}
function checkEnd() {
  const won = goalsComplete();
  if (!won && moves > 0) return false;
  ended = true;
  if (won) {
    const stars = earnedStars();
    records[stageIndex] = {
      score: Math.max(score, records[stageIndex]?.score || 0),
      stars: Math.max(stars, records[stageIndex]?.stars || 0)
    };
    status("Stage cleared!", true);
    tone([523, 659, 784, 1047]);
    showOutcome(true, stars);
  } else {
    status("Out of moves.");
    tone([392, 294]);
    showOutcome(false);
  }
  return true;
}
function goalsComplete() {
  return iceLeft === 0 && stages[stageIndex].goals.every(([type, goal]) => collected[type] >= goal);
}
function earnedStars() {
  return Math.max(1, stages[stageIndex].stars.filter(value => score >= value).length);
}
function anim(element, frames, duration, easing = "ease-out") {
  if (!motionEnabled() || typeof element.animate !== "function") return Promise.resolve();
  return element.animate(frames, { duration, easing }).finished.catch(() => {});
}
function slide(a, b, progress = 0) {
  const first = cells[a].getBoundingClientRect();
  const second = cells[b].getBoundingClientRect();
  const dx = second.left - first.left;
  const dy = second.top - first.top;
  return Promise.all([a, b].map((i, n) => {
    const direction = n ? -1 : 1;
    return anim(cells[i].firstElementChild, [
      { transform: "translate(" + dx * direction * progress + "px," + dy * direction * progress + "px)" },
      { transform: "translate(" + dx * direction + "px," + dy * direction + "px)" }
    ], 150, "cubic-bezier(.2,.7,.3,1)");
  }));
}
function showCombo(label) {
  if (!motionEnabled()) return;
  const effect = document.createElement("span");
  effect.className = "combo";
  effect.textContent = label;
  $("effects").append(effect);
  effect.addEventListener("animationend", () => effect.remove(), { once: true });
}
function particles(indices, frozen) {
  if (!motionEnabled()) return;
  const layer = $("effects");
  const area = layer.getBoundingClientRect();
  const batch = document.createDocumentFragment();
  for (const index of indices) {
    const rect = cells[index].getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement("i");
      const angle = i * Math.PI / 3 + Math.random() * .5;
      const distance = 14 + Math.random() * 27;
      dot.className = "particle";
      dot.style.left = rect.left - area.left + rect.width / 2 + "px";
      dot.style.top = rect.top - area.top + rect.height / 2 + "px";
      dot.style.setProperty("--particle", frozen.has(index) ? "#b1eeff" : cast[board[index].type].color);
      dot.style.setProperty("--tx", Math.cos(angle) * distance + "px");
      dot.style.setProperty("--ty", Math.sin(angle) * distance + "px");
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
      batch.append(dot);
    }
  }
  layer.append(batch);
}
function powerEffect(at, power) {
  if (!motionEnabled()) return;
  const layer = $("effects");
  const area = layer.getBoundingClientRect();
  const rect = cells[at].getBoundingClientRect();
  const effect = document.createElement("div");
  effect.className = "power-effect effect-" + power;
  effect.style.setProperty("--effect-x", rect.left - area.left + rect.width / 2 + "px");
  effect.style.setProperty("--effect-y", rect.top - area.top + rect.height / 2 + "px");
  effect.style.setProperty("--effect-size", rect.width * 3.2 + "px");
  layer.append(effect);
  effect.addEventListener("animationend", () => effect.remove(), { once: true });
}
function fall() {
  const offsets = new Map();
  const pitch = cells[size].offsetTop - cells[0].offsetTop;
  for (let c = 0; c < size; c++) {
    let dest = size - 1;
    for (let r = size - 1; r >= 0; r--) {
      const tile = board[r * size + c];
      if (!tile) continue;
      const to = dest * size + c;
      board[to] = tile;
      if (dest !== r) offsets.set(to, (r - dest) * pitch);
      dest--;
    }
    const refill = dest + 1;
    for (let r = dest; r >= 0; r--) {
      const to = r * size + c;
      board[to] = newTile();
      offsets.set(to, -refill * pitch);
    }
  }
  renderBoard();
  return Promise.all([...offsets].map(([i, shift]) => anim(cells[i].firstElementChild,
    [{ transform: "translateY(" + shift + "px)" }, { transform: "translateY(0)" }], 230, "cubic-bezier(.25,.65,.4,1)")));
}
async function cascade(preferred = [], triggered = [], prismColors = new Map(), booster = "") {
  let runs = matches(board);
  let chain = 0;
  let last = "Nice match!";
  while (chain < maxCascade && (runs.length || triggered.length)) {
    chain++;
    const { clear, spawn, activations } = planClear(runs, preferred, triggered, prismColors);
    const removed = [...clear].filter(i => !spawn.has(i));
    const frozen = new Set([...clear].filter(i => ice[i] > 0));
    for (const i of frozen) ice[i]--;
    iceLeft -= frozen.size;
    bestChain = Math.max(bestChain, chain);
    if (booster !== "encore") encoreCharge = Math.min(maxCharge, encoreCharge + removed.length);
    const added = removed.length * 60 * chain + activations.length * 180 + spawn.size * 100 + frozen.size * 80;
    score += added;
    for (const i of removed) collected[board[i].type]++;
    if (chain > 1) last = "Chain ×" + chain + "!";
    else if (activations.length > 1) last = "Power combo!";
    else if (activations.length) last = powers[activations[0].power].name + " activated!";
    else if (spawn.size) last = powers[spawn.values().next().value.power].name + " created!";
    else if (booster === "encore") last = "Encore!";
    else if (frozen.size) last = "Frost cracked!";
    else if (booster === "flash") last = "Flash cleared a tile!";
    status(last + " +" + number(added), true);
    if (chain > 1 || activations.length || spawn.size || booster === "encore") showCombo(last);
    const root = [392, 440, 494, 523, 587][Math.min(chain - 1, 4)];
    tone([root, root * 1.25, root * 1.5]);
    particles(clear, frozen);
    for (const { at, power } of activations) powerEffect(at, power);
    renderHud();
    await Promise.all(removed.map(i => anim(cells[i].firstElementChild,
      [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.48)", opacity: 0 }], 130)));
    for (const i of removed) board[i] = null;
    for (const [i, tile] of spawn) board[i] = tile;
    await fall();
    preferred = [];
    triggered = [];
    runs = matches(board);
  }
  if (runs.length || !findSwap(board)) {
    board = remixBoard();
    renderBoard();
    status(runs.length ? "The board was remixed after the chain." : "No swaps available. The board was remixed.");
  }
  checkEnd();
}
function resetSelection() {
  selected = null;
  hinted = [];
  targeting = false;
}
function setBusy(value) {
  busy = value;
  boardEl.setAttribute("aria-busy", String(value));
  renderBoard();
  renderHud();
}
async function runTurn(action) {
  if (busy || ended) return;
  const before = snapshot();
  const previousRecord = records[stageIndex];
  cancelDrag();
  resetSelection();
  setBusy(true);
  try {
    await action();
    saveRun();
  } catch (error) {
    restoreRun(before);
    if (previousRecord) records[stageIndex] = previousRecord;
    else delete records[stageIndex];
    if (dialog.open && dialog.classList.contains("result")) dialog.close();
    $("effects").replaceChildren();
    status("The move was reset. Try again.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}
async function trySwap(a, b, progress = 0) {
  if (busy || ended || !neighbor(a, b)) return;
  await runTurn(async () => {
    await slide(a, b, progress);
    swap(board, a, b);
    renderBoard();
    const triggered = [a, b].filter(i => board[i].power);
    const prismColors = swapColors(a, b);
    if (!triggered.length && !matches(board).length) {
      tone([230, 180]);
      await slide(a, b);
      swap(board, a, b);
      status("That swap needs to make a match.");
      return;
    }
    moves--;
    renderHud();
    await cascade([b, a], triggered, prismColors);
  });
}
async function activate(index) {
  if (busy || ended) return;
  if (targeting) {
    const booster = targeting;
    await runTurn(async () => {
      if (booster === "encore") {
        encoreCharge = 0;
        powerEffect(index, "nova");
      } else charges.zap--;
      const indices = booster === "encore" ? nearby(index) : [index];
      await cascade([], indices, new Map(), booster);
    });
    return;
  }
  hinted = [];
  if (selected !== null && neighbor(selected, index)) {
    await trySwap(selected, index);
    return;
  }
  selected = selected === index ? null : index;
  renderBoard();
}
function openLevels() {
  const unlocked = unlockedStage();
  openDialog('<p class="eyebrow">Match Circuit</p><h2>Choose a stage</h2><div class="level-list">'
    + stages.map((stage, i) => {
      const result = records[i];
      const label = i === stageIndex && !ended ? "Resume" : result ? "✦".repeat(result.stars) + " · " + number(result.score) : i > unlocked ? "Locked" : "Play";
      return '<button class="level-item" data-stage="' + i + '"' + (i > unlocked ? " disabled" : "") + '><span>' + String(i + 1).padStart(2, "0")
        + '</span><strong>' + stage.name + '</strong><span>' + label + '</span></button>';
    }).join("") + '</div>');
}
function updateSound() {
  $("sound").setAttribute("aria-label", sound ? "Mute sound" : "Enable sound");
  $("sound").title = sound ? "Mute sound" : "Enable sound";
  $("soundLabel").textContent = sound ? "Sound on" : "Sound off";
  $("soundIcon").textContent = sound ? "♫" : "♪";
}
function updateMotion() {
  const enabled = motionEnabled();
  if (!enabled) cancelDrag();
  document.documentElement.dataset.motion = enabled ? "on" : "off";
  $("motion").setAttribute("aria-pressed", String(enabled));
  $("motion").title = enabled ? "Turn tile motion off" : "Turn tile motion on";
  $("motionLabel").textContent = enabled ? "Motion on" : "Motion off";
}
function updateVisibility() {
  document.documentElement.dataset.background = String(document.hidden);
  if (document.hidden) cancelDrag();
}
function dragTarget(event) {
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const distance = horizontal ? dx : dy;
  const start = pointer.index;
  const r = row(start) + (horizontal ? 0 : Math.sign(distance));
  const c = col(start) + (horizontal ? Math.sign(distance) : 0);
  if (Math.abs(distance) < 6 || r < 0 || r >= size || c < 0 || c >= size) return null;
  const index = r * size + c;
  const first = cells[start].getBoundingClientRect();
  const second = cells[index].getBoundingClientRect();
  const x = second.left - first.left;
  const y = second.top - first.top;
  const fraction = Math.min(.82, Math.abs(distance) / Math.hypot(x, y));
  return { index, x, y, fraction, distance };
}
function resetDrag() {
  if (!pointer) return;
  const indices = [pointer.index, pointer.target].filter(i => i !== undefined);
  for (const i of indices) {
    cells[i].classList.remove("drag-source", "drag-target");
    cells[i].firstElementChild.style.removeProperty("transform");
  }
  delete pointer.target;
}
function cancelDrag() {
  resetDrag();
  pointer = null;
}
function showTarget(index) {
  const area = targeting === "encore" && index !== null ? nearby(index) : [];
  cells.forEach((cell, i) => cell.classList.toggle("blast-preview", area.includes(i)));
}
boardEl.addEventListener("focusin", event => {
  const tile = event.target.closest(".tile");
  if (!tile) return;
  cells[focusIndex].tabIndex = -1;
  focusIndex = Number(tile.dataset.index);
  tile.tabIndex = 0;
  if (targeting === "encore") showTarget(focusIndex);
});
boardEl.addEventListener("keydown", event => {
  const offsets = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  const diff = offsets[event.key];
  if (event.key === "Escape" && !busy) {
    if (targeting || hinted.length || selected !== null) status("Drag or tap adjacent portraits to swap.");
    resetSelection();
    renderBoard();
    renderHud();
    return;
  }
  if (!diff || busy || ended) return;
  event.preventDefault();
  const r = row(focusIndex) + diff[0];
  const c = col(focusIndex) + diff[1];
  if (r >= 0 && r < size && c >= 0 && c < size) cells[r * size + c].focus();
});
boardEl.addEventListener("pointerdown", event => {
  const tile = event.target.closest(".tile");
  if (!tile || busy || ended || !event.isPrimary || event.button !== 0) return;
  skipPointerClick = false;
  if (targeting) return;
  cancelDrag();
  pointer = { index: Number(tile.dataset.index), x: event.clientX, y: event.clientY, id: event.pointerId };
});
boardEl.addEventListener("pointerover", event => {
  const tile = event.target.closest(".tile");
  if (targeting === "encore" && tile) showTarget(Number(tile.dataset.index));
});
boardEl.addEventListener("pointerleave", () => showTarget(null));
window.addEventListener("pointermove", event => {
  if (pointer?.id !== event.pointerId || busy || !motionEnabled()) return;
  const target = dragTarget(event);
  if (target?.index !== pointer.target) resetDrag();
  if (!target) return;
  pointer.target = target.index;
  const start = cells[pointer.index];
  const end = cells[target.index];
  start.classList.add("drag-source");
  end.classList.add("drag-target");
  start.firstElementChild.style.transform = "translate(" + target.x * target.fraction + "px," + target.y * target.fraction + "px)";
  end.firstElementChild.style.transform = "translate(" + -target.x * target.fraction + "px," + -target.y * target.fraction + "px)";
});
window.addEventListener("pointercancel", event => { if (pointer?.id === event.pointerId) cancelDrag(); });
window.addEventListener("blur", cancelDrag);
window.addEventListener("pointerup", event => {
  if (pointer?.id !== event.pointerId) return;
  const { index } = pointer;
  const target = dragTarget(event);
  skipPointerClick = Math.max(Math.abs(event.clientX - pointer.x), Math.abs(event.clientY - pointer.y)) >= 14;
  cancelDrag();
  if (target && skipPointerClick) void trySwap(index, target.index, target.fraction);
});
boardEl.addEventListener("click", event => {
  const tile = event.target.closest(".tile");
  if (event.detail && skipPointerClick) return;
  if (tile) void activate(Number(tile.dataset.index));
});
$("hint").onclick = () => {
  cancelDrag();
  resetSelection();
  hinted = findSwap(board, true) || [];
  status("Swap the two highlighted tiles.");
  renderBoard();
  renderHud();
};
$("shuffle").onclick = () => runTurn(async () => {
  charges.shuffle--;
  tone([440, 554, 740]);
  await anim(boardEl, [{ opacity: 1 }, { opacity: .25 }], 145);
  board = remixBoard();
  renderBoard();
  renderHud();
  await anim(boardEl, [{ opacity: .25 }, { opacity: 1 }], 175);
  status("Board remixed. No move spent.");
});
function toggleTarget(booster) {
  const next = targeting === booster ? false : booster;
  cancelDrag();
  resetSelection();
  targeting = next;
  const prompt = booster === "encore" ? "Pick a tile to center the Encore blast." : "Pick a tile to clear with Flash.";
  status(targeting ? prompt : "Choose two adjacent portraits to swap.");
  renderBoard();
  renderHud();
}
$("zap").onclick = () => toggleTarget("flash");
$("encore").onclick = () => toggleTarget("encore");
$("sound").onclick = () => {
  sound = !sound;
  updateSound();
  persist();
  tone([523, 659]);
};
$("motion").onclick = () => {
  motionPreference = !motionEnabled();
  updateMotion();
  persist();
};
reducedMotion.addEventListener?.("change", updateMotion);
document.addEventListener("visibilitychange", updateVisibility);
$("help").onclick = () => openDialog('<p class="eyebrow">Match Circuit</p><h2>How to play</h2><div class="guide">'
  + '<section><h3>Make a match</h3><p>Drag a portrait or tap two neighbors to swap. Line up three or more of the same portrait. A valid swap uses one move.</p></section>'
  + '<section><h3>Build power tiles</h3><p>Match four in a line for a <b>Starburst</b> to ' + powers.burst.action + '. Make an L or T for a <b>Nova</b> to ' + powers.nova.action + '. Match five in a line for a <b>Prism</b> to ' + powers.prism.action + '. Swap a power tile with a neighbor to activate it.</p></section>'
  + '<section><h3>Clear frost and charge Encore</h3><p>Match over frost or hit it with a blast to remove a layer. Clear portraits to charge Encore, then choose where to fire it.</p></section>'
  + '<section><h3>Keyboard</h3><p>Use the arrow keys to move, <kbd>Enter</kbd> or <kbd>Space</kbd> to pick a tile, and <kbd>Esc</kbd> to cancel.</p></section></div>');
$("levelsBtn").onclick = openLevels;
$("restart").onclick = () => {
  if (ended) {
    showOutcome(goalsComplete(), earnedStars());
    return;
  }
  if (!hasActiveRun()) {
    start(stageIndex);
    return;
  }
  openDialog('<p class="eyebrow">' + stages[stageIndex].name + '</p><h2>Restart this stage?</h2><p>Your current run will start over.</p><div class="dialog-actions"><button class="primary" data-retry>Restart stage</button><button class="nav-btn" data-cancel>Keep playing</button></div>');
};
$("closeDialog").onclick = () => dialog.close();
dialog.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-retry")) start(stageIndex);
  if (button.hasAttribute("data-next")) start(stageIndex + 1);
  if (button.hasAttribute("data-levels")) openLevels();
  if (button.hasAttribute("data-cancel")) dialog.close();
  if (button.hasAttribute("data-stage")) selectStage(Number(button.dataset.stage));
  if (button.hasAttribute("data-switch")) {
    const index = Number(button.dataset.switch);
    if (whole(index, 0, unlockedStage())) start(index);
  }
});
$("cast").replaceChildren(...cast.map((member, i) => {
  const card = document.createElement("button");
  card.className = "cast-card";
  card.title = member.name;
  card.setAttribute("aria-label", "View " + member.name);
  card.style.setProperty("--tile-edge", member.color);
  card.innerHTML = '<img src="' + sprite(i) + '" alt="" loading="lazy">';
  card.onclick = () => openDialog('<p class="eyebrow">The cast</p><h2>' + member.name + '</h2><img class="dialog-portrait" style="--tile-edge:' + member.color + '" src="' + sprite(i) + '" alt="' + member.name + '">');
  return card;
}));
function enterGame() {
  const gate = $("entryGate");
  if (gate.hidden) return;
  gate.hidden = true;
  $("gameHeader").hidden = false;
  $("main").hidden = false;
  updateSound();
  updateMotion();
  updateVisibility();
  if (validRun(saved.run)) {
    checkpoint = saved.run;
    restoreRun(checkpoint);
    resetSelection();
    renderBoard();
    renderHud();
    if (ended) {
      const won = goalsComplete();
      status(won ? "Stage cleared!" : "Out of moves.");
      showOutcome(won, earnedStars());
    } else {
      status("Run resumed. Drag or tap adjacent portraits to swap.");
      cells[0].focus({ preventScroll: true });
    }
  } else start(unlockedStage());
}
$("entryYes").onclick = enterGame;
$("entryNo").onclick = () => {
  $("entryFeedback").textContent = "Wrong answer try again";
};
