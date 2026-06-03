/**
 * Modal — overlay único. Las vistas le pasan HTML completo (head/body/foot).
 *
 * Limitación actual: usa innerHTML. Fase C lo migrará a aceptar nodos DOM
 * (mismo API). Mantenemos la firma para no romper el resto del código.
 */

import { $ } from '../utils/dom.js';

export function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modalBg').classList.add('show');
}

export function closeModal() {
  $('#modalBg').classList.remove('show');
}

/** Cierra al pulsar fuera del modal. Se llama una sola vez desde el init. */
export function bindModalDismiss() {
  $('#modalBg').addEventListener('click', (e) => {
    if (e.target.id === 'modalBg') closeModal();
  });
}
