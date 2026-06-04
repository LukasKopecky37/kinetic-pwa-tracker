/**
 * Progresión — sugerencias y comprobación estricta de objetivos.
 *
 * v6 + Fase J: regla anti-"bump silencioso". El peso solo sube si:
 *   1) hay ≥ targetSets series de trabajo (al mismo peso, sin warm-ups), y
 *   2) TODAS esas series llegan al top del rango (12-15 → todas con 15+).
 * Si no se cumple → se mantiene el peso. Ya NO se baja automáticamente
 * (eso es decisión del usuario, no del algoritmo).
 *
 * El mismo helper `metTargetStrict()` lo usa el modal post-workout para
 * felicitar y listar los ejercicios que ganan +kg la próxima semana.
 */

import { topSet } from './prs.js';

/**
 * Posición media en las últimas N sesiones con `order` registrado.
 * @returns {number|null}
 */
export function averagePosition(sessions, n = 5) {
  const valid = sessions.filter(s => s.order != null);
  if (!valid.length) return null;
  const last = valid.slice(-n);
  return last.reduce((a, s) => a + s.order, 0) / last.length;
}

/**
 * Parsea '8-12' a { min, max }. Defaults razonables.
 * @returns {{min:number, max:number}}
 */
export function parseRepRange(repRange) {
  const m = (repRange || '8-12').match(/(\d+)\s*-\s*(\d+)/);
  return m
    ? { min: parseInt(m[1], 10), max: parseInt(m[2], 10) }
    : { min: 8, max: 12 };
}

/** Series de TRABAJO de una sesión: sin warm-ups, al peso máximo usado. */
export function workingSets(session) {
  const valid = (session?.sets || []).filter(
    s => !s.warmup && s.weight > 0 && s.reps > 0,
  );
  if (!valid.length) return [];
  const top = Math.max(...valid.map(s => s.weight));
  return valid.filter(s => s.weight === top);
}

/**
 * ¿La sesión cumplió ESTRICTAMENTE el objetivo del plan?
 * Requiere ≥ targetSets series al mismo peso de trabajo, todas con reps
 * que alcancen o superen el top del rango (12-15 → ≥15).
 *
 * Si no hay `targetSets` explícito, exige un mínimo razonable de 3 series.
 * @returns {boolean}
 */
export function metTargetStrict(session, repRange, targetSets) {
  const work = workingSets(session);
  if (!work.length) return false;
  const need = Math.max(1, targetSets || 3);
  if (work.length < need) return false;
  const { max } = parseRepRange(repRange);
  return work.every(s => s.reps >= max);
}

/**
 * Incremento sugerido por ejercicio. Compuestos / piernas / espalda /
 * glúteos → +5 kg. Aislamientos / brazos / hombros → +2.5 kg.
 * @param {{group?:string, compound?:boolean}|null} exercise
 * @returns {number}
 */
export function bumpKgFor(exercise) {
  if (!exercise) return 2.5;
  const heavy = exercise.compound
    || ['Piernas', 'Glúteos', 'Espalda'].includes(exercise.group);
  return heavy ? 5 : 2.5;
}

/**
 * Recomienda peso para la próxima sesión.
 *   - éxito estricto (ver `metTargetStrict`) → peso de trabajo + `bumpKgFor`
 *   - cualquier otro caso                    → MANTENER peso de trabajo
 *
 * Importante: NO baja automáticamente al fallar — antes lo hacía y producía
 * sugerencias erróneas tras una sola sesión floja. Si el usuario quiere
 * bajar, lo edita él.
 *
 * @param {Array<object>} sessions
 * @param {string} repRange
 * @param {number} [targetSets]
 * @param {{group?:string, compound?:boolean}} [exercise]
 * @returns {number|null}
 */
export function suggestNextWeight(sessions, repRange, targetSets, exercise) {
  if (!sessions.length) return null;
  const last = sessions[sessions.length - 1];
  const work = workingSets(last);
  if (!work.length) return topSet(last)?.weight ?? null;

  const workW = work[0].weight;
  const bump  = bumpKgFor(exercise);

  /* === Override manual del usuario (Human-in-the-loop) ===
     Si en la última sesión se marcó nextOverride='up' o 'down', ese flag
     puentea la lógica automática de double-progression. Es la palanca
     consciente: "yo decido qué peso quiero la próxima vez, independiente
     de si cumplí o no el rango de reps". */
  if (last.nextOverride === 'up') {
    return Math.round((workW + bump) * 2) / 2;
  }
  if (last.nextOverride === 'down') {
    return Math.max(0, Math.round((workW - bump) * 2) / 2);
  }

  // Lógica automática estándar: solo sube si cumplió rango estricto.
  if (metTargetStrict(last, repRange, targetSets)) {
    return Math.round((workW + bump) * 2) / 2;
  }
  return workW; // mantener, NO bajar (sería decisión del usuario)
}
