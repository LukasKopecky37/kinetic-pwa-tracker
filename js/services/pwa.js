/**
 * Registro del Service Worker.
 * Silencioso si no se soporta. Si hay una versión nueva, avisa con un toast
 * (no recarga solo: nunca interrumpir una serie en el gym).
 */

import { toast } from './toast.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Evita registrar en file:// (donde igualmente no funcionaría)
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // Hay versión nueva instalada y ya había una controlando (no es
          // la primera instalación) → avisar.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nueva versión — recarga para actualizar', 'pr');
          }
        });
      });
    }).catch(err => console.warn('[pwa] registro falló:', err?.message || err));
  });
}
