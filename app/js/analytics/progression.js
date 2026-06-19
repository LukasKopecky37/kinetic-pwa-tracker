/**
 * Progresión — sugerencias y comprobación estricta de objetivos.
 *
 * v6 + Fase J + refactor v55: arquitectura limpia para tres tipos de
 * ejercicio. La regla "el peso solo sube si TODAS las series tope-rango
 * pegaron al top" sigue siendo el corazón; lo que cambia es la dirección
 * y los criterios según `Exercise.progressionType`:
 *
 *   'standard'   → más kg = progreso  (default: pesas libres, máquinas)
 *   'assisted'   → menos kg = progreso (dominadas asistidas, fondos
 *                   asistidos: bajar el contrapeso es mejorar)
 *   'bodyweight' → no se toca el peso; el progreso se mide en reps
 *                   (dominadas estrictas, flexiones).
 *
 * Para ejercicios `isUnilateral` la comprobación de "cumplió el rango"
 * exige AND ESTRICTO por lado: ambos brazos/piernas deben llegar al top
 * de forma independiente. Sumar reps L+R y compararlo con el max es la
 * fuente del bug "PR falso por suma" que ahora se elimina.
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
 * Parsea '8-12' a { min, max }. Acepta tanto el string clásico del item
 * de rutina como un objeto { min, max } directo (cuando el ejercicio
 * tiene su propio targetRepRange custom).
 * @returns {{min:number, max:number}}
 */
export function parseRepRange(repRange) {
  if (repRange && typeof repRange === 'object'
      && Number.isFinite(repRange.min) && Number.isFinite(repRange.max)) {
    return { min: repRange.min, max: repRange.max };
  }
  const m = String(repRange || '8-12').match(/(\d+)\s*-\s*(\d+)/);
  return m
    ? { min: parseInt(m[1], 10), max: parseInt(m[2], 10) }
    : { min: 8, max: 12 };
}

/**
 * Devuelve el tipo de progresión efectivo del ejercicio.
 * Default 'standard' para todo lo que no tenga el campo (compat hacia atrás).
 * @returns {'standard'|'assisted'|'bodyweight'}
 */
export function progressionTypeOf(exercise) {
  const t = exercise?.progressionType;
  if (t === 'assisted' || t === 'bodyweight') return t;
  return 'standard';
}

/**
 * "Mejor" peso del set según el tipo de progresión.
 *   - standard:   max(weight)
 *   - assisted:   min(weight)   ← invertido
 *   - bodyweight: 0 (el peso no es la métrica)
 *
 * Se usa en `workingSets` para detectar el "peso de trabajo" del que se
 * promedian las series tope-rango.
 * @returns {(a:number, b:number) => number}
 */
function bestKgReducer(type) {
  if (type === 'assisted') return (a, b) => Math.min(a, b);
  return (a, b) => Math.max(a, b);
}

/** Series de TRABAJO de una sesión: sin warm-ups, al peso de referencia. */
export function workingSets(session, exercise) {
  const valid = (session?.sets || []).filter(
    s => !s.warmup && s.weight >= 0 && s.reps > 0,
  );
  if (!valid.length) return [];
  const type = progressionTypeOf(exercise);
  if (type === 'bodyweight') {
    // En bodyweight la "carga" siempre es la misma (el cuerpo); todas las
    // series cuentan como working sets sin importar su `weight`.
    return valid;
  }
  const cmp = bestKgReducer(type);
  const workW = valid.map(s => s.weight).reduce(cmp);
  return valid.filter(s => s.weight === workW);
}

/**
 * ¿La sesión cumplió ESTRICTAMENTE el objetivo del plan?
 *
 * Reglas:
 *   1. ≥ `targetSets` series de trabajo (mismo peso de referencia).
 *   2. Por serie:
 *      - is_unilateral === true → repsL >= max AND repsR >= max  (AND estricto)
 *      - is_unilateral === false → reps >= max
 *
 * Por qué AND estricto en unilateral:
 *   Antes se comparaba el total sumado (`reps = repsL + repsR`) contra
 *   `max`. Eso producía falsos positivos: 10+10 = 20 superaba el target
 *   de 12, así que el algoritmo subía el peso aunque la persona hubiera
 *   fallado el rango en AMBOS lados. Con AND ahora la app solo sube
 *   cuando EL LADO MÁS DÉBIL alcanza el top — la definición sana de
 *   progresión unilateral.
 *
 * @param {object} session
 * @param {string|{min,max}} repRange
 * @param {number} targetSets
 * @param {object} [exercise]
 * @returns {boolean}
 */
export function metTargetStrict(session, repRange, targetSets, exercise) {
  const work = workingSets(session, exercise);
  if (!work.length) return false;
  const need = Math.max(1, targetSets || 3);
  if (work.length < need) return false;
  const { max } = parseRepRange(repRange);
  const isUnilateral = !!exercise?.isUnilateral || !!exercise?.unilateralSplit;

  if (isUnilateral) {
    // Cada serie debe tener repsL >= max AND repsR >= max. Si una serie
    // no tiene datos per-side (legacy bilateral) la consideramos NO
    // cumplida — más seguro que asumir el doble del bilateral.
    return work.every(s => {
      const L = +s.repsL;
      const R = +s.repsR;
      return Number.isFinite(L) && Number.isFinite(R) && L >= max && R >= max;
    });
  }

  return work.every(s => s.reps >= max);
}

/**
 * Incremento de carga por ejercicio.
 *
 * Prioridad de lectura:
 *   1. `exercise.autoIncrementKg` (override per-ejercicio, ajuste en Editar)
 *   2. 2.5 kg (default global, mínimo discos olímpicos)
 *
 * Para `progressionType === 'bodyweight'` devuelve 0: el progreso no se
 * mide en kg sino en reps.
 *
 * @param {object} [exercise]
 * @returns {number}
 */
export function bumpKgFor(exercise) {
  if (progressionTypeOf(exercise) === 'bodyweight') return 0;
  const custom = +(exercise?.autoIncrementKg);
  if (Number.isFinite(custom) && custom > 0) return custom;
  return 2.5;
}

/**
 * Aplica el bump al peso de trabajo, RESPETANDO la dirección del tipo
 * de progresión:
 *   - standard:   workW + bump
 *   - assisted:   workW - bump (¡menos asistencia es progreso!)
 *   - bodyweight: workW (no aplica)
 *
 * Redondeo a 0.5 kg → 57.5 + 2.5 = 60 limpio.
 * Para assisted, el mínimo es 0 (sin asistencia = bodyweight puro).
 */
function applyBump(workW, bump, type) {
  if (type === 'bodyweight') return workW;
  const next = type === 'assisted' ? workW - bump : workW + bump;
  const rounded = Math.round(next * 2) / 2;
  return Math.max(0, rounded);
}

/**
 * Aplica una regresión deliberada ('down' override).
 *   - standard:   workW - bump (mínimo 0)
 *   - assisted:   workW + bump (subir asistencia = retroceder)
 *   - bodyweight: workW
 */
function applyRegression(workW, bump, type) {
  if (type === 'bodyweight') return workW;
  const next = type === 'assisted' ? workW + bump : workW - bump;
  const rounded = Math.round(next * 2) / 2;
  return Math.max(0, rounded);
}

/**
 * Recomienda peso para la próxima sesión.
 *
 *   - éxito estricto (ver `metTargetStrict`) → `applyBump(workW, …)`
 *   - cualquier otro caso                    → MANTENER peso de trabajo
 *
 * Honra los overrides manuales del usuario en `last.nextOverride`:
 *   'up'   → fuerza bump (en la dirección "buena" del tipo)
 *   'down' → fuerza regresión (dirección "mala" del tipo)
 *   'flat' → congela el peso (=)
 *
 * @param {Array<object>} sessions
 * @param {string|{min,max}} repRange
 * @param {number} [targetSets]
 * @param {object} [exercise]
 * @returns {number|null}
 */
export function suggestNextWeight(sessions, repRange, targetSets, exercise) {
  if (!sessions.length) return null;
  const last = sessions[sessions.length - 1];
  const work = workingSets(last, exercise);
  if (!work.length) return topSet(last)?.weight ?? null;

  const workW = work[0].weight;
  const bump  = bumpKgFor(exercise);
  const type  = progressionTypeOf(exercise);

  if (last.nextOverride === 'up')   return applyBump(workW, bump, type);
  if (last.nextOverride === 'down') return applyRegression(workW, bump, type);
  if (last.nextOverride === 'flat') return workW;

  // Lógica automática estándar: solo "sube" (en el sentido bueno para el
  // tipo) si cumplió rango estricto y AND unilateral si aplica.
  if (metTargetStrict(last, repRange, targetSets, exercise)) {
    return applyBump(workW, bump, type);
  }
  return workW;
}
