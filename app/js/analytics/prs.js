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
 * @param {{id:number|string, date:string, sets:Array}} session
 * @param {Array<object>} exerciseSessions
 * @returns {boolean}
 */
export function isPR(session, exerciseSessions) {
  if (!session?.sets?.length) return false;
  const bv = bestSetVolume(session);
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
    if (bestSetVolume(x) >= bv) return false;
  }
  return true;
}
