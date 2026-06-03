/**
 * InsightCard — banda visual para un insight (volumen, racha, estancamiento…).
 *
 * Severidad → icono + color de borde lateral.
 * Diseño: tarjeta a ancho completo con franja vertical de color en la izquierda.
 */

import { h } from '../utils/dom.js';

const ICON = { good: '↑', warn: '!', info: '•' };

/**
 * @param {object} props
 * @param {'good'|'warn'|'info'} props.severity
 * @param {string} props.title
 * @param {string} [props.detail]
 * @param {()=>void} [props.onTap]
 * @returns {HTMLElement}
 */
export function InsightCard({ severity, title, detail, onTap }) {
  return h('div', {
    class: `insight insight-${severity}` + (onTap ? ' clickable' : ''),
    onClick: () => onTap && onTap(),
  },
    h('div', { class: 'insight-icon' }, ICON[severity] || '•'),
    h('div', { class: 'insight-body' },
      h('div', { class: 'insight-title' }, title),
      detail ? h('div', { class: 'insight-detail' }, detail) : null,
    ),
  );
}
