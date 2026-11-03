// Badminton Player Selector - web version
// Picks doubles games that prioritise: new partners, fair court time,
// balanced teams (Elo ratings) and varied opponents. Supports 1 or 2 courts.

const START_RATING = 1000;
const K_FACTOR = 32;
const MAX_COURTS = 2;
const STORAGE_KEY = "badmintonSelectorState.v1";

// ---------------- State ----------------
let state = loadState() || freshState();

function freshState() {
  return {
    players: [],
    numCourts: 1,
    courts: Array.from({ length: MAX_COURTS }, emptyCourt),
    partnerCount: {},
    meetCount: {},
    gamesPlayed: {},
    rating: {},
    wins: {},
    gamesNo: 0,
  };
}
function emptyCourt() { return { game: null, pending: false, info: "" }; }

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.players)) return s;
  } catch (e) {}
  return null;
}

// ---------------- Helpers ----------------
const $ = (id) => document.getElementById(id);
const pairKey = (a, b) => [a, b].sort().join("\u0001");
const getRating = (p) => state.rating[p] ?? START_RATING;
const teamRating = (t) => t.reduce((s, p) => s + getRating(p), 0) / t.length;
const winChance = (t1, t2) => 1 / (1 + Math.pow(10, (teamRating(t2) - teamRating(t1)) / 400));
const activeCourts = () => state.courts.slice(0, state.numCourts);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function combinations(arr, k) {
  const out = [];
  (function rec(start, combo) {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1, combo); combo.pop(); }
  })(0, []);
  return out;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function partnershipsDone() {
  const pairs = combinations(state.players, 2);
  const done = pairs.filter(([a, b]) => (state.partnerCount[pairKey(a, b)] || 0) > 0).length;
  return [done, pairs.length];
}

function playersOnCourt(skipIdx = -1) {
  const busy = new Set();
  activeCourts().forEach((c, i) => {
    if (i === skipIdx || !c.pending) return;
    [...c.game[0], ...c.game[1]].forEach((p) => busy.add(p));
  });
  return busy;
}

// ---------------- Game selection ----------------
function chooseGame(exclude = new Set()) {
  let players = state.players.filter((p) => !exclude.has(p));
  if (players.length < 4) return null;
  if (players.length > 12) {
    shuffle(players);
    players.sort((a, b) => (state.gamesPlayed[a] || 0) - (state.gamesPlayed[b] || 0));
    players = players.slice(0, 12);
  }
  let best = null, bestScore = Infinity;
  for (const [a, b, c, d] of combinations(players, 4)) {
    const games = [a, b, c, d].reduce((s, p) => s + (state.gamesPlayed[p] || 0), 0);
    for (const [t1, t2] of [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]]) {
      const partnerRepeats = (state.partnerCount[pairKey(...t1)] || 0) + (state.partnerCount[pairKey(...t2)] || 0);
      let oppRepeats = 0;
      for (const x of t1) for (const y of t2) oppRepeats += state.meetCount[pairKey(x, y)] || 0;
      const skillGap = Math.abs(teamRating(t1) - teamRating(t2));
      const score = partnerRepeats * 1000   // 1. new partners
                  + games * 50              // 2. fair court time
                  + skillGap * 1.5          // 3. balanced teams
                  + oppRepeats * 5          // 4. varied opponents
                  + Math.random();
      if (score < bestScore) { bestScore = score; best = [t1, t2]; }
    }
  }
  return best;
}

function recordGame(t1, t2) {
  for (const t of [t1, t2]) { const k = pairKey(...t); state.partnerCount[k] = (state.partnerCount[k] || 0) + 1; }
  for (const x of t1) for (const y of t2) { const k = pairKey(x, y); state.meetCount[k] = (state.meetCount[k] || 0) + 1; }
  for (const p of [...t1, ...t2]) state.gamesPlayed[p] = (state.gamesPlayed[p] || 0) + 1;
  state.gamesNo++;
}

function startGame(idx, game) {
  const [t1, t2] = game;
  recordGame(t1, t2);
  const c = state.courts[idx];
  c.game = game;
  c.pending = true;
  c.info = `Team A ${Math.round(teamRating(t1))}  vs  Team B ${Math.round(teamRating(t2))}  ·  ` +
           `Team A win chance ${Math.round(winChance(t1, t2) * 100)}%`;
}

function afterSelection() {
  const [done, total] = partnershipsDone();
  if (total && done === total) {
    alert("Everyone has now partnered everyone else at least once!\n\n" +
          "Partnership history will reset for a fresh rotation.\nRatings and wins are kept.");
    state.partnerCount = {};
    state.meetCount = {};
  }
  render();
}

function selectAllCourts() {
  const needed = 4 * state.numCourts;
  if (state.players.length < needed) {
    alert(`You need at least ${needed} players for ${state.numCourts} court${state.numCourts > 1 ? "s" : ""}.`);
    return;
  }
  if (activeCourts().some((c) => c.pending) &&
      !confirm("At least one game has no result recorded.\n\nSkip it and pick new games?")) return;

  activeCourts().forEach((c) => (c.pending = false));
  const picked = new Set();
  for (let i = 0; i < state.numCourts; i++) {
    const game = chooseGame(picked);
    if (!game) break;
    [...game[0], ...game[1]].forEach((p) => picked.add(p));
    startGame(i, game);
  }
  afterSelection();
}

function selectForCourt(idx) {
  const c = state.courts[idx];
  if (c.pending && !confirm(`Court ${idx + 1} has no result recorded.\n\nSkip it and pick a new game?`)) return;
  const game = chooseGame(playersOnCourt(idx));
  if (!game) {
    alert(`There aren't 4 free players for Court ${idx + 1}.\n\nRecord the result on the other court first, or add more players.`);
    return;
  }
  c.pending = false;
  startGame(idx, game);
  afterSelection();
}

function recordResult(idx, winner) {
  const c = state.courts[idx];
  if (!c.pending) return;
  const [t1, t2] = c.game;
  const change = K_FACTOR * ((winner === 0 ? 1 : 0) - winChance(t1, t2));
  t1.forEach((p) => (state.rating[p] = getRating(p) + change));
  t2.forEach((p) => (state.rating[p] = getRating(p) - change));
  const winners = winner === 0 ? t1 : t2;
  winners.forEach((p) => (state.wins[p] = (state.wins[p] || 0) + 1));
  c.pending = false;
  c.info = `Result saved: ${winners.join(" & ")} won (ratings moved by ${Math.abs(Math.round(change))})`;
  render();
}

// ---------------- Players ----------------
function addPlayer() {
  const input = $("nameInput");
  const name = input.value.trim();
  if (!name) { alert("Please enter a player name."); return; }
  if (state.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
    alert("That player is already in the list."); return;
  }
  state.players.push(name);
  input.value = "";
  input.focus();
  render();
}

function removePlayer(name) {
  state.players = state.players.filter((p) => p !== name);
  for (const d of [state.gamesPlayed, state.rating, state.wins]) delete d[name];
  for (const d of [state.partnerCount, state.meetCount])
    for (const k of Object.keys(d)) if (k.split("\u0001").includes(name)) delete d[k];
  state.courts.forEach((c, i) => {
    if (c.game && [...c.game[0], ...c.game[1]].includes(name)) state.courts[i] = emptyCourt();
  });
  render();
}

// ---------------- Courts / reset ----------------
function setCourtMode(n) {
  if (n === state.numCourts) return;
  if (n < state.numCourts) {
    const dropped = state.courts.slice(n, state.numCourts);
    if (dropped.some((c) => c.pending) &&
        !confirm("Court 2 has a game with no result recorded.\n\nSwitch to 1 court and discard it?")) return;
    for (let i = n; i < state.numCourts; i++) state.courts[i] = emptyCourt();
  }
  state.numCourts = n;
  render();
}

function restartSelection() {
  state.courts = Array.from({ length: MAX_COURTS }, emptyCourt);
  render();
}

function resetHistory() {
  if (!confirm("Clear all pairing history, wins and ratings?")) return;
  Object.assign(state, { partnerCount: {}, meetCount: {}, gamesPlayed: {}, rating: {}, wins: {}, gamesNo: 0 });
  restartSelection();
}

// ---------------- Rendering ----------------
function boxTitle(i) {
  const team = i < 2 ? "TEAM A" : "TEAM B";
  return state.numCourts === 1 ? `${team} - PLAYER ${(i % 2) + 1}` : `${team} - P${(i % 2) + 1}`;
}

function render() {
  const n = state.players.length;
  $("playerCount").textContent = `${n} player${n === 1 ? "" : "s"}`;

  // Player list
  const busy = playersOnCourt();
  $("playerList").innerHTML = n === 0
    ? `<div class="empty">No players added yet.</div>`
    : state.players.map((p, i) => `
        <div class="prow${busy.has(p) ? " oncourt" : ""}">
          <span>${esc(p)} <small>${state.wins[p] || 0}W/${state.gamesPlayed[p] || 0}G · ${Math.round(getRating(p))}</small></span>
          <button data-remove="${i}">Remove</button>
        </div>`).join("");

  // Toggle + main buttons
  document.querySelectorAll(".toggle button").forEach((b) =>
    b.classList.toggle("on", Number(b.dataset.courts) === state.numCourts));
  const needed = 4 * state.numCourts;
  $("selectBtn").textContent = `Select ${needed} Players`;
  $("selectBtn").disabled = n < needed;

  const [done, total] = partnershipsDone();
  $("progress").textContent = `Games played: ${state.gamesNo}  ·  Partnerships covered: ${done} of ${total}`;

  // Courts
  const courtsEl = $("courts");
  courtsEl.className = state.numCourts === 1 ? "one" : "two";
  courtsEl.innerHTML = activeCourts().map((c, idx) => {
    const players = c.game ? [...c.game[0], ...c.game[1]] : [];
    const boxes = [0, 1, 2, 3].map((i) => {
      const cls = players.length ? (i < 2 ? " a" : " b") : "";
      const name = players.length ? esc(players[i]) : "Waiting for selection...";
      return `<div class="box${cls}"><div class="t">${boxTitle(i)}</div><div class="n">${name}</div></div>`;
    }).join("");
    const nextBtn = state.numCourts > 1
      ? `<button class="btn teal" data-next="${idx}" ${n < 4 ? "disabled" : ""}>Next Game</button>` : "";
    return `
      <div class="court">
        <div class="court-head"><h3>Court ${idx + 1}</h3>${nextBtn}</div>
        <div class="info">${esc(c.info || "")}</div>
        <div class="boxes">${boxes}</div>
        <div class="results">
          <button class="btn green" data-win="${idx},0" ${c.pending ? "" : "disabled"}>Team A Won</button>
          <button class="btn blue"  data-win="${idx},1" ${c.pending ? "" : "disabled"}>Team B Won</button>
        </div>
      </div>`;
  }).join("");

  saveState();
}

// ---------------- Events ----------------
$("addBtn").addEventListener("click", addPlayer);
$("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addPlayer(); });
$("selectBtn").addEventListener("click", selectAllCourts);
$("restartBtn").addEventListener("click", restartSelection);
$("resetBtn").addEventListener("click", resetHistory);
document.querySelectorAll(".toggle button").forEach((b) =>
  b.addEventListener("click", () => setCourtMode(Number(b.dataset.courts))));

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.remove !== undefined) removePlayer(state.players[Number(t.dataset.remove)]);
  else if (t.dataset.next !== undefined) selectForCourt(Number(t.dataset.next));
  else if (t.dataset.win !== undefined) { const [i, w] = t.dataset.win.split(",").map(Number); recordResult(i, w); }
});

render();
$("nameInput").focus();
