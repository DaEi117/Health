const DB_NAME = "health_pwa";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // categories: { id, name, archived, createdAt }
      if (!db.objectStoreNames.contains("categories")) {
        const s = db.createObjectStore("categories", { keyPath: "id" });
        s.createIndex("archived", "archived", { unique: false });
      }

      // entries: key = isoDate (YYYY-MM-DD), value = { isoDate, scores: {catId: 0..3}, updatedAt }
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", { keyPath: "isoDate" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDE(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

export const DEFAULT_CATEGORIES = [
  // Schmerzen
  "Kopfschmerzen","Migräne","Nackenschmerzen","Rückenschmerzen","Gelenkschmerzen","Muskelschmerzen","Bauchschmerzen",
  // Erkältung/HNO
  "Halsschmerzen","Schnupfen","Verstopfte Nase","Ohrenschmerzen","Husten","Nebenhöhlendruck",
  // Allgemein
  "Müdigkeit","Erschöpfung","Konzentrationsprobleme","Schwindel","Übelkeit",
  // Schlaf
  "Einschlafprobleme","Durchschlafprobleme","Nicht erholsamer Schlaf",
  // Psyche
  "Stress","Innere Unruhe","Niedergeschlagenheit"
];

export async function ensureDefaults() {
  const db = await openDb();
  const cats = await getAllCategories(db);
  if (cats.length > 0) return;

  const store = tx(db, "categories", "readwrite");
  const now = Date.now();
  for (const name of DEFAULT_CATEGORIES) {
    store.put({ id: uid(), name, archived: false, createdAt: now });
  }
  await new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror = () => rej(store.transaction.error);
  });
}

export async function getCategories({ includeArchived = false } = {}) {
  const db = await openDb();
  const all = await getAllCategories(db);
  const sorted = all.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return includeArchived ? sorted : sorted.filter(c => !c.archived);
}

async function getAllCategories(db) {
  return new Promise((resolve, reject) => {
    const store = tx(db, "categories", "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function addCategory(name) {
  const db = await openDb();
  const store = tx(db, "categories", "readwrite");
  const item = { id: uid(), name: name.trim(), archived: false, createdAt: Date.now() };
  store.put(item);
  await new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror = () => rej(store.transaction.error);
  });
  return item;
}

export async function updateCategory(id, patch) {
  const db = await openDb();
  const store = tx(db, "categories", "readwrite");
  const current = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!current) return;

  store.put({ ...current, ...patch });
  await new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror = () => rej(store.transaction.error);
  });
}

export async function restoreDefaultCategories() {
  const db = await openDb();
  // clear categories store
  await new Promise((resolve, reject) => {
    const store = tx(db, "categories", "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  // insert defaults
  const store = tx(db, "categories", "readwrite");
  const now = Date.now();
  for (const name of DEFAULT_CATEGORIES) {
    store.put({ id: uid(), name, archived: false, createdAt: now });
  }
  await new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror = () => rej(store.transaction.error);
  });
}

export async function getEntry(isoDate) {
  const db = await openDb();
  const store = tx(db, "entries", "readonly");
  return await new Promise((resolve, reject) => {
    const req = store.get(isoDate);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertEntry(isoDate, scores) {
  const db = await openDb();
  const store = tx(db, "entries", "readwrite");
  const item = { isoDate, scores, updatedAt: Date.now() };
  store.put(item);
  await new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror = () => rej(store.transaction.error);
  });
  return item;
}

export async function deleteEntry(isoDate) {
  const db = await openDb();
  const store = tx(db, "entries", "readwrite");
  store.delete(isoDate);
  await new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror = () => rej(store.transaction.error);
  });
}

export async function getEntriesInRange(fromIso, toIso) {
  // inclusive range
  const db = await openDb();
  const store = tx(db, "entries", "readonly");
  const all = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  return all
    .filter(e => e.isoDate >= fromIso && e.isoDate <= toIso)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

export async function exportAll() {
  const db = await openDb();
  const cats = await getAllCategories(db);
  const entries = await new Promise((resolve, reject) => {
    const store = tx(db, "entries", "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  return { version: 1, exportedAt: new Date().toISOString(), categories: cats, entries };
}

export async function importAll(payload, { merge = false } = {}) {
  if (!payload?.categories || !payload?.entries) throw new Error("Ungültiges JSON-Format");
  const db = await openDb();

  if (!merge) {
    await Promise.all([
      new Promise((res, rej) => {
        const s = tx(db, "categories", "readwrite");
        const r = s.clear();
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      }),
      new Promise((res, rej) => {
        const s = tx(db, "entries", "readwrite");
        const r = s.clear();
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      })
    ]);
  }

  // categories
  await new Promise((resolve, reject) => {
    const store = tx(db, "categories", "readwrite");
    for (const c of payload.categories) {
      if (!c?.id || !c?.name) continue;
      store.put({
        id: c.id,
        name: c.name,
        archived: !!c.archived,
        createdAt: c.createdAt ?? Date.now()
      });
    }
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });

  // entries
  await new Promise((resolve, reject) => {
    const store = tx(db, "entries", "readwrite");
    for (const e of payload.entries) {
      if (!e?.isoDate || !e?.scores) continue;
      store.put({
        isoDate: e.isoDate,
        scores: e.scores,
        updatedAt: e.updatedAt ?? Date.now()
      });
    }
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}