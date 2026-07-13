/**
 * workout-metrics.js — analíticas de DURACIÓN de entrenamiento y ESTADO DE
 * ÁNIMO / energía pre-workout. Funciones puras (sin Store ni DOM).
 *
 * Fuente de datos: `data.workouts[]`, donde cada workout tiene:
 *   - startAt / endAt / durationSec  → duración
 *   - readiness.energy (1..5)        → mood/energía pre-workout
 *   - date (yyyy-mm-dd)              → agrupación temporal
 */

/** Duración en segundos de un workout: usa `durationSec` guardado, si no lo
 *  deriva de start/endAt. null si no hay datos de tiempo. */
export function workoutDurationSec(w) {
  if (Number.isFinite(+w?.durationSec) && +w.durationSec > 0) return +w.durationSec;
  if (w?.startAt && w?.endAt) {
    const sec = Math.floor((new Date(w.endAt) - new Date(w.startAt)) / 1000);
    return sec > 0 ? sec : null;
  }
  return null;
}

/** Lunes (yyyy-mm-dd) de la semana de una fecha ISO (locale ES: semana L-D). */
function mondayOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  const jsDow = d.getDay();                 // 0=Dom..6=Sáb
  const diff = jsDow === 0 ? 6 : jsDow - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Minutos TOTALES de entrenamiento por semana (últimas `weeks` semanas,
 * alineadas lunes-domingo). Solo cuenta workouts con duración conocida.
 * @returns {Array<{label:string, minutes:number, weekStartISO:string}>} asc
 */
export function weeklyDurationMinutes(workouts, weeks = 10) {
  // Suma de segundos por lunes-de-semana.
  const bySunMon = new Map();               // weekStartISO → segundos
  for (const w of (workouts || [])) {
    const sec = workoutDurationSec(w);
    if (sec == null || !w.date) continue;
    const wk = mondayOf(w.date);
    bySunMon.set(wk, (bySunMon.get(wk) || 0) + sec);
  }

  // Construye las últimas `weeks` semanas hasta la actual (aunque estén a 0).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const curMon = mondayOf(today.toISOString().slice(0, 10));
  const start = new Date(curMon + 'T00:00:00');
  start.setDate(start.getDate() - (weeks - 1) * 7);

  const out = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i * 7);
    const iso = d.toISOString().slice(0, 10);
    const sec = bySunMon.get(iso) || 0;
    out.push({
      weekStartISO: iso,
      minutes: Math.round(sec / 60),
      label: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', ''),
    });
  }
  return out;
}

/**
 * Estado de ánimo/energía por DÍA en los últimos `days` días. Un valor por
 * fecha (si hay varios workouts, el de energía más alta del día). Solo
 * incluye días con energía marcada (readiness.energy 1..5).
 * @returns {Map<string, number>} date → energy(1..5)
 */
export function moodByDate(workouts, days = 30) {
  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutISO = cutoff.toISOString().slice(0, 10);

  const map = new Map();
  for (const w of (workouts || [])) {
    const e = +(w?.readiness?.energy);
    if (!Number.isFinite(e) || e < 1 || e > 5) continue;
    if (!w.date || w.date < cutISO) continue;
    const prev = map.get(w.date);
    map.set(w.date, prev == null ? e : Math.max(prev, e));
  }
  return map;
}

/**
 * Suma de energía ACTIVA (kcal) de los workouts en los últimos `days` días.
 * @returns {{ total:number, count:number, avg:number|null }}
 */
export function totalActiveKcal(workouts, days = 7) {
  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutISO = cutoff.toISOString().slice(0, 10);
  let sum = 0, n = 0;
  for (const w of (workouts || [])) {
    const k = +w?.activeKcal;
    if (!Number.isFinite(k) || k <= 0) continue;
    if (w.date && w.date < cutISO) continue;
    sum += k; n++;
  }
  return { total: Math.round(sum), count: n, avg: n ? Math.round(sum / n) : null };
}

/**
 * Correlación energía↔PR (feature Pro). Recibe los workouts y un predicado
 * `hadPR(workout)` que dice si ese workout produjo ≥1 récord personal.
 * Devuelve el % de workouts que acabaron en PR partiendo de energía ALTA
 * (≥4) vs el resto, para insinuar si entrenar "con pilas" rinde más.
 *
 * @param {Array<object>} workouts
 * @param {(w:object)=>boolean} hadPR
 * @returns {{
 *   highN:number, highPR:number, highPct:number|null,
 *   lowN:number,  lowPR:number,  lowPct:number|null,
 *   enough:boolean
 * }}
 */
export function energyPRCorrelation(workouts, hadPR) {
  let highN = 0, highPR = 0, lowN = 0, lowPR = 0;
  for (const w of (workouts || [])) {
    const e = +(w?.readiness?.energy);
    if (!Number.isFinite(e) || e < 1 || e > 5) continue;
    const pr = !!hadPR(w);
    if (e >= 4) { highN++; if (pr) highPR++; }
    else        { lowN++;  if (pr) lowPR++;  }
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  return {
    highN, highPR, highPct: pct(highPR, highN),
    lowN,  lowPR,  lowPct:  pct(lowPR, lowN),
    // Necesitamos algo de muestra en AMBOS grupos para que el cruce signifique algo.
    enough: highN >= 2 && lowN >= 2,
  };
}
