/**
 * Helpers de formateo.
 *
 * v6: usamos sets[]. Hay tres maneras típicas de renderizar:
 *  - `fmtRepsCompact(sets)`  — '12·10·8·7' si todos comparten peso (más limpio)
 *                              o '70×10·75×10·80×8' si los pesos varían.
 *  - `fmtSetsLong(sets)`     — 'S1 70×10  S2 75×10  S3 80×8' (para detalle).
 *  - `fmtTopSet(top)`        — '80 kg × 8' para el chip principal.
 */

/**
 * Compacto: si todos los sets tienen el mismo peso, oculta el peso y solo
 * separa reps con '·'. Si varían, muestra 'peso×reps' por set.
 * Excluye warm-ups.
 * @param {Array<{weight:number,reps:number,warmup?:boolean}>} sets
 * @returns {string}
 */
export function fmtRepsCompact(sets) {
  const arr = (sets || []).filter(s => !s.warmup && s.reps != null && s.reps !== '');
  if (arr.length === 0) return '';
  const w0 = arr[0].weight;
  const allSameWeight = arr.every(s => s.weight === w0);
  if (allSameWeight) return arr.map(s => s.reps).join('·');
  return arr.map(s => `${s.weight}×${s.reps}`).join(' · ');
}

/**
 * Largo: lista vertical-friendly de sets para modales/resúmenes.
 * Incluye numeración y RPE si existe.
 * @returns {string}  ej. 'S1 70×10  S2 75×10 RPE 8  S3 80×8 RPE 9'
 */
export function fmtSetsLong(sets) {
  const arr = (sets || []).filter(s => s.reps != null);
  return arr.map((s, i) => {
    const base = `S${i + 1} ${s.weight}×${s.reps}`;
    return s.rpe != null ? `${base} · RPE ${s.rpe}` : base;
  }).join('   ');
}

/**
 * Resumen corto del top set: '80 kg × 8'.
 * @param {{weight:number, reps:number}|null} top
 * @returns {string}
 */
export function fmtTopSet(top) {
  if (!top) return '—';
  return `${top.weight} kg × ${top.reps}`;
}

/** Segundos → 'M:SS' */
export function fmtMMSS(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Escape HTML para evitar XSS al usar plantillas con innerHTML. */
export function escapeH(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* -------- Compat con código antiguo (deprecated) -------- */
/** @deprecated usa fmtRepsCompact(sets) o fmtSetsLong(sets) */
export const fmtReps = (arr) =>
  (arr || []).filter(r => r != null && r !== '').join('·');
