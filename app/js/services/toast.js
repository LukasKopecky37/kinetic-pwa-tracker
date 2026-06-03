/**
 * Toast — notificación efímera en la parte inferior de la pantalla.
 * Singleton (un solo elemento DOM compartido).
 *
 * Kinds soportados: '' (default), 'pr', 'bad'.
 */

import { $ } from '../utils/dom.js';

const HIDE_MS = 2400;

export function toast(msg, kind) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (kind ? (' ' + kind) : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, HIDE_MS);
}
