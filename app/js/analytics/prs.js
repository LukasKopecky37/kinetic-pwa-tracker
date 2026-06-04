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
 * ¿Es PR esta sesión? Comparada con todas las sesiones del mismo ejercicio
 * ≤ su fecha (excluyéndose ella misma).
 *
 * Devuelve true si CUALQUIERA de estas 3 métricas es ESTRICTAMENTE mayor
 * que el récord previo:
 *   1. Peso máximo (top set) — el clásico
 *   2. Mejor set por volumen (peso × reps de un solo set) — usuario rompe
 *      el récord en una serie de "máximo esfuerzo concentrado"
 *   3. Volumen total de la sesión (Σ peso × reps) — el usuario suma más
 *      trabajo acumulado que en cualquier sesión previa
 *
 * Razón: el usuario percibe como "PR" cualquiera de los tres. Limitarlo
 * al peso máximo apagaba el dopamine loop cuando el atleta hacía más reps
 * al mismo peso (mejorando volumen) sin subir la barra.
 *
 * @param {{id:number|string, date:string, sets:Array}} session
 * @param {Array<object>} exerciseSessions
 * @returns {boolean}
 */
export function isPR(session, exerciseSessions) {
  if (!session?.sets?.length) return false;
  const prev = (exerciseSessions || []).filter(
    x => x.id !== session.id && x.date <= session.date
  );

  // Métrica 1: peso máximo (top set)
  const w  = topWeight(session);
  if (w > 0 && prev.every(p => topWeight(p) < w)) return true;

  // Métrica 2: mejor set por volumen (peso × reps de UN set)
  const bv = bestSetVolume(session);
  if (bv > 0 && prev.every(p => bestSetVolume(p) < bv)) return true;

  // Métrica 3: volumen total de la sesión (Σ peso × reps)
  const tv = sessionTotalVolume(session);
  if (tv > 0 && prev.every(p => sessionTotalVolume(p) < tv)) return true;

  return false;
}
