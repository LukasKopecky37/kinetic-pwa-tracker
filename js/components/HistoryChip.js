/**
 * HistoryChip — chip horizontal del historial (v6).
 *
 * Muestra el TOP SET de la sesión (peso · reps de la mejor serie) y un
 * pie con la lista compacta de todas las series (si todas comparten peso,
 * solo reps; si varían, peso×reps).
 *
 *   ┌───────────┐
 *   │  04.5     │     ← fecha (D.M)
 *   │  80 kg    │     ← top set weight
 *   │  ×10      │     ← top set reps (o "12·10·8" si comparte peso)
 *   │  pos.I    │     ← posición opcional
 *   └───────────┘
 *
 * El color de fondo lo decide el caller pasando `trend` ('up'|'down'|'').
 */

import { h } from '../utils/dom.js';
import { fmtDate } from '../utils/date.js';
import { fmtRepsCompact } from '../utils/format.js';
import { roman } from '../utils/roman.js';
import { topSet } from '../analytics/prs.js';

/**
 * @param {object} props
 * @param {object} props.session
 * @param {''|'up'|'down'} [props.trend]
 * @param {boolean} [props.isPR]
 * @param {(s:object)=>void} [props.onTap]
 * @returns {HTMLElement}
 */
export function HistoryChip({ session, trend = '', isPR = false, onTap }) {
  const cls = `chip${trend ? ' ' + trend : ''}${isPR ? ' pr' : ''}`;
  const top = topSet(session);
  const repsLine = fmtRepsCompact(session.sets);

  return h('div', {
    class: cls,
    dataset: { id: String(session.id), ex: session.exerciseId },
    onClick: () => onTap && onTap(session),
  },
    h('div', { class: 'c-date' },   fmtDate(session.date)),
    h('div', { class: 'c-weight' }, top ? top.weight : '—', h('small', null, 'kg')),
    h('div', { class: 'c-reps' },   repsLine || '—'),
    session.order ? h('div', { class: 'c-pos' }, 'pos.' + roman(session.order)) : null,
  );
}
