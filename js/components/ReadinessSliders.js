/**
 * ReadinessSliders — encuesta pre-workout estilo Whoop/Apple Fitness.
 *
 * 5 escalas con 5 dots cada una: energía, sueño, motivación, fatiga, estrés.
 * Tap en un dot lo selecciona y emite onChange con el snapshot completo.
 *
 * Render auto-contenido en un nodo. El padre solo escucha onChange y, al
 * cerrar, persiste lo que tenga (todas son opcionales).
 *
 * Diseño:
 *   Energía     ○ ○ ● ○ ○
 *   Sueño       ○ ○ ○ ● ○
 *   Motivación  ○ ○ ○ ○ ●
 *   Fatiga      ● ○ ○ ○ ○
 *   Estrés      ○ ● ○ ○ ○
 */

import { h, $$ } from '../utils/dom.js';

const ITEMS = [
  { key: 'energy',     label: 'Energía',     scale: ['ninguna', 'poca', 'normal', 'alta', 'máxima'] },
  { key: 'sleep',      label: 'Sueño',       scale: ['malo', 'pobre', 'normal', 'bueno', 'óptimo'] },
  { key: 'motivation', label: 'Motivación',  scale: ['ninguna', 'baja', 'normal', 'alta', 'máxima'] },
  { key: 'fatigue',    label: 'Fatiga',      scale: ['ninguna', 'leve', 'normal', 'alta', 'máxima'] },
  { key: 'stress',     label: 'Estrés',      scale: ['ninguno', 'leve', 'normal', 'alto', 'máximo'] },
];

/**
 * @param {object} props
 * @param {object} [props.value]   estado inicial {energy, sleep, motivation, fatigue, stress}
 * @param {(values:object)=>void} [props.onChange]
 * @returns {HTMLElement}
 */
export function ReadinessSliders({ value = {}, onChange } = {}) {
  // Estado local (componente con state interno mínimo)
  const state = { ...value };

  const fire = () => onChange && onChange({ ...state });

  const row = (item) =>
    h('div', { class: 'rd-row', dataset: { k: item.key } },
      h('div', { class: 'rd-label' },
        h('span', { class: 'rd-name' }, item.label),
        h('span', { class: 'rd-desc' }, state[item.key] ? item.scale[state[item.key] - 1] : 'sin marcar'),
      ),
      h('div', { class: 'rd-dots' },
        ...[1, 2, 3, 4, 5].map(n =>
          h('button', {
            class: 'rd-dot' + (state[item.key] === n ? ' on' : ''),
            type: 'button',
            dataset: { v: String(n) },
            onClick: () => {
              state[item.key] = n;
              redraw(item.key);
              fire();
            },
          }, ''),
        ),
      ),
    );

  const root = h('div', { class: 'readiness' }, ...ITEMS.map(row));

  // Redibuja una fila concreta sin re-crear el resto
  function redraw(key) {
    const item = ITEMS.find(i => i.key === key);
    const r = root.querySelector(`.rd-row[data-k="${key}"]`);
    if (!r) return;
    r.querySelector('.rd-desc').textContent = state[key] ? item.scale[state[key] - 1] : 'sin marcar';
    $$('.rd-dot', r).forEach((d, i) => {
      d.classList.toggle('on', (i + 1) === state[key]);
    });
  }

  return root;
}
