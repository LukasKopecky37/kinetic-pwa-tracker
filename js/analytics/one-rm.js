/**
 * 1RM (One-rep max) — estimación de fuerza máxima.
 *
 * Fórmula Epley:  1RM ≈ peso × (1 + reps / 30)
 *
 * En v6 cada sesión tiene `sets[]`. Calculamos el e1RM por SET y nos quedamos
 * con el máximo. Eso refleja correctamente el caso "pirámide": una pirámide
 * que termina en 90×6 da un e1RM superior al de las series ligeras de calentamiento.
 */

/** @param {number} weight  @param {number} reps  @returns {number} kg con 1 decimal */
export function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Mejor 1RM estimado a través de TODOS los sets de TODAS las sesiones
 * proporcionadas. Ignora sets sin reps o marcados como warm-up.
 *
 * @param {Array<{sets:Array<{weight:number, reps:number, warmup?:boolean}>}>} sessions
 * @returns {number}
 */
export function bestEstimated1RM(sessions) {
  let best = 0;
  for (const s of sessions) {
    for (const set of (s.sets || [])) {
      if (set.warmup) continue;
      if (!set.reps) continue;
      const e = estimate1RM(set.weight, set.reps);
      if (e > best) best = e;
    }
  }
  return best;
}
