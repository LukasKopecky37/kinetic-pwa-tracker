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
