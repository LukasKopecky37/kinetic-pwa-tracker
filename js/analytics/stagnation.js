/**
 * Estancamiento — detecta cuándo un ejercicio deja de progresar.
 *
 * Regla actual (estricta, methodologicamente correcta):
 *   "estancado" = en las últimas `weeksBack` semanas (def. 4) el MEJOR
 *   1RM estimado NO supera el mejor 1RM estimado anterior a esa ventana.
 *
 * Usamos 1RM estimado (Epley) y no solo topWeight: así un usuario que sube
 * reps con el mismo peso (60×8 → 60×10) cuenta como progreso, no como
 * estancamiento. Y exigimos al menos 2 sesiones DENTRO de la ventana y un
 * histórico previo para emitir el aviso (no se inventa con un dato suelto).
 */

import { bestEstimated1RM } from './one-rm.js';
import { topWeight } from './prs.js';

/**
 * @param {Array<object>} sessions
 * @param {number} [weeksBack=4]
 * @returns {boolean}
 */
export function isStalled(sessions, weeksBack = 4) {
  if (!sessions || sessions.length < 2) return false;

  const cut = new Date();
  cut.setDate(cut.getDate() - weeksBack * 7);
  const cutISO = cut.toISOString().slice(0, 10);

  const recent = sessions.filter(s => s.date >= cutISO);
  const before = sessions.filter(s => s.date <  cutISO);

  // Sin al menos 2 sesiones en la ventana, no juzgamos (ruido).
  if (recent.length < 2) return false;
  // Sin histórico previo no hay baseline para comparar (acaba de empezar).
  if (!before.length) return false;

  const e1rmBefore = bestEstimated1RM(before);
  const e1rmRecent = bestEstimated1RM(recent);

  // Estancado si lo mejor de las últimas 4 semanas NO supera el PR previo.
  return e1rmRecent <= e1rmBefore;
}

/**
 * Lista de ejercicios estancados.
 * @param {Array<object>} activeMesoSessions
 * @param {Array<object>} allSessions
 * @param {(id:string)=>object|undefined} byId
 * @returns {Array<{ex:object, last:object, count:number}>}
 */
export function findStalledExercises(activeMesoSessions, allSessions, byId) {
  const usedIds = [...new Set(activeMesoSessions.map(s => s.exerciseId))];
  const out = [];
  for (const id of usedIds) {
    const sess = allSessions
      .filter(s => s.exerciseId === id)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!isStalled(sess)) continue;
    const ex = byId(id);
    if (!ex) continue;
    const last4 = sess.slice(-4);
    out.push({ ex, last: last4.slice(-1)[0], count: last4.length });
  }
  return out;
}
