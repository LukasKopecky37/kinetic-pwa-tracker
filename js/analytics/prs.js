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

/**
 * ¿Es PR de peso esta sesión? Comparada con todas las sesiones del mismo
 * ejercicio ≤ su fecha (excluyéndose ella misma).
 *
 * @param {{id:number|string, date:string, sets:Array}} session
 * @param {Array<object>} exerciseSessions
 * @returns {boolean}
 */
export function isPR(session, exerciseSessions) {
  const sessionTop = topWeight(session);
  if (sessionTop <= 0) return false;
  const prev = exerciseSessions.filter(
    x => x.id !== session.id && x.date <= session.date
  );
  return prev.every(p => topWeight(p) < sessionTop);
}
