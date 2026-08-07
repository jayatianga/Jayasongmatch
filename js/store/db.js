// Persistence. Projects (small JSON) and audio (WAV blobs, keyed by take id)
// live in IndexedDB so sessions survive a browser restart.

const DB_NAME = 'jayasongmatch';
const DB_VERSION = 2;
const STORE_PROJECTS = 'projects';
const STORE_AUDIO = 'audio';
const STORE_SETTINGS = 'settings';
const STORE_ATTEMPTS = 'attempts';   // one record per analysed take, kept forever
const STORE_TRAINER = 'trainer';     // baseline results and trainer preferences

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_AUDIO)) db.createObjectStore(STORE_AUDIO);
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS);
      if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
        const attempts = db.createObjectStore(STORE_ATTEMPTS, { keyPath: 'id' });
        attempts.createIndex('at', 'at');
        attempts.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains(STORE_TRAINER)) db.createObjectStore(STORE_TRAINER);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function run(storeName, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = work(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  async saveProject(project) {
    return run(STORE_PROJECTS, 'readwrite', (store) => store.put({ ...project, updatedAt: Date.now() }));
  },

  async getProject(id) {
    return run(STORE_PROJECTS, 'readonly', (store) => store.get(id));
  },

  async listProjects() {
    const projects = await run(STORE_PROJECTS, 'readonly', (store) => store.getAll());
    return (projects ?? []).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },

  async deleteProject(id) {
    return run(STORE_PROJECTS, 'readwrite', (store) => store.delete(id));
  },

  async putAudio(key, blob) {
    return run(STORE_AUDIO, 'readwrite', (store) => store.put(blob, key));
  },

  async getAudio(key) {
    return run(STORE_AUDIO, 'readonly', (store) => store.get(key));
  },

  async deleteAudio(key) {
    return run(STORE_AUDIO, 'readwrite', (store) => store.delete(key));
  },

  async setSetting(key, value) {
    return run(STORE_SETTINGS, 'readwrite', (store) => store.put(value, key));
  },

  async getSetting(key, fallback = null) {
    const value = await run(STORE_SETTINGS, 'readonly', (store) => store.get(key));
    return value === undefined ? fallback : value;
  },

  // --- progress tracking ---------------------------------------------------

  async saveAttempt(attempt) {
    return run(STORE_ATTEMPTS, 'readwrite', (store) => store.put(attempt));
  },

  async listAttempts({ limit = 0 } = {}) {
    const attempts = await run(STORE_ATTEMPTS, 'readonly', (store) => store.getAll());
    const sorted = (attempts ?? []).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  },

  async deleteAttempt(id) {
    return run(STORE_ATTEMPTS, 'readwrite', (store) => store.delete(id));
  },

  async clearAttempts() {
    return run(STORE_ATTEMPTS, 'readwrite', (store) => store.clear());
  },

  async setTrainer(key, value) {
    return run(STORE_TRAINER, 'readwrite', (store) => store.put(value, key));
  },

  async getTrainer(key, fallback = null) {
    const value = await run(STORE_TRAINER, 'readonly', (store) => store.get(key));
    return value === undefined ? fallback : value;
  },

  async estimateUsage() {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  },
};
