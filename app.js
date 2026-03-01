import {
  ensureDefaults,
  getCategories,
  getEntry,
  upsertEntry,
  deleteEntry,
  isoToday,
  formatDE,
  getMeds,
  addMed,
  deleteMedFromList
} from "./db.js";

const grid = document.getElementById("symptomGrid");
const dateInput = document.getElementById("date");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const subtitle = document.getElementById("subtitle");

const sportChk = document.getElementById("sportChk");
const alcoholChk = document.getElementById("alcoholChk");

const medsBox = document.getElementById("medsBox");
const toggleMedsEditBtn = document.getElementById("toggleMedsEdit");
const medsEdit = document.getElementById("medsEdit");
const newMedInp = document.getElementById("newMed");
const addMedBtn = document.getElementById("addMedBtn");

let categories = [];
let currentScores = {};        // {catId: 0..3}
let currentSport = false;      // boolean
let currentAlcohol = false;    // boolean
let currentMeds = [];          // array of med names
let medsList = [];             // array of med names
let medsEditMode = false;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function ensureAllScoresPresent() {
  for (const c of categories) {
    if (currentScores[c.id] == null) currentScores[c.id] = 0;
  }
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

function renderMedsBox() {
  medsBox.innerHTML = "";
  if (!medsList.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Keine Medikamente in der Liste. Füge welche hinzu.";
    medsBox.appendChild(empty);
    return;
  }

  // Alphabetisch
  const list = medsList.slice().sort((a, b) => a.localeCompare(b, "de"));

  for (const name of list) {
    const item = document.createElement("div");
    item.className = "medItem";

    const label = document.createElement("label");
    label.className = "medCheck";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = currentMeds.includes(name);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!currentMeds.includes(name)) currentMeds.push(name);
      } else {
        currentMeds = currentMeds.filter(x => x !== name);
      }
      setStatus("");
    });

    const text = document.createElement("span");
    text.textContent = name;

    label.append(cb, text);

    item.appendChild(label);

    if (medsEditMode) {
      const del = document.createElement("button");
      del.className = "xBtn";
      del.type = "button";
      del.textContent = "×";
      del.title = "Löschen";
      del.addEventListener("click", async () => {
        if (!confirm(`„${name}“ aus der Medikamentenliste löschen?`)) return;
        await deleteMedFromList(name);
        // falls aktuell ausgewählt, entfernen
        currentMeds = currentMeds.filter(x => x !== name);
        medsList = await getMeds();
        renderMedsBox();
        setStatus("Medikament gelöscht (Liste).");
      });
      item.appendChild(del);
    }

    medsBox.appendChild(item);
  }
}

async function loadForDate(isoDate) {
  setStatus("");
  const entry = await getEntry(isoDate);

  currentScores = entry?.scores ? { ...entry.scores } : {};
  ensureAllScoresPresent();

  currentSport = Boolean(entry?.sport);
  currentAlcohol = Boolean(entry?.alcohol);
  currentMeds = Array.isArray(entry?.meds) ? entry.meds.slice() : [];

  sportChk.checked = currentSport;
  alcoholChk.checked = currentAlcohol;

  renderGrid();
  medsList = await getMeds();
  renderMedsBox();

  subtitle.textContent = `Eintrag für ${formatDE(isoDate)}`;
}

async function save() {
  const isoDate = dateInput.value;
  ensureAllScoresPresent();

  currentSport = sportChk.checked;
  currentAlcohol = alcoholChk.checked;

  // nur meds, die in der Liste existieren (cleanup)
  const set = new Set((await getMeds()).map(x => x));
  const medsClean = currentMeds.filter(m => set.has(m));

  await upsertEntry(isoDate, {
    scores: currentScores,
    sport: currentSport,
    alcohol: currentAlcohol,
    meds: medsClean
  });

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

  currentScores = {};
  ensureAllScoresPresent();
  currentSport = false;
  currentAlcohol = false;
  currentMeds = [];
  sportChk.checked = false;
  alcoholChk.checked = false;

  renderGrid();
  renderMedsBox();
  setStatus("Eintrag gelöscht.");
}

function resetToZero() {
  for (const c of categories) currentScores[c.id] = 0;
  renderGrid();
  setStatus("Auf 0 gesetzt (noch nicht gespeichert).");
}

async function toggleMedsEdit() {
  medsEditMode = !medsEditMode;
  medsEdit.classList.toggle("hidden", !medsEditMode);
  toggleMedsEditBtn.textContent = medsEditMode ? "Bearbeitung schließen" : "Liste bearbeiten";
  renderMedsBox();
}

async function addMedFromUI() {
  const name = (newMedInp.value || "").trim();
  if (!name) return;

  await addMed(name);
  newMedInp.value = "";
  medsList = await getMeds();
  renderMedsBox();
  setStatus("Medikament hinzugefügt (Liste).");
}

/* -------- NEW: always keep categories sorted alphabetically -------- */
function sortCategoriesInPlace() {
  categories = categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

async function init() {
  // Offline caching (optional)
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  await ensureDefaults();

  // Load + filter + SORT (fix)
  categories = (await getCategories()).filter(c => !c.archived);
  sortCategoriesInPlace();

  const today = isoToday();
  dateInput.value = today;
  dateInput.addEventListener("change", () => loadForDate(dateInput.value));

  saveBtn.addEventListener("click", save);
  deleteBtn.addEventListener("click", removeEntry);
  resetBtn.addEventListener("click", resetToZero);

  toggleMedsEditBtn.addEventListener("click", toggleMedsEdit);
  addMedBtn.addEventListener("click", addMedFromUI);
  newMedInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMedFromUI();
  });

  await loadForDate(today);
}

init();