const DB_NAME = "healthlog-db";
const DB_VERSION = 3;

const STORE_CATEGORIES = "categories";
const STORE_ENTRIES = "entries";
const STORE_MEDS = "meds";

function uuid() {
  return "c_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
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

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        db.createObjectStore(STORE_CATEGORIES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: "isoDate" });
      }
      if (!db.objectStoreNames.contains(STORE_MEDS)) {
        db.createObjectStore(STORE_MEDS, { keyPath: "name" });
      }

      // Note: If stores already exist, no action needed.
      // Entries store fields are flexible; older entries will just miss new fields.
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let out;
    Promise.resolve()
      .then(() => fn(store))
      .then((res) => { out = res; })
      .catch(reject);

    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/* -------------------- Defaults -------------------- */
const DEFAULT_CATEGORIES = [
  "Kopfschmerzen",
  "Ohrenschmerzen",
  "Halsschmerzen",
  "Halskratzen",
  "Rachenkratzen",
  "Schnupfen",
  "Husten",
  "Fieber",
  "Müdigkeit",
  "Schwindel",
  "Übelkeit",
  "Bauchschmerzen",
  "Durchfall",
  "Verstopfung",
  "Sodbrennen",
  "Gelenkschmerzen",
  "Muskelschmerzen",
  "Rückenschmerzen",
  "Brustschmerzen",
  "Atemnot",
  "Hautausschlag",
  "Juckreiz",
  "Augenreizungen",
  "Zahnschmerzen",
  "Stress",
  "Einschlafprobleme",
  "Durchschlafprobleme"
];

const DEFAULT_MEDS = ["Elotrans", "Ibuprofen", "Paracetamol", "Reisetablette"]; // alphabetisch wird beim Anzeigen sortiert

export async function ensureDefaults() {
  // categories
  const cats = await getCategories({ includeArchived: true });
  if (!cats.length) {
    await tx(STORE_CATEGORIES, "readwrite", (s) => {
      for (const name of DEFAULT_CATEGORIES) {
        s.put({ id: uuid(), name, archived: false });
      }
    });
  }

  // meds
  const meds = await getMeds();
  if (!meds.length) {
    await tx(STORE_MEDS, "readwrite", (s) => {
      for (const name of DEFAULT_MEDS) s.put({ name });
    });
  }
}

/* -------------------- Categories -------------------- */
export async function getCategories({ includeArchived = false } = {}) {
  const all = await tx(STORE_CATEGORIES, "readonly", (s) =>
    new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })
  );
  return includeArchived ? all : all.filter(c => !c.archived);
}

export async function addCategory(name) {
  const n = String(name || "").trim();
  if (!n) return;
  await tx(STORE_CATEGORIES, "readwrite", (s) => s.put({ id: uuid(), name: n, archived: false }));
}

export async function updateCategory(id, patch) {
  await tx(STORE_CATEGORIES, "readwrite", (s) =>
    new Promise((resolve, reject) => {
      const req = s.get(id);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        const next = { ...cur, ...patch };
        s.put(next);
        resolve();
      };
      req.onerror = () => reject(req.error);
    })
  );
}

export async function restoreDefaultCategories() {
  // Keep entries intact, but reset categories list (IDs change!)
  await tx(STORE_CATEGORIES, "readwrite", (s) =>
    new Promise((resolve, reject) => {
      const clear = s.clear();
      clear.onsuccess = () => {
        for (const name of DEFAULT_CATEGORIES) s.put({ id: uuid(), name, archived: false });
        resolve();
      };
      clear.onerror = () => reject(clear.error);
    })
  );
}

/* -------------------- Meds list -------------------- */
export async function getMeds() {
  const all = await tx(STORE_MEDS, "readonly", (s) =>
    new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve((req.result || []).map(x => x.name));
      req.onerror = () => reject(req.error);
    })
  );
  // unique + trimmed
  const set = new Set(all.map(x => String(x).trim()).filter(Boolean));
  return Array.from(set);
}

export async function addMed(name) {
  const n = String(name || "").trim();
  if (!n) return;
  await tx(STORE_MEDS, "readwrite", (s) => s.put({ name: n }));
}

export async function deleteMedFromList(name) {
  const n = String(name || "").trim();
  if (!n) return;
  await tx(STORE_MEDS, "readwrite", (s) => s.delete(n));
}

/* -------------------- Entries -------------------- */
export async function getEntry(isoDate) {
  const key = String(isoDate || "").trim();
  if (!key) return null;
  return tx(STORE_ENTRIES, "readonly", (s) =>
    new Promise((resolve, reject) => {
      const req = s.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function upsertEntry(isoDate, data) {
  const key = String(isoDate || "").trim();
  if (!key) return;

  const payload = {
    isoDate: key,
    scores: data?.scores || {},
    sport: Boolean(data?.sport),
    alcohol: Boolean(data?.alcohol),
    meds: Array.isArray(data?.meds) ? data.meds.slice() : []
  };

  await tx(STORE_ENTRIES, "readwrite", (s) => s.put(payload));
}

export async function deleteEntry(isoDate) {
  const key = String(isoDate || "").trim();
  if (!key) return;
  await tx(STORE_ENTRIES, "readwrite", (s) => s.delete(key));
}

export async function getEntriesInRange(fromIso, toIso) {
  const from = String(fromIso || "").trim();
  const to = String(toIso || "").trim();
  if (!from || !to) return [];

  // keys are ISO strings, lexical order matches chronological order
  const all = await tx(STORE_ENTRIES, "readonly", (s) =>
    new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })
  );

  return all
    .filter(e => e.isoDate >= from && e.isoDate <= to)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

/* -------------------- Export / Import -------------------- */
export async function exportAll() {
  const categories = await getCategories({ includeArchived: true });
  const entries = await tx(STORE_ENTRIES, "readonly", (s) =>
    new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })
  );
  const meds = await getMeds();

  // Normalize entries fields for older rows
  const normEntries = entries.map(e => ({
    isoDate: e.isoDate,
    scores: e.scores || {},
    sport: Boolean(e.sport),
    alcohol: Boolean(e.alcohol),
    meds: Array.isArray(e.meds) ? e.meds.slice() : []
  }));

  return { version: "1.3", categories, meds, entries: normEntries };
}

export async function importAll(payload, { merge = false } = {}) {
  if (!payload || typeof payload !== "object") return;

  const cats = Array.isArray(payload.categories) ? payload.categories : [];
  const meds = Array.isArray(payload.meds) ? payload.meds : [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];

  if (!merge) {
    // clear stores
    await tx(STORE_CATEGORIES, "readwrite", (s) => s.clear());
    await tx(STORE_ENTRIES, "readwrite", (s) => s.clear());
    await tx(STORE_MEDS, "readwrite", (s) => s.clear());
  }

  // import categories
  if (cats.length) {
    await tx(STORE_CATEGORIES, "readwrite", (s) => {
      for (const c of cats) {
        if (!c || !c.id || !c.name) continue;
        s.put({ id: c.id, name: c.name, archived: Boolean(c.archived) });
      }
    });
  }

  // import meds list
  if (meds.length) {
    await tx(STORE_MEDS, "readwrite", (s) => {
      for (const name of meds) {
        const n = String(name || "").trim();
        if (!n) continue;
        s.put({ name: n });
      }
    });
  }

  // import entries
  if (entries.length) {
    await tx(STORE_ENTRIES, "readwrite", (s) => {
      for (const e of entries) {
        if (!e || !e.isoDate) continue;
        s.put({
          isoDate: e.isoDate,
          scores: e.scores || {},
          sport: Boolean(e.sport),
          alcohol: Boolean(e.alcohol),
          meds: Array.isArray(e.meds) ? e.meds.slice() : []
        });
      }
    });
  }
}