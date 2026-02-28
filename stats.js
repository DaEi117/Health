import {
  ensureDefaults, getCategories, getEntriesInRange,
  isoToday, exportAll, importAll
} from "./db.js";

/* -------------------- DOM: Chart 1 -------------------- */
const categorySel = document.getElementById("category");
const modeSel = document.getElementById("mode");
const chartTypeSel = document.getElementById("chartType");
const fromInp = document.getElementById("from");
const toInp = document.getElementById("to");
const presetSel = document.getElementById("preset");
const ma7Chk = document.getElementById("ma7");

const kpisEl = document.getElementById("kpis");
const chartEl = document.getElementById("chart");
const chartTitle = document.getElementById("chartTitle");

/* -------------------- DOM: Chart 2 -------------------- */
const catFromInp = document.getElementById("catFrom");
const catToInp = document.getElementById("catTo");
const catPresetSel = document.getElementById("catPreset");
const catChartEl = document.getElementById("catChart");
const catChartTitle = document.getElementById("catChartTitle");

/* -------------------- Heatmap + Export -------------------- */
const heatEl = document.getElementById("heatmap");
const exportJsonBtn = document.getElementById("exportJson");
const exportWideBtn = document.getElementById("exportCsvWide");
const exportLongBtn = document.getElementById("exportCsvLong");
const importInp = document.getElementById("importJson");
const exportStatus = document.getElementById("exportStatus");

let categories = [];

/* -------------------- Helpers: Formatting -------------------- */
function formatDM(isoDate){
  const [, m, d] = isoDate.split("-");
  return `${d}.${m}`; // TT.MM
}
function formatDMY(isoDate){
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/* -------------------- Helpers: Dates -------------------- */
function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setRangePreset(days, fromEl, toEl) {
  const to = isoToday();
  const from = daysAgoIso(days - 1);
  fromEl.value = from;
  toEl.value = to;
}

function enumerateDays(fromIso, toIso) {
  const out = [];
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  let cur = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);

  while (cur <= end) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/* -------------------- Helpers: Math -------------------- */
function movingAverage(values, window = 7) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    let s = 0, c = 0;
    for (let j = i - window + 1; j <= i; j++) {
      if (j < 0) continue;
      const v = values[j];
      if (v == null) continue;
      s += v; c++;
    }
    out.push(c ? (s / c) : null);
  }
  return out;
}
function sum(arr) { return arr.reduce((a, b) => a + (b ?? 0), 0); }
function min(arr) { return Math.min(...arr.filter(v => v != null)); }
function max(arr) { return Math.max(...arr.filter(v => v != null)); }

/* -------------------- KPI -------------------- */
function renderKpis({ total, avg, minV, maxV, daysCount, filledDays }) {
  kpisEl.innerHTML = "";
  const items = [
    ["Summe (Zeitraum)", total],
    ["Ø pro Tag", avg.toFixed(2)],
    ["Min", isFinite(minV) ? minV : "—"],
    ["Max", isFinite(maxV) ? maxV : "—"],
    ["Tage (gesamt)", daysCount],
    ["Tage (mit Eintrag)", filledDays],
  ];
  for (const [k, v] of items) {
    const d = document.createElement("div");
    d.className = "kpi";
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
    kpisEl.appendChild(d);
  }
}

/* -------------------- SVG Chart 1 (Zeitverlauf) -------------------- */
function svgChartTime(labels, seriesA, seriesB, { height = 280, type = "line", yLabel = "Score" } = {}) {
  const w = 900;
  const h = height;

  // weniger Leerlauf
  const padL = 60;
  const padR = 16;
  const padT = 10;
  const padB = 76;

  const allVals = [...seriesA, ...(seriesB || [])].filter(v => v != null);
  const vmax = allVals.length ? Math.max(...allVals) : 1;

  const yMin = 0;
  const yMax = Math.max(vmax, 3);
  const ySpan = (yMax - yMin) || 1;

  const x = (i) => padL + (i * (w - padL - padR) / Math.max(1, labels.length - 1));
  const y = (v) => {
    if (v == null) return null;
    const t = (v - yMin) / ySpan;
    return (h - padB) - t * (h - padT - padB);
  };

  const ticksCount = 4;
  let grid = "";
  let yTicks = "";
  for (let i = 0; i <= ticksCount; i++) {
    const val = yMin + (i * ySpan / ticksCount);
    const yy = y(val);
    grid += `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="#e5e7eb" stroke-width="1" />`;
    yTicks += `<text x="${padL - 8}" y="${yy + 4}" font-size="11" fill="#475569" text-anchor="end">${Number.isInteger(val) ? val : val.toFixed(1)}</text>`;
  }

  const axes = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#cbd5e1" stroke-width="1.2" />
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#cbd5e1" stroke-width="1.2" />
  `;

  const yAxisLabel = `
    <text x="18" y="${(padT + (h - padB)) / 2}" font-size="12" fill="#475569"
      transform="rotate(-90 18 ${(padT + (h - padB)) / 2})">${yLabel}</text>
  `;

  // X Labels TT.MM (kompakt)
  let xLabels = "";
  const xBaseY = h - padB + 18;
  for (let i = 0; i < labels.length; i++) {
    const xx = x(i);
    const lbl = formatDM(labels[i]);
    xLabels += `
      <text x="${xx}" y="${xBaseY}" font-size="10" fill="#475569"
        text-anchor="end"
        transform="rotate(-45 ${xx} ${xBaseY})">${lbl}</text>
    `;
  }

  const pathFrom = (series) => {
    let d = "";
    for (let i = 0; i < series.length; i++) {
      const yy = y(series[i]);
      if (yy == null) continue;
      const xx = x(i);
      d += d ? ` L ${xx} ${yy}` : `M ${xx} ${yy}`;
    }
    return d || "";
  };

  const bars = (series) => {
    if (labels.length === 0) return "";
    const chartW = (w - padL - padR);
    const step = chartW / Math.max(1, labels.length);
    const bw = Math.max(2, Math.min(18, step * 0.65));
    let out = "";
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v == null) continue;
      const xx = padL + (i + 0.5) * step - bw / 2;
      const y0 = y(0);
      const yy = y(v);
      const bh = Math.max(1, y0 - yy);
      out += `<rect x="${xx}" y="${yy}" width="${bw}" height="${bh}" rx="3" ry="3" fill="#0f172a" opacity="0.9" />`;
    }
    return out;
  };

  const aPath = pathFrom(seriesA);
  const bPath = seriesB ? pathFrom(seriesB) : "";

  let seriesDraw = "";
  if (type === "bar") {
    seriesDraw += bars(seriesA);
    if (seriesB && bPath) {
      seriesDraw += `<path d="${bPath}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="5 4" />`;
    }
  } else {
    if (aPath) seriesDraw += `<path d="${aPath}" fill="none" stroke="#0f172a" stroke-width="2.5" />`;
    if (seriesB && bPath) seriesDraw += `<path d="${bPath}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="5 4" />`;
  }

  const legend = seriesB
    ? `<div class="small">${type === "bar" ? "Balken" : "Linie"}: Wert · gestrichelt: 7-Tage-Mittel</div>`
    : `<div class="small">${type === "bar" ? "Balken" : "Linie"}: Wert</div>`;

  return `
    <div style="overflow:auto; -webkit-overflow-scrolling: touch;">
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Zeitverlauf">
        ${grid}
        ${axes}
        ${yAxisLabel}
        ${yTicks}
        ${seriesDraw}
        ${xLabels}
      </svg>
      ${legend}
    </div>
  `;
}

/* -------------------- SVG Chart 2 (Kategorie-Summen) -------------------- */
function svgCategoryTotalsBar(names, totals, { height = 290, yLabel = "Score (Summe)" } = {}) {
  const w = 900;
  const h = height;

  const padL = 70;
  const padR = 16;
  const padT = 10;
  const padB = 120;

  const vmax = totals.length ? Math.max(...totals) : 1;
  const yMin = 0;
  const yMax = Math.max(vmax, 3);
  const ySpan = (yMax - yMin) || 1;

  const chartW = (w - padL - padR);
  const step = chartW / Math.max(1, totals.length);
  const bw = Math.max(4, Math.min(26, step * 0.7));

  const xCenter = (i) => padL + (i + 0.5) * step;
  const y = (v) => {
    const t = (v - yMin) / ySpan;
    return (h - padB) - t * (h - padT - padB);
  };

  const ticksCount = 4;
  let grid = "";
  let yTicks = "";
  for (let i = 0; i <= ticksCount; i++) {
    const val = yMin + (i * ySpan / ticksCount);
    const yy = y(val);
    grid += `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="#e5e7eb" stroke-width="1" />`;
    yTicks += `<text x="${padL - 8}" y="${yy + 4}" font-size="11" fill="#475569" text-anchor="end">${Number.isInteger(val) ? val : val.toFixed(1)}</text>`;
  }

  const axes = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#cbd5e1" stroke-width="1.2" />
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#cbd5e1" stroke-width="1.2" />
  `;

  const yAxisLabel = `
    <text x="18" y="${(padT + (h - padB)) / 2}" font-size="12" fill="#475569"
      transform="rotate(-90 18 ${(padT + (h - padB)) / 2})">${yLabel}</text>
  `;

  let bars = "";
  let xLabels = "";
  const xLabelY = h - padB + 22;

  for (let i = 0; i < totals.length; i++) {
    const v = totals[i] ?? 0;
    const xc = xCenter(i);
    const xx = xc - bw / 2;
    const y0 = y(0);
    const yy = y(v);
    const bh = Math.max(1, y0 - yy);
    bars += `<rect x="${xx}" y="${yy}" width="${bw}" height="${bh}" rx="3" ry="3" fill="#0f172a" opacity="0.9" />`;

    const lbl = escapeXml(names[i] || "");
    xLabels += `
      <text x="${xc}" y="${xLabelY}" font-size="10" fill="#475569"
        text-anchor="end"
        transform="rotate(-45 ${xc} ${xLabelY})">${lbl}</text>
    `;
  }

  return `
    <div style="overflow:auto; -webkit-overflow-scrolling: touch;">
      <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Kategorie-Summen">
        ${grid}
        ${axes}
        ${yAxisLabel}
        ${yTicks}
        ${bars}
        ${xLabels}
      </svg>
      <div class="small">Balken: Summe im Zeitraum</div>
    </div>
  `;
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/* -------------------- Heatmap -------------------- */
function heatBg(total) {
  const t = Math.max(0, Math.min(1, total / 40));
  const r = 255;
  const g = Math.round(245 - t * 170);
  const b = Math.round(245 - t * 190);
  return `rgb(${r}, ${g}, ${b})`;
}

async function renderHeatmap(fromIso, toIso) {
  const days = enumerateDays(fromIso, toIso);
  const entries = await getEntriesInRange(fromIso, toIso);
  const byDate = new Map(entries.map(e => [e.isoDate, e]));

  const wrap = document.createElement("div");
  wrap.className = "heatGrid";

  for (const d of days) {
    const cell = document.createElement("div");
    cell.className = "heatCell";
    const e = byDate.get(d);
    if (e) {
      const total = sum(Object.values(e.scores || {}));
      cell.style.background = heatBg(total);
      cell.innerHTML = `<div class="d">${formatDM(d)}</div><div class="s">${total}</div>`;
    } else {
      cell.innerHTML = `<div class="d">${formatDM(d)}</div><div class="s">—</div>`;
    }
    wrap.appendChild(cell);
  }
  heatEl.innerHTML = "";
  heatEl.appendChild(wrap);
}

/* -------------------- Render Chart 1 -------------------- */
async function renderTimeChart() {
  const fromIso = fromInp.value;
  const toIso = toInp.value;
  if (!fromIso || !toIso || fromIso > toIso) return;

  const days = enumerateDays(fromIso, toIso);
  const entries = await getEntriesInRange(fromIso, toIso);
  const byDate = new Map(entries.map(e => [e.isoDate, e]));

  const selected = categorySel.value; // "__ALL__" or catId
  const daily = [];

  let filledDays = 0;
  for (const d of days) {
    const e = byDate.get(d);
    if (!e) { daily.push(null); continue; }
    filledDays++;

    if (selected === "__ALL__") daily.push(sum(Object.values(e.scores || {})));
    else daily.push((e.scores && (e.scores[selected] ?? 0)) ?? 0);
  }

  const total = sum(daily.map(v => v ?? 0));
  const nonNull = daily.filter(v => v != null);
  const avg = nonNull.length ? (sum(nonNull) / nonNull.length) : 0;
  const minV = nonNull.length ? min(nonNull) : NaN;
  const maxV = nonNull.length ? max(nonNull) : NaN;

  renderKpis({ total, avg, minV, maxV, daysCount: days.length, filledDays });

  let series = [...daily];
  if (modeSel.value === "cumulative") {
    let run = 0;
    series = series.map(v => {
      if (v == null) return null;
      run += v;
      return run;
    });
  }

  const ma = ma7Chk.checked ? movingAverage(series, 7) : null;

  const name = selected === "__ALL__"
    ? "Gesamtscore (alle Kategorien)"
    : (categories.find(c => c.id === selected)?.name || "Kategorie");

  chartTitle.textContent =
    `${name} · ${formatDMY(fromIso)} – ${formatDMY(toIso)} · ${modeSel.value === "daily" ? "täglich" : "kumuliert"}`;

  chartEl.innerHTML = svgChartTime(days, series, ma, {
    type: chartTypeSel.value,
    yLabel: "Score"
  });
}

/* -------------------- Render Chart 2 -------------------- */
async function renderCategoryTotalsChart() {
  let fromIso = catFromInp.value;
  let toIso = catToInp.value;

  if (catPresetSel.value === "sync") {
    fromIso = fromInp.value;
    toIso = toInp.value;
    catFromInp.value = fromIso;
    catToInp.value = toIso;
  }

  if (!fromIso || !toIso || fromIso > toIso) return;

  const entries = await getEntriesInRange(fromIso, toIso);

  const activeCats = categories.filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const totalsById = new Map(activeCats.map(c => [c.id, 0]));

  for (const e of entries) {
    const scores = e.scores || {};
    for (const c of activeCats) {
      totalsById.set(c.id, (totalsById.get(c.id) || 0) + (scores[c.id] ?? 0));
    }
  }

  const names = activeCats.map(c => c.name);
  const totals = activeCats.map(c => totalsById.get(c.id) || 0);

  catChartTitle.textContent = `Summe pro Kategorie · ${formatDMY(fromIso)} – ${formatDMY(toIso)}`;
  catChartEl.innerHTML = svgCategoryTotalsBar(names, totals, { yLabel: "Score (Summe)" });
}

/* -------------------- Master render -------------------- */
async function renderAll() {
  await renderTimeChart();
  await renderCategoryTotalsChart();

  const fromIso = fromInp.value;
  const toIso = toInp.value;
  if (fromIso && toIso && fromIso <= toIso) {
    await renderHeatmap(fromIso, toIso);
  }
}

/* -------------------- Export/Import -------------------- */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(s) {
  const t = String(s ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

async function exportJson() {
  const payload = await exportAll();
  download(`health-export-${isoToday()}.json`, JSON.stringify(payload, null, 2), "application/json");
  exportStatus.textContent = "JSON Export erstellt.";
}

async function exportCsvWide() {
  const payload = await exportAll();
  const catsActivePlusArchived = payload.categories.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
  const header = ["Datum", ...catsActivePlusArchived.map(c => c.name)];
  const rows = [header];

  const entries = payload.entries.slice().sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  for (const e of entries) {
    const row = [e.isoDate];
    for (const c of catsActivePlusArchived) {
      row.push(String((e.scores && e.scores[c.id] != null) ? e.scores[c.id] : ""));
    }
    rows.push(row);
  }
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  download(`health-export-wide-${isoToday()}.csv`, csv, "text/csv");
  exportStatus.textContent = "CSV (wide) Export erstellt.";
}

async function exportCsvLong() {
  const payload = await exportAll();
  const catsById = new Map(payload.categories.map(c => [c.id, c.name]));
  const header = ["Datum", "Kategorie", "Wert"];
  const rows = [header];

  const entries = payload.entries.slice().sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  for (const e of entries) {
    const scores = e.scores || {};
    for (const [catId, val] of Object.entries(scores)) {
      rows.push([e.isoDate, catsById.get(catId) || catId, String(val)]);
    }
  }
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  download(`health-export-long-${isoToday()}.csv`, csv, "text/csv");
  exportStatus.textContent = "CSV (long) Export erstellt.";
}

async function importJsonFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  await importAll(payload, { merge: false });
  exportStatus.textContent = "Import abgeschlossen.";
  await init(true);
}

/* -------------------- Init -------------------- */
async function init(skipEnsure = false) {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  if (!skipEnsure) await ensureDefaults();
  categories = await getCategories({ includeArchived: true });

  categorySel.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__ALL__";
  allOpt.textContent = "Alle (Gesamtscore)";
  categorySel.appendChild(allOpt);

  for (const c of categories
    .filter(c => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name, "de"))) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    categorySel.appendChild(opt);
  }

  presetSel.value = "30";
  setRangePreset(30, fromInp, toInp);
  ma7Chk.checked = true;
  chartTypeSel.value = "line";

  catPresetSel.value = "sync";
  catFromInp.value = fromInp.value;
  catToInp.value = toInp.value;

  const onChangeTop = async () => {
    if (catPresetSel.value === "sync") {
      catFromInp.value = fromInp.value;
      catToInp.value = toInp.value;
    }
    await renderAll();
  };

  categorySel.addEventListener("change", onChangeTop);
  modeSel.addEventListener("change", onChangeTop);
  chartTypeSel.addEventListener("change", onChangeTop);
  ma7Chk.addEventListener("change", onChangeTop);

  fromInp.addEventListener("change", () => { presetSel.value = "custom"; onChangeTop(); });
  toInp.addEventListener("change", () => { presetSel.value = "custom"; onChangeTop(); });

  presetSel.addEventListener("change", () => {
    const v = presetSel.value;
    if (v === "custom") return;
    setRangePreset(Number(v), fromInp, toInp);
    onChangeTop();
  });

  catPresetSel.addEventListener("change", async () => {
    const v = catPresetSel.value;
    if (v === "sync") {
      catFromInp.value = fromInp.value;
      catToInp.value = toInp.value;
      await renderCategoryTotalsChart();
      return;
    }
    if (v === "custom") return;
    setRangePreset(Number(v), catFromInp, catToInp);
    await renderCategoryTotalsChart();
  });

  const onChangeCat = async () => { await renderCategoryTotalsChart(); };

  catFromInp.addEventListener("change", async () => {
    if (catPresetSel.value === "sync") catPresetSel.value = "custom";
    await onChangeCat();
  });
  catToInp.addEventListener("change", async () => {
    if (catPresetSel.value === "sync") catPresetSel.value = "custom";
    await onChangeCat();
  });

  exportJsonBtn.addEventListener("click", exportJson);
  exportWideBtn.addEventListener("click", exportCsvWide);
  exportLongBtn.addEventListener("click", exportCsvLong);
  importInp.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await importJsonFile(f);
    importInp.value = "";
  });

  await renderAll();
}

init();