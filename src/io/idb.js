// @ts-check
/**
 * Chave/valor mínimo sobre IndexedDB. Usado para guardar os "handles" de
 * arquivos e pastas (o localStorage não consegue guardar handles).
 * Tudo protegido: se o IndexedDB não estiver disponível, as funções apenas
 * não lembram nada — o editor continua funcionando.
 */
const DB_NAME = 'md-qa-editor';
const STORE = 'kv';
/** @type {Promise<IDBDatabase | null> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase | null>} */
function open() {
  if (!dbPromise) {
    dbPromise = /** @type {Promise<IDBDatabase>} */ (new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    })).catch(() => null);
  }
  return dbPromise;
}

/**
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest} fn
 * @returns {Promise<any>}
 */
async function tx(mode, fn) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** @param {string} key */
export const idbGet = (key) => tx('readonly', (s) => s.get(key));
/** @param {string} key @param {unknown} value */
export const idbSet = (key, value) => tx('readwrite', (s) => s.put(value, key));
/** @param {string} key */
export const idbDel = (key) => tx('readwrite', (s) => s.delete(key));
