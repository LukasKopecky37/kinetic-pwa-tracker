/**
 * Personal Records.
 *
 * v6: las sesiones tienen `sets[]`. El PR de peso es: ¿el peso del set más
 * pesado de esta sesión supera al peso del set más pesado de cualquier
 * sesión previa del mismo ejercicio?
 *
 * Los warm-ups no cuentan para PR (no es coherente decir "PR" porque hagas
 * un warm-up con un peso alto que ya hacías).
 *
 * En Fase F2 añadiremos:
 *   - PR de reps a un peso dado
 *   - PR de volumen total en una sesión
 *   - PR de 1RM estimado
 */

/** Peso máximo en sets no-warmup. 0 si no hay sets válidos. */
export function topWeight(session) {
  let top = 0;
  for (const set of (session?.sets || [])) {
    if (set.warmup) continue;
    if ((set.weight || 0) > top) top = set.weight;
  }
  return top;
}

/* ============================================================================
 * Modo unilateral estricto (is_unilateral): los sets pueden llevar
 * weightL, weightR, repsL, repsR. `weight` y `reps` se mantienen como
 * campos derivados (max / suma) para compatibilidad. Los helpers de
 * abajo proyectan un set sobre UN lado ('L' o 'R') con fallback al
 * campo plano si no hay registro per-side. Eso permite a los charts y
 * a la Bitácora pintar I y D por separado SIN tocar la analítica clásica.
 * ========================================================================== */

/** Peso de UN lado de la serie ('L'|'R'); fallback al weight plano. */
export function setSideWeight(set, side) {
  const k = side === 'L' ? 'weightL' : 'weightR';
  const v = set?.[k];
  if (v != null && v !== '') return +v || 0;
  return +(set?.weight) || 0;
}
/** Reps de UN lado de la serie; fallback al `reps` plano si no hay split. */
export function setSideReps(set, side) {
  const k = side === 'L' ? 'repsL' : 'repsR';
  const v = set?.[k];
  if (v != null && v !== '') return +v || 0;
  // Sin split: 'reps' representa el total bilateral; no es comparable per lado.
  // Devuelve 0 para no inflar gráficos unilaterales con datos pre-split.
  if (set?.repsL != null || set?.repsR != null) return 0;
  return +(set?.reps) || 0;
}
/** Top set de UN lado (peso×reps de la mejor serie de ese lado). */
export function topSetSide(session, side) {
  let best = null;
  for (const set of (session?.sets || [])) {
    if (set.warmup) continue;
    const r = setSideReps(set, side);
    if (!r) continue;
    const w = setSideWeight(set, side);
    if (!best ||
        w > best.weight ||
        (w === best.weight && r > best.reps)) {
      best = { weight: w, reps: r };
    }
  }
  return best;
}
/** Volumen total de la sesión por UN lado: Σ(w_side × r_side). */
export function sessionVolumeSide(session, side) {
  let v = 0;
  for (const set of (session?.sets || [])) {
    if (set.warmup) continue;
    const r = setSideReps(set, side);
    if (!r) continue;
    v += setSideWeight(set, side) * r;
  }
  return v;
}

/**
 * El set más "pesado" de la sesión (mayor peso; desempate por más reps).
 * Útil para chips de historial y para el dato "top set" de la sesión.
 * @returns {{weight:number, reps:number, rpe?:number}|null}
 */
export function topSet(session) {
  let best = null;
  for (const set of (session?.sets || [])) {
    if (set.warmup) continue;
    if (!set.reps) continue;
    if (!best ||
        set.weight > best.weight ||
        (set.weight === best.weight && set.reps > best.reps)) {
      best = set;
    }
  }
  return best;
}

/** Mejor set por VOLUMEN (peso × reps). El criterio "peso x reps" del
 *  requerimiento PR — un 60kg×12 (=720) cuenta como mejor set que un
 *  60kg×10 (=600) AUNQUE el peso máximo no haya subido. */
export function bestSetVolume(session) {
  let top = 0;
  for (const set of (session?.sets || [])) {
    if (set.warmup) continue;
    if (!set.reps) continue;
    const v = (set.weight || 0) * set.reps;
    if (v > top) top = v;
  }
  return top;
}

/** Volumen total de la sesión: Σ(peso × reps) de todos los work-sets. */
export function sessionTotalVolume(session) {
  let total = 0;
  for (const set of (session?.sets || [])) {
    if (set.warmup) continue;
    if (!set.reps) continue;
    total += (set.weight || 0) * set.reps;
  }
  return total;
}

/**
 * ¿Es PR esta sesión? — REGLA ESTRICTA (refactor v48+):
 *
 * Métrica única: **Mejor Set por Volumen** = max(peso × reps) entre los
 * sets de trabajo (sin warm-ups) de la sesión.
 *
 * Devuelve true si y solo si esa métrica es ESTRICTAMENTE mayor que la
 * misma métrica calculada en CADA sesión previa o coincidente en fecha
 * (excluyéndose ella misma). En caso de empate exacto NO es PR: el récord
 * pertenece a la sesión que lo estableció primero.
 *
 * Por qué se eliminaron las métricas "top weight" y "volumen total":
 *   - El usuario reportó (IMG_5514) que el badge "PR" salía repetido en
 *     varias sesiones porque cualquiera de las 3 métricas activaba el
 *     flag. Si tres sesiones acababan con el mismo top weight, las tres
 *     se marcaban como PR.
 *   - El criterio "peso × reps del mejor set" captura tanto el avance de
 *     carga como el avance de reps al mismo peso (el dopamine loop sigue
 *     activo) sin sobrecontar.
 *
 * NOTA: aplicar dedupe global "único PR por ejercicio" no es trabajo de
 * esta función — `isPR(s, sessions)` responde "¿s rompió el récord en su
 * momento?". El renderizador (history.js) puede elegir mostrar SOLO el
 * último PR histórico filtrando con `bestSetVolume`. Ambos contratos se
 * mantienen coherentes.
 *
 * v55: para ejercicios `assisted` la métrica se invierte. Un PR de
 * dominadas asistidas es BAJAR el contrapeso (o subir reps al mismo
 * contrapeso menor). El "mejor" set por volumen se interpreta como:
 *   - standard:   max(peso × reps)   ← más es mejor
 *   - assisted:   max((1/peso) × reps) cuando peso > 0;
 *                 si peso==0 (sin asistencia) el ejercicio entra en
 *                 "bodyweight" implícito → el ranking pasa a comparar
 *                 reps puras (más reps = mejor). Mismo signo, distinta
 *                 escala — se mantiene la regla "estrictamente mayor"
 *                 sin tocar el resto del flujo.
 *   - bodyweight: max(reps)
 *
 * @param {{id:number|string, date:string, sets:Array}} session
 * @param {Array<object>} exerciseSessions
 * @param {object} [exercise]  opcional; si trae `progressionType` se usa
 *                             para invertir la métrica.
 * @returns {boolean}
 */
function _prMetric(session, exercise) {
  const type = exercise?.progressionType;
  if (type === 'bodyweight') {
    // max reps de un solo work-set
    let top = 0;
    for (const s of (session?.sets || [])) {
      if (s.warmup) continue;
      const r = +s.reps || 0;
      if (r > top) top = r;
    }
    return top;
  }
  if (type === 'assisted') {
    // "menos peso × más reps" → usamos (1 + 1/(weight+1)) * reps como
    // score monotónico. Trabajando sin asistencia (weight=0) maximiza
    // el factor; con asistencia alta el factor cae. Empata bonito con
    // el caso reps puras y mantiene la propiedad "estrictamente >".
    let top = 0;
    for (const s of (session?.sets || [])) {
      if (s.warmup) continue;
      const r = +s.reps || 0;
      if (!r) continue;
      const w = +s.weight || 0;
      const score = (1 + 1 / (w + 1)) * r;
      if (score > top) top = score;
    }
    return top;
  }
  // standard
  return bestSetVolume(session);
}

export function isPR(session, exerciseSessions, exercise) {
  if (!session?.sets?.length) return false;
  const bv = _prMetric(session, exercise);
  if (bv <= 0) return false;

  // "Previa o coincidente": fecha < ó (misma fecha pero id léxicamente
  // menor). El id monotónico (Store._sessionSeq) garantiza orden estable
  // entre sesiones del mismo día. Una sesión que iguala el récord no es
  // PR: el flag pertenece a la pionera.
  const sid = String(session.id);
  const sdate = session.date;
  for (const x of (exerciseSessions || [])) {
    if (x.id === session.id) continue;
    const earlier =
      x.date < sdate || (x.date === sdate && String(x.id) < sid);
    if (!earlier) continue;
    if (_prMetric(x, exercise) >= bv) return false;
  }
  return true;
}
