/**
 * StatsCard — tarjeta de estadística numérica.
 *
 * Cuadradito con etiqueta arriba ('Última', '1RM est.', 'PR'…) y valor
 * grande debajo, con unidad opcional pequeña.
 *
 * Se usa en Progreso, en el resumen de modales y, próximamente, en el
 * Workout Summary (Fase E).
 */

import { h } from '../utils/dom.js';

/**
 * @param {object} props
 * @param {string}        props.label   texto pequeño superior
 * @param {string|number} props.value   valor principal
 * @param {string}        [props.unit]  unidad pequeña tras el valor (ej. 'kg')
 * @returns {HTMLElement}
 */
export function StatsCard({ label, value, unit }) {
  return h('div', { class: 'stat' },
    h('div', { class: 'lab' }, label),
    h('div', { class: 'val' },
      value,
      unit ? h('small', null, unit) : null,
    ),
  );
}
