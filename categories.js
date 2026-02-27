import { ensureDefaults, getCategories, addCategory, updateCategory, restoreDefaultCategories } from "./db.js";

const list = document.getElementById("catList");
const newCat = document.getElementById("newCat");
const addBtn = document.getElementById("addCat");
const restoreBtn = document.getElementById("restoreDefaults");
const statusEl = document.getElementById("catStatus");

function setStatus(msg){ statusEl.textContent = msg || ""; }

function row(cat) {
  const wrap = document.createElement("div");
  wrap.className = "sym";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.gap = "2px";

  const name = document.createElement("div");
  name.className = "symName";
  name.textContent = cat.name;

  const meta = document.createElement("div");
  meta.className = "small";
  meta.textContent = cat.archived ? "archiviert" : "aktiv";

  left.append(name, meta);

  const ctrls = document.createElement("div");
  ctrls.className = "symCtrls";

  const rename = document.createElement("button");
  rename.className = "btn";
  rename.type = "button";
  rename.textContent = "Umbenennen";
  rename.addEventListener("click", async () => {
    const n = prompt("Neuer Name:", cat.name);
    if (!n || !n.trim()) return;
    await updateCategory(cat.id, { name: n.trim() });
    setStatus("Kategorie aktualisiert.");
    await render();
  });

  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.type = "button";
  toggle.textContent = cat.archived ? "Reaktivieren" : "Archivieren";
  toggle.addEventListener("click", async () => {
    await updateCategory(cat.id, { archived: !cat.archived });
    setStatus(cat.archived ? "Kategorie reaktiviert." : "Kategorie archiviert.");
    await render();
  });

  ctrls.append(rename, toggle);
  wrap.append(left, ctrls);
  return wrap;
}

async function render() {
  const cats = await getCategories({ includeArchived: true });
  // aktive zuerst, dann archivierte
  cats.sort((a,b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "de"));

  list.innerHTML = "";
  for (const c of cats) list.appendChild(row(c));
}

async function init() {
  await ensureDefaults();
  await render();

  addBtn.addEventListener("click", async () => {
    const name = newCat.value.trim();
    if (!name) return;
    await addCategory(name);
    newCat.value = "";
    setStatus("Kategorie hinzugefügt.");
    await render();
  });

  restoreBtn.addEventListener("click", async () => {
    if (!confirm("Defaults wiederherstellen? Das ersetzt die Kategorienliste (Einträge bleiben erhalten, aber Zuordnung kann sich ändern).")) return;
    await restoreDefaultCategories();
    setStatus("Defaults wiederhergestellt.");
    await render();
  });
}

init();