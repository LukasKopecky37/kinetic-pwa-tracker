/**
 * Migraciones y carga del estado.
 *
 * Cadena de carga (de más nuevo a más viejo):
 *   1. IndexedDB (Fase D y siguientes)
 *   2. localStorage v6   (formato actual)
 *   3. localStorage v5   → migra sesiones a sets[] in-memory
 *   4. localStorage v4   (alias de v5; mismo formato de sesiones, mismo upgrade)
 *   5. localStorage v3   → primero a v4, luego a v6
 *   6. localStorage v2   → re-seed conservando sesiones (migrate per session)
 *   7. Sin nada          → `seedData()`
 *
 * Tras cargar, `Store.save()` deja todo coherente en localStorage + IDB.
 */

import { seedData, migrateOldSession } from './seed.js';
import { loadState as loadStateIDB, clearState as clearIDB } from './db.js';

export const KEY    = 'rutina-data-v4';     // mantenemos misma key durante v4..v6
export const KEY_V3 = 'rutina-data-v3';
export const KEY_V2 = 'rutina2-data-v2';

/**
 * Rellena campos opcionales y migra el formato de sesiones si hace falta.
 * Idempotente: llamar dos veces no rompe nada.
 *
 * @param {object} data
 * @returns {object}
 */
export function ensureFields(data) {
  if (!data.settings)        data.settings = { lastRoutineId: null, defaultRest: 120 };
  if (!Array.isArray(data.workouts))     data.workouts = [];
  if (data.activeWorkoutId === undefined) data.activeWorkoutId = null;

  // Migración v5 → v6: si alguna sesión tiene `reps` (array) y no `sets`,
  // la convertimos al modelo nuevo.
  if (Array.isArray(data.sessions)) {
    data.sessions = data.sessions.map(s => {
      if (Array.isArray(s.sets)) return s;          // ya v6
      return migrateOldSession(s, data.currentMesoId);
    });
  }

  // Routine items: garantía de rest/days
  (data.routines || []).forEach((r) => {
    r.items.forEach((it) => {
      if (it.rest == null) it.rest = 120;
      if (!it.days)        it.days = [];
    });
  });

  data.version = 6;
  return data;
}

/**
 * Carga asíncrona: IDB → localStorage → seed.
 *
 * Devuelve `{ data, safeToSave }`. `safeToSave` es false SOLO cuando caemos
 * al seed vacío DESPUÉS de que una lectura lanzara un error: en ese caso
 * puede haber datos reales que no pudimos leer (iOS desaloja IndexedDB de
 * forma transitoria), así que el caller NO debe persistir el seed encima.
 *
 * @returns {Promise<{data:object, safeToSave:boolean}>}
 */
export async function loadStateAsync() {
  let errored = false;

  try {
    const idb = await loadStateIDB();
    if (idb) return { data: ensureFields(idb), safeToSave: true };
  } catch (e) { errored = true; }

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { data: ensureFields(JSON.parse(raw)), safeToSave: true };
  } catch (e) { errored = true; }

  try {
    const v3 = localStorage.getItem(KEY_V3);
    if (v3) return { data: ensureFields(JSON.parse(v3)), safeToSave: true };
  } catch (e) { errored = true; }

  try {
    const v2 = localStorage.getItem(KEY_V2);
    if (v2) {
      const old = JSON.parse(v2);
      return { data: seedData(old.sessions || []), safeToSave: true };
    }
  } catch (e) { errored = true; }

  // Seed vacío. Si NO hubo errores → primer arranque real (persistir).
  // Si hubo algún error → no clobber: ejecuta esta sesión en seed pero no
  // sobrescribas lo que pueda haber. En el próximo arranque IDB se recupera.
  return { data: seedData(), safeToSave: !errored };
}

/**
 * Mirror sincrónico en localStorage.
 * @param {object} data
 */
export function saveToStorage(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { /* cuota llena o privacidad estricta: ignoramos */ }
}

/** Limpia localStorage + IDB. */
export async function clearAllStorage() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  await clearIDB();
}
