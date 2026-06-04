/**
 * Volumen y adherencia.
 *
 * v6: las sesiones tienen `sets[]`. Cada set aporta `weight × reps` al volumen.
 * Los sets marcados como `warmup` se excluyen del cómputo (no son estímulo real).
 */

/**
 * Volumen total de UNA sesión: Σ (weight × reps) en sets no-warmup.
 * @param {{sets:Array<{weight:number, reps:number, warmup?:boolean}>}} s
 * @returns {number}
 */
export function sessionVolume(s) {
  let v = 0;
  for (const set of (s.sets || [])) {
    if (set.warmup) continue;
    v += (set.weight || 0) * (set.reps || 0);
  }
  return v;
}

/**
 * Series efectivas de una sesión (no-warmup con reps válidas).
 * @param {{sets:Array<object>}} s
 * @returns {number}
 */
export function sessionSetCount(s) {
  let n = 0;
  for (const set of (s.sets || [])) {
    if (set.warmup) continue;
    if (set.reps != null && set.reps > 0) n++;
  }
  return n;
}

/**
 * Series por grupo muscular en los últimos N días.
 * @param {Array<object>} sessions
 * @param {(id:string)=>object|undefined} byId
 * @param {number} [daysBack=7]
 * @returns {Object<string, number>}
 */
export function weeklySetsByGroup(sessions, byId, daysBack = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutISO = cutoff.toISOString().slice(0, 10);

  const byGroup = {};
  for (const s of sessions) {
    if (s.date < cutISO) continue;
    const ex = byId(s.exerciseId);
    if (!ex) continue;
    byGroup[ex.group] = (byGroup[ex.group] || 0) + sessionSetCount(s);
  }
  return byGroup;
}

/**
 * Matriz para el heatmap de adherencia (estilo GitHub/Apple).
 *
 * - Alineada a semanas LUNES-DOMINGO (locale ES): col 0 = lunes de hace
 *   (weeks-1) semanas; col `weeks-1` = lunes de esta semana. Las primeras
 *   semanas pueden quedar parcialmente en el "pasado" del histórico — eso
 *   es normal y deja los cuadrados de los días futuros marcados `future:true`.
 * - `lvl` 0..4 derivado del nº de EJERCICIOS distintos ese día (count). El
 *   usuario decidió en el spec: 1 ej. = tono suave, 4+ = naranja brillante.
 * - Orden de las celdas: column-major (col 0 fila 0..6, col 1 fila 0..6, …)
 *   para que un render con `grid-auto-flow:column; grid-template-rows:repeat(7)`
 *   las pinte sin postprocesado.
 *
 * @param {Array<object>} sessions
 * @param {number} [weeks=12]
 * @returns {Array<{date:string, dow:number, lvl:number, v:number, count:number, future:boolean, weekIdx:number}>}
 */
export function adherenceMatrix(sessions, weeks = 12) {
  // Lunes de esta semana (locale ES: lunes = inicio de semana)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const jsDow = today.getDay();                  // 0=Dom..6=Sáb
  const daysFromMon = (jsDow === 0) ? 6 : jsDow - 1;
  const start = new Date(today);
  start.setDate(today.getDate() - daysFromMon - (weeks - 1) * 7);

  const perDate = {};
  for (const s of sessions) {
    const day = perDate[s.date] || (perDate[s.date] = { v: 0, exIds: new Set() });
    day.v += sessionVolume(s);
    day.exIds.add(s.exerciseId);                 // ejercicios DISTINTOS ese día
  }

  const todayISO = today.toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const stat = perDate[iso];
    const count = stat ? stat.exIds.size : 0;
    const lvl = count <= 0 ? 0 : Math.min(4, count);   // 1, 2, 3, 4+
    cells.push({
      date: iso,
      dow: (d.getDay() === 0) ? 6 : d.getDay() - 1,    // 0=Lun..6=Dom
      v: stat ? stat.v : 0,
      count,
      lvl,
      future: iso > todayISO,
      weekIdx: Math.floor(i / 7),
    });
  }
  return cells;
}

/**
 * Métricas agregadas para una ventana de N días, con offset hacia el pasado.
 *
 *   weeklyMetrics(sessions)              → últimos 7 días desde hoy
 *   weeklyMetrics(sessions, 7, 7)        → 7 días anteriores (la semana previa)
 *   weeklyMetrics(sessions, 7, 14)       → la semana de hace 2-3 semanas
 *
 * El offset se mide en DÍAS desde "hoy" hacia atrás. La ventana va de
 *   [hoy - offset - windowDays, hoy - offset).
 *
 * Devuelve:
 *   - totalVolume:  Σ(weight × reps) en kg·rep, work sets only
 *   - totalSets:    nº de series no-warmup con reps válidas
 *   - avgWeight:    promedio de KG en work sets (mide intensidad)
 *   - avgRPE:       promedio de RPE en work sets que lo registraron
 *   - sessionCount: nº de sesiones únicas (por fecha+ejercicio) en la ventana
 *   - workoutDays:  nº de días distintos con al menos 1 set válido
 *
 * @param {Array<{date:string, sets:Array}>} sessions
 * @param {number} [windowDays=7]
 * @param {number} [offsetDays=0]
 * @returns {{
 *   totalVolume:number, totalSets:number, avgWeight:number,
 *   avgRPE:number, sessionCount:number, workoutDays:number,
 *   start:string, end:string
 * }}
 */
export function weeklyMetrics(sessions, windowDays = 7, offsetDays = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() - offsetDays);
  const start = new Date(end);
  start.setDate(start.getDate() - windowDays);
  const startISO = start.toISOString().slice(0, 10);
  const endISO   = end.toISOString().slice(0, 10);

  const inRange = (sessions || []).filter(s => s.date >= startISO && s.date < endISO);

  let totalVolume = 0;
  let totalSets   = 0;
  let weightSum   = 0;
  let weightCnt   = 0;
  let rpeSum      = 0;
  let rpeCnt      = 0;
  const days = new Set();

  for (const s of inRange) {
    let validInSession = 0;
    for (const set of (s.sets || [])) {
      if (set.warmup) continue;
      if (!set.reps) continue;
      const w = set.weight || 0;
      const r = set.reps || 0;
      totalVolume += w * r;
      totalSets   += 1;
      if (w > 0) { weightSum += w; weightCnt += 1; }
      if (set.rpe != null && set.rpe !== '' && !isNaN(parseFloat(set.rpe))) {
        rpeSum += parseFloat(set.rpe);
        rpeCnt += 1;
      }
      validInSession += 1;
    }
    if (validInSession > 0) days.add(s.date);
  }

  return {
    totalVolume,
    totalSets,
    avgWeight: weightCnt > 0 ? weightSum / weightCnt : 0,
    avgRPE:    rpeCnt > 0 ? rpeSum / rpeCnt : 0,
    sessionCount: inRange.length,
    workoutDays: days.size,
    start: startISO,
    end:   endISO,
  };
}
