import {
  ensureDefaults,
  getCategories,
  getEntry,
  upsertEntry,
  deleteEntry,
  isoToday,
  formatDE
} from "./db.js";

const grid = document.getElementById("symptomGrid");
const dateInput = document.getElementById("date");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const subtitle = document.getElementById("subtitle");

let categories = [];
let currentScores = {}; // {catId: 0..3}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function buildRow(cat) {
  const wrap = document.createElement("div");
  wrap.className = "sym";

  const name = document.createElement("div");
  name.className = "symName";
  name.textContent = cat.name;

  const ctrls = document.createElement("div");
  ctrls.className = "symCtrls";

  const minus = document.createElement("button");
  minus.className = "iconBtn";
  minus.type = "button";
  minus.textContent = "−";
  minus.addEventListener("click", () => {
    currentScores[cat.id] = clamp((currentScores[cat.id] ?? 0) - 1, 0, 3);
    score.textContent = String(currentScores[cat.id]);
    setStatus("");
  });

  const score = document.createElement("div");
  score.className = "score";
  score.textContent = String(currentScores[cat.id] ?? 0);

  const plus = document.createElement("button");
  plus.className = "iconBtn";
  plus.type = "button";
  plus.textContent = "+";
  plus.addEventListener("click", () => {
    currentScores[cat.id] = clamp((currentScores[cat.id] ?? 0) + 1, 0, 3);
    score.textContent = String(currentScores[cat.id]);
    setStatus("");
  });

  ctrls.append(minus, score, plus);
  wrap.append(name, ctrls);
  return wrap;
}

function renderGrid() {
  grid.innerHTML = "";
  for (const c of categories) grid.appendChild(buildRow(c));
}

function ensureAllScoresPresent() {
  for (const c of categories) {
    if (currentScores[c.id] == null) currentScores[c.id] = 0;
  }
}

async function loadForDate(isoDate) {
  setStatus("");
  const entry = await getEntry(isoDate);
  currentScores = entry?.scores ? { ...entry.scores } : {};
  ensureAllScoresPresent();
  renderGrid();
  subtitle.textContent = `Eintrag für ${formatDE(isoDate)}`;
}

async function save() {
  const isoDate = dateInput.value;
  ensureAllScoresPresent();
  await upsertEntry(isoDate, currentScores);
  setStatus("Gespeichert.");
}

async function removeEntry() {
  const isoDate = dateInput.value;
  if (!isoDate) return;

  const entry = await getEntry(isoDate);
  if (!entry) {
    setStatus("Kein Eintrag vorhanden (nichts zu löschen).");
    return;
  }

  if (!confirm(`Eintrag für ${formatDE(isoDate)} wirklich löschen?`)) return;

  await deleteEntry(isoDate);

  // UI nach dem Löschen zurücksetzen
  currentScores = {};
  ensureAllScoresPresent();
  renderGrid();
  setStatus("Eintrag gelöscht.");
}

function resetToZero() {
  for (const c of categories) currentScores[c.id] = 0;
  renderGrid();
  setStatus("Auf 0 gesetzt (noch nicht gespeichert).");
}

async function init() {
  // Offline caching (optional)
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("/sw.js"); } catch {}
  }

  await ensureDefaults();
  categories = await getCategories();

  const today = isoToday();
  dateInput.value = today;
  dateInput.addEventListener("change", () => loadForDate(dateInput.value));

  saveBtn.addEventListener("click", save);
  deleteBtn.addEventListener("click", removeEntry);
  resetBtn.addEventListener("click", resetToZero);

  await loadForDate(today);
}

init();