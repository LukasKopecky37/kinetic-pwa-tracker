/**
 * Persistencia en IndexedDB vía Dexie (cargado como global desde CDN).
 *
 * Esquema v1 (deliberadamente simple):
 *   - tabla `state` con un único registro key='main' que guarda el blob
 *     completo del Store.
 *   Equivalente a localStorage pero sin el límite de 5 MB y con escrituras
 *   asíncronas que no bloquean la UI al guardar una sesión.
 *
 * Esquema futuro (cuando lo necesitemos, no antes):
 *   db.version(2).stores({
 *     sessions: '++id, date, exerciseId, mesoId, [exerciseId+date]',
 *     routines: 'id, mesoId',
 *     exercises: 'id, group',
 *     mesos: 'id',
 *     state: '&key',
 *   });
 *   Dexie hace la upgrade automáticamente.
 *
 * Si Dexie no está cargado (offline antes del CDN, tests en Node, navegador
 * sin IndexedDB), las funciones devuelven null silenciosamente y caemos en
 * la mirror de localStorage. Ese es el comportamiento esperado.
 */

const DB_NAME = 'Rutina';
const STORE = 'state';
const KEY = 'main';

let _db = null;
let _failed = false;

function getDB() {
  if (_db) return _db;
  if (_failed) return null;
  if (typeof Dexie === 'undefined') return null;
  try {
    _db = new Dexie(DB_NAME);
    _db.version(1).stores({ [STORE]: '&key' });
    return _db;
  } catch (e) {
    console.warn('[db] Dexie no disponible:', e?.message);
    _failed = true;
    return null;
  }
}

/**
 * Carga el blob del Store desde IndexedDB.
 * @returns {Promise<object|null>} `null` si no hay IDB o no hay datos
 */
export async function loadState() {
  const db = getDB();
  if (!db) return null;
  try {
    const row = await db[STORE].get(KEY);
    return row ? row.data : null;
  } catch (e) {
    return null;
  }
}

/**
 * Guarda el blob del Store en IndexedDB. Fire-and-forget; nunca lanza.
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function saveState(data) {
  const db = getDB();
  if (!db) return;
  try {
    await db[STORE].put({ key: KEY, data });
  } catch (e) {
    // localStorage mirror es la red de seguridad.
  }
}

/** Borra todo el contenido. Útil para "Restablecer datos" + tests. */
export async function clearState() {
  const db = getDB();
  if (!db) return;
  try { await db[STORE].clear(); } catch (e) {}
}
