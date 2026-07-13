/**
 * DecisionChip — cartel de la decisión de auto-progresión de un ejercicio.
 *
 * PURAMENTE VISUAL: traduce a lenguaje claro lo que el motor ya decidió
 * (`decisionFromSession` / `decisionFromHistory`). No altera ninguna lógica.
 *
 *   ⬆ Sube +2.5 kg      (standard, decision 'up')
 *   = Mantén            (decision 'hold')
 *   ⬇ Deload −2.5 kg    (standard, decision 'down')
 *   ⬆ Progresa (reps)   (bodyweight up — el peso no cambia)
 *   ⬆ Progresa −2.5 asist. / ⬇ Deload +2.5 asist.  (assisted, dirección invertida)
 *
 * Si el usuario forzó la dirección con las flechas ▲=▼ (`source==='manual'`),
 * el chip lo marca con una pequeña ✋ y lo indica en el title.
 */

import { h } from '../utils/dom.js';

/** Formatea texto + clase + icono a partir del objeto de decisión. */
function chipParts(dec) {
  const kg = Math.abs(dec.deltaKg || 0);
  const bw = dec.type === 'bodyweight';
  const asst = dec.type === 'assisted';

  if (dec.decision === 'up') {
    const text = bw ? 'Progresa'
               : asst ? `Progresa −${kg} asist.`
               : `Sube +${kg} kg`;
    return { cls: 'up', icon: '⬆', text };
  }
  if (dec.decision === 'down') {
    const text = bw ? 'Baja'
               : asst ? `Deload +${kg} asist.`
               : `Deload −${kg} kg`;
    return { cls: 'down', icon: '⬇', text };
  }
  return { cls: 'hold', icon: '=', text: 'Mantén' };
}

/**
 * @param {object|null} dec  objeto de decisionFromSession/History (o null)
 * @returns {HTMLElement|null}
 */
export function DecisionChip(dec) {
  if (!dec) return null;
  const p = chipParts(dec);
  const manual = dec.source === 'manual';
  return h('span', {
    class: `prog-chip ${p.cls}${manual ? ' manual' : ''}`,
    title: manual
      ? 'Ajuste manual para la próxima sesión (flechas ▲ = ▼)'
      : 'Decisión automática del motor de progresión',
  },
    h('span', { class: 'pc-icon', 'aria-hidden': 'true' }, p.icon),
    h('span', { class: 'pc-text' }, p.text),
    manual ? h('span', { class: 'pc-manual', 'aria-hidden': 'true' }, '✋') : null,
  );
}
