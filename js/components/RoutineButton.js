/**
 * RoutineButton — botón grande de selección de rutina en la home.
 *
 * Tres variantes:
 *   - default            → rutina normal con meta a la derecha
 *   - `today: true`      → gradient naranja (el "Hoy" destacado)
 *   - `add: true`        → borde dasheado, sin meta ("+ Nueva rutina")
 *
 * El estilo `suggested` añade el puntito naranja arriba a la derecha.
 */

import { h } from '../utils/dom.js';

/**
 * @param {object} props
 * @param {string}  [props.day]        línea pequeña superior ('Hoy · Lunes', 'Martes · Mar')
 * @param {string}  props.name         título grande
 * @param {string}  [props.group]      línea descriptiva inferior
 * @param {string}  [props.metaLabel]  texto pequeño arriba del meta ('última')
 * @param {string}  [props.meta]       valor del meta ('hace 3 días')
 * @param {boolean} [props.today]      variante "Hoy"
 * @param {boolean} [props.suggested]  punto naranja de sugerencia
 * @param {boolean} [props.add]        variante "+ Nueva rutina"
 * @param {boolean} [props.disabled]
 * @param {() => void} [props.onTap]
 * @returns {HTMLElement}
 */
export function RoutineButton(props) {
  const cls = ['route-btn'];
  if (props.today)     cls.push('today');
  if (props.suggested) cls.push('suggested');
  if (props.add)       cls.push('route-add');

  return h('button', {
    class: cls.join(' '),
    disabled: !!props.disabled,
    onClick: () => !props.disabled && props.onTap && props.onTap(),
  },
    h('div', null,
      props.day   ? h('div', { class: 'r-day' },   props.day)   : null,
                    h('div', { class: 'r-name' },  props.name),
      props.group ? h('div', { class: 'r-group' }, props.group) : null,
    ),
    (props.add || (!props.metaLabel && !props.meta))
      ? null
      : h('div', { class: 'r-meta' },
          props.metaLabel || null,
          props.meta ? h('b', null, props.meta) : null,
        ),
  );
}
