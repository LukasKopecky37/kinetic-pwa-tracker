/**
 * Motor de Auto-Progresión — reglas estrictas UP / HOLD / DOWN + resolución
 * de baseline con pesos mixtos (refactor v63, "bulletproof").
 *
 * Tipos de ejercicio (Exercise.progressionType):
 *   'standard'   → más kg = progreso  (default: pesas libres, máquinas)
 *   'assisted'   → menos kg = progreso (asistidas: bajar el contrapeso mejora)
 *   'bodyweight' → el peso no se mueve; el progreso se mide en reps
 *
 * Las tres decisiones del motor, sobre la ÚLTIMA sesión del ejercicio:
 *
 *   UP   (sube carga): SOLO si se completaron ≥ targetSets series AL PESO DE
 *        TRABAJO (baseline) y TODAS ellas alcanzaron el TOPE del rango
 *        (target 3×8-12 → 12,12,12). Estricto.
 *   DOWN (deload):     si la MAYORÍA de las series (> mitad) NO alcanzó el
 *        MÍNIMO del rango (target 8-12 → 7,6,5) → sugiere −1 incremento para
 *        romper el estancamiento.
 *   HOLD (mantiene):   cualquier otro caso → repite el peso de trabajo.
 *
 * Resolución de BASELINE con pesos mixtos (intra-exercise weight drops):
 *   Si en una sesión el usuario bajó de peso a media serie (ej. 10, 9, 9), el
 *   peso base de la próxima sesión NO es el primero (10) ni el promedio: es
 *   la carga de TRABAJO REAL SOSTENIDA. Regla:
 *     1. El peso de la ÚLTIMA serie que alcanzó ≥ mínimo del rango, o
 *     2. si ninguna llegó al mínimo, el peso MODA (más frecuente) de la sesión.
 *   Para 10, 9, 9 → baseline 9.
 *
 * Unilateral (isUnilateral / unilateralSplit): las reps EFECTIVAS de una
 * serie son las del LADO MÁS DÉBIL (min(repsL, repsR)); así UP exige que
 * ambos lados lleguen al tope y DOWN se dispara si el lado débil no llega
 * al mínimo. Sobre datos legacy sin per-side cae al `reps` plano.
 *
 * Consumidores: store.js (suggestNextWeight, averagePosition),
 *               workout.js (metTargetStrict, bumpKgFor).
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
 * Parsea '8-12' a { min, max }. Acepta el string clásico o un objeto
 * { min, max } directo (targetRepRange custom del ejercicio).
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
 * Tipo de progresión efectivo (default 'standard').
 * @returns {'standard'|'assisted'|'bodyweight'}
 */
export function progressionTypeOf(exercise) {
  const t = exercise?.progressionType;
  if (t === 'assisted' || t === 'bodyweight') return t;
  return 'standard';
}

/** Incremento de carga del ejercicio (autoIncrementKg → 2.5). 0 en bodyweight. */
export function bumpKgFor(exercise) {
  if (progressionTypeOf(exercise) === 'bodyweight') return 0;
  const custom = +(exercise?.autoIncrementKg);
  if (Number.isFinite(custom) && custom > 0) return custom;
  return 2.5;
}

/* ============================================================================
   Helpers internos
   ============================================================================ */

/** ¿Ejercicio unilateral? (flag nuevo o legacy). */
function isUni(exercise) {
  return !!(exercise?.isUnilateral || exercise?.unilateralSplit);
}

/**
 * Reps EFECTIVAS de una serie a efectos de progresión.
 *   - unilateral con datos per-side → min(repsL, repsR) (el lado débil manda)
 *   - resto → `reps` plano
 * @returns {number}
 */
function effReps(set, unilateral) {
  if (unilateral && set.repsL != null && set.repsR != null) {
    const L = +set.repsL, R = +set.repsR;
    if (Number.isFinite(L) && Number.isFinite(R)) return Math.min(L, R);
  }
  return +set.reps || 0;
}

/** Series de TRABAJO: sin warm-ups, con reps > 0. Conserva el ORDEN. */
function workSets(session) {
  return (session?.sets || []).filter(s => !s.warmup && (+s.reps) > 0);
}

/**
 * Peso MODA de un conjunto de series: el más frecuente. En empate, el que
 * aparece en la serie MÁS RECIENTE (último índice) — neutral respecto al
 * tipo (no favorece "más pesado", que en assisted sería lo contrario).
 * @returns {number}
 */
function modeWeight(sets) {
  const count = new Map();     // weight → nº de apariciones
  const lastIdx = new Map();   // weight → último índice visto
  sets.forEach((s, i) => {
    const w = +s.weight || 0;
    count.set(w, (count.get(w) || 0) + 1);
    lastIdx.set(w, i);
  });
  let best = null, bestCount = -1, bestIdx = -1;
  for (const [w, c] of count) {
    if (c > bestCount || (c === bestCount && lastIdx.get(w) > bestIdx)) {
      best = w; bestCount = c; bestIdx = lastIdx.get(w);
    }
  }
  return best == null ? 0 : best;
}

/**
 * Resolución de BASELINE con pesos mixtos.
 *   1. peso de la ÚLTIMA serie con effReps ≥ mínimo del rango, o
 *   2. peso MODA de la sesión si ninguna llegó al mínimo.
 * @returns {number|null} null si no hay series de trabajo.
 */
export function resolveBaseline(session, exercise, repRange) {
  const work = workSets(session);
  if (!work.length) return null;
  const { min } = parseRepRange(repRange);
  const uni = isUni(exercise);

  let lastInRange = null;
  for (const s of work) {
    if (effReps(s, uni) >= min) lastInRange = s;   // recorre en orden → queda el ÚLTIMO
  }
  if (lastInRange) return +lastInRange.weight || 0;
  return modeWeight(work);
}

/**
 * Aplica el incremento en la dirección "de progreso" del tipo.
 *   standard: +bump · assisted: −bump · bodyweight: sin cambio. Redondeo 0.5.
 */
function applyBump(w, bump, type) {
  if (type === 'bodyweight') return w;
  const next = type === 'assisted' ? w - bump : w + bump;
  return Math.max(0, Math.round(next * 2) / 2);
}

/**
 * Aplica el deload en la dirección "de regresión" del tipo.
 *   standard: −bump · assisted: +bump · bodyweight: sin cambio. Redondeo 0.5.
 */
function applyRegression(w, bump, type) {
  if (type === 'bodyweight') return w;
  const next = type === 'assisted' ? w + bump : w - bump;
  return Math.max(0, Math.round(next * 2) / 2);
}

/* ============================================================================
   Evaluación central
   ============================================================================ */

/**
 * Evalúa la sesión y devuelve la DECISIÓN de progresión + el peso resultante.
 *
 * @param {object} session
 * @param {string|{min,max}} repRange
 * @param {number} [targetSets]
 * @param {object} [exercise]
 * @returns {{
 *   decision: 'up'|'down'|'hold',
 *   baseline: number|null,
 *   nextWeight: number|null,
 *   metTop: boolean,
 *   majorityFailed: boolean
 * }}
 */
export function evaluateProgression(session, repRange, targetSets, exercise) {
  const type = progressionTypeOf(exercise);
  const uni  = isUni(exercise);
  const { min, max } = parseRepRange(repRange);
  const work = workSets(session);

  if (!work.length) {
    return { decision: 'hold', baseline: null, nextWeight: null,
             metTop: false, majorityFailed: false };
  }

  const baseline = resolveBaseline(session, exercise, repRange);
  const bump = bumpKgFor(exercise);

  // Series realizadas AL peso de trabajo (baseline) = la carga sostenida real.
  const baselineSets = work.filter(s => (+s.weight || 0) === baseline);
  const need = Math.max(1, targetSets || baselineSets.length || 3);

  // UP estricto: suficientes series al baseline Y todas al TOPE del rango.
  const metTop = baselineSets.length >= need
    && baselineSets.every(s => effReps(s, uni) >= max);

  // DOWN/deload: la MAYORÍA de TODAS las series de trabajo por debajo del mínimo.
  const belowMin = work.filter(s => effReps(s, uni) < min).length;
  const majorityFailed = belowMin > work.length / 2;

  let decision, nextWeight;
  if (metTop) {
    decision = 'up';   nextWeight = applyBump(baseline, bump, type);
  } else if (majorityFailed) {
    decision = 'down'; nextWeight = applyRegression(baseline, bump, type);
  } else {
    decision = 'hold'; nextWeight = baseline;
  }
  return { decision, baseline, nextWeight, metTop, majorityFailed };
}

/**
 * ¿La sesión cumplió ESTRICTAMENTE el objetivo (→ sube carga)?
 * Fina capa sobre evaluateProgression para el resumen post-entreno.
 * @returns {boolean}
 */
export function metTargetStrict(session, repRange, targetSets, exercise) {
  return evaluateProgression(session, repRange, targetSets, exercise).decision === 'up';
}

/**
 * Recomienda el peso para la PRÓXIMA sesión de un ejercicio.
 *
 * Base: la decisión del motor (up/down/hold) sobre la última sesión, con el
 * baseline resuelto (pesos mixtos). Los overrides manuales del usuario en
 * `last.nextOverride` puentean la lógica automática pero SIEMPRE sobre el
 * baseline resuelto (no sobre el primer peso ni el máximo):
 *   'up'   → fuerza +incremento (dirección de progreso del tipo)
 *   'down' → fuerza −incremento (dirección de regresión del tipo)
 *   'flat' → congela el baseline
 *
 * @param {Array<object>} sessions   histórico ASC del ejercicio
 * @param {string|{min,max}} repRange
 * @param {number} [targetSets]
 * @param {object} [exercise]
 * @returns {number|null}
 */
export function suggestNextWeight(sessions, repRange, targetSets, exercise) {
  if (!sessions.length) return null;
  const last = sessions[sessions.length - 1];
  const evalRes = evaluateProgression(last, repRange, targetSets, exercise);
  if (evalRes.baseline == null) return topSet(last)?.weight ?? null;

  const type = progressionTypeOf(exercise);
  const bump = bumpKgFor(exercise);
  const base = evalRes.baseline;

  if (last.nextOverride === 'up')   return applyBump(base, bump, type);
  if (last.nextOverride === 'down') return applyRegression(base, bump, type);
  if (last.nextOverride === 'flat') return base;

  return evalRes.nextWeight;
}

/* Compat: `workingSets` se mantiene exportada (tests ad-hoc). Devuelve las
   series al peso de trabajo resuelto. */
export function workingSets(session, exercise, repRange) {
  const baseline = resolveBaseline(session, exercise, repRange);
  if (baseline == null) return [];
  return workSets(session).filter(s => (+s.weight || 0) === baseline);
}
