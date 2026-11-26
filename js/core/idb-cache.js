import { envReady } from "./config.js";

const DB_NAME = "karnival_madani_cache_db";
const DB_VERSION = 1;
const STORE_NAME = "kv_store";
const DEFAULT_TTL_MS = 300000;

if (!window.__memoryCache) {
    window.__memoryCache = new Map();
}

let dbPromise = null;
let useMemoryFallback = false;

function openDatabase() {
    if (useMemoryFallback) {
        return Promise.resolve(null);
    }

    if (dbPromise) {
        return dbPromise;
    }

    if (typeof window === "undefined" || !("indexedDB" in window)) {
        useMemoryFallback = true;
        return Promise.resolve(null);
    }

    dbPromise = new Promise((resolve) => {
        try {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "key" });
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };

            request.onerror = () => {
                useMemoryFallback = true;
                dbPromise = null;
                resolve(null);
            };

            request.onblocked = () => {
                useMemoryFallback = true;
                dbPromise = null;
                resolve(null);
            };
        } catch (_) {
            useMemoryFallback = true;
            dbPromise = null;
            resolve(null);
        }
    });

    return dbPromise;
}

async function readEntry(key) {
    const memEntry = window.__memoryCache.get(key) || null;
    const db = await openDatabase();

    if (!db) {
        return memEntry;
    }

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);

            req.onsuccess = () => {
                const result = req.result || null;
                if (result) {
                    window.__memoryCache.set(key, result);
                }
                resolve(result || memEntry);
            };

            req.onerror = () => {
                resolve(memEntry);
            };
        } catch (_) {
            resolve(memEntry);
        }
    });
}

async function writeEntry(key, value, ttlMs = DEFAULT_TTL_MS) {
    const now = Date.now();
    const record = {
        key,
        value,
        cachedAt: now,
        expiresAt: now + Math.max(0, Number(ttlMs) || DEFAULT_TTL_MS)
    };

    window.__memoryCache.set(key, record);
    const db = await openDatabase();

    if (!db) {
        return true;
    }

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(record);

            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        } catch (_) {
            resolve(false);
        }
    });
}

async function deleteEntry(key) {
    window.__memoryCache.delete(key);
    const db = await openDatabase();

    if (!db) {
        return true;
    }

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(key);

            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        } catch (_) {
            resolve(false);
        }
    });
}

async function deleteByPrefix(prefix) {
    for (const k of Array.from(window.__memoryCache.keys())) {
        if (String(k).startsWith(prefix)) {
            window.__memoryCache.delete(k);
        }
    }

    const db = await openDatabase();
    if (!db) {
        return true;
    }

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const cursorReq = store.openCursor();

            cursorReq.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (String(cursor.key).startsWith(prefix)) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };

            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch (_) {
            resolve(false);
        }
    });
}

async function clearAll() {
    window.__memoryCache.clear();
    const db = await openDatabase();

    if (!db) {
        return true;
    }

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.clear();

            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        } catch (_) {
            resolve(false);
        }
    });
}

const inflightRevalidations = new Map();

export const idbCache = {
    dbVersion: DB_VERSION,

    async get(key) {
        const entry = await readEntry(key);
        return entry ? entry.value : null;
    },

    async set(key, value, ttlMs = DEFAULT_TTL_MS) {
        return writeEntry(key, value, ttlMs);
    },

    async remove(key) {
        return deleteEntry(key);
    },

    async invalidatePrefix(prefix) {
        return deleteByPrefix(prefix);
    },

    async clear() {
        return clearAll();
    },

    async getWithSWR(key, fetcher, ttlMs = DEFAULT_TTL_MS, onFreshData = null) {
        await envReady;
        const entry = await readEntry(key);
        const now = Date.now();
        const isFresh = Boolean(entry && entry.expiresAt > now);

        const triggerRevalidate = () => {
            if (inflightRevalidations.has(key)) {
                return inflightRevalidations.get(key);
            }

            const task = (async () => {
                try {
                    const freshValue = await fetcher();
                    await writeEntry(key, freshValue, ttlMs);
                    if (typeof onFreshData === "function") {
                        onFreshData(freshValue);
                    }
                    return freshValue;
                } finally {
                    inflightRevalidations.delete(key);
                }
            })();

            inflightRevalidations.set(key, task);
            return task;
        };

        if (entry) {
            if (!isFresh) {
                triggerRevalidate().catch(() => {});
            }
            return entry.value;
        }

        return triggerRevalidate();
    }
};

window.idbCache = idbCache;