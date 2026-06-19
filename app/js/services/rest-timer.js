/**
 * RestTimer — temporizador de descanso global con panel circular.
 *
 * Estado vive en el módulo (singleton). El DOM del panel (#restPanel)
 * existe en index.html. `bind()` engancha los botones +/-/stop.
 *
 * Cuando termina:
 *   - vibra
 *   - emite un pitido
 *   - muestra toast 'Descanso terminado'
 *   - dispara una Notification del sistema (si hay permiso) — refactor v55
 *   - tras 1.5s, oculta el panel.
 *
 * Limitaciones honestas sobre notificaciones en iOS PWA:
 *   - iOS 16.4+ con la PWA instalada (Añadir a pantalla de inicio) sí
 *     permite Notification API.
 *   - SIN backend de push, programar una notificación PARA EL FUTURO
 *     mientras la app está cerrada no es posible (no hay Web Push
 *     server-side). Lo que SÍ funciona:
 *       a) Si la PWA sigue en segundo plano con el SW activo, la
 *          Notification se dispara inmediatamente cuando el setTimeout
 *          se cumple (puede sufrir si iOS suspende el SW).
 *       b) Si la PWA está en primer plano, se dispara seguro.
 *   - Live Activities y Local Notifications con scheduler nativo son
 *     APIs iOS exclusivas para apps nativas Swift — no disponibles a
 *     PWAs. Documentado para no prometer lo imposible.
 */

import { $ } from '../utils/dom.js';
import { fmtMMSS } from '../utils/format.js';
import { beepEndOfRest } from './audio.js';
import { vibrate } from './haptics.js';
import { toast } from './toast.js';

/* Estado del permiso (lo pedimos lazy en el primer start con notificaciones
 * habilitadas, no al cargar la app — Apple HIG y mejor UX). */
let _notifPermissionAsked = false;

async function ensureNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  if (_notifPermissionAsked) return Notification.permission;
  _notifPermissionAsked = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function fireRestEndedNotification(exName) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const payload = {
    body: '¡A por tu siguiente serie!' + (exName ? ' · ' + exName : ''),
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'rest-ended',                  // reemplaza notificaciones anteriores
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: { kind: 'rest-ended', when: Date.now() },
  };
  try {
    // Preferimos el SW (puede mostrar notificaciones aunque la pestaña
    // esté en segundo plano); si no hay SW activo, usamos la API directa.
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg) { reg.showNotification('¡Descanso terminado!', payload); return; }
    }
    new Notification('¡Descanso terminado!', payload);
  } catch (err) {
    console.warn('[restTimer] Notification fallback failed:', err);
  }
}

// Perímetro del círculo SVG (r=27 → 2π·r ≈ 169.6).
const RING_CIRC = 169.6;

export const RestTimer = {
  total: 0,
  remaining: 0,
  intervalId: null,
  exName: '',
  endAt: 0,        // timestamp objetivo (ms) — fuente de verdad
  _finishTO: null, // timeout del auto-ocultar (evita "timer fantasma")

  /* Suscriptores externos (p.ej. el timer grande del player). Cada uno
   * recibe el estado en cada tick / start / stop / finish. El panel fijo
   * de index.html sigue funcionando aparte; esto solo es un espejo. */
  subscribers: new Set(),
  subscribe(fn) { this.subscribers.add(fn); fn(this.snapshot()); },
  unsubscribe(fn) { this.subscribers.delete(fn); },
  snapshot() {
    return {
      remaining: this.remaining,
      total: this.total,
      exName: this.exName,
      running: !!this.intervalId,
    };
  },
  notify() { this.subscribers.forEach(fn => fn(this.snapshot())); },

  start(seconds, exName) {
    this.total = seconds;
    this.endAt = Date.now() + seconds * 1000;
    this.remaining = seconds;
    this.exName = exName || 'Descanso';
    if (this._finishTO) { clearTimeout(this._finishTO); this._finishTO = null; }
    this.show();
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), 1000);
    this.render();

    // Notification: pide permiso lazy en el primer start. Si concedido,
    // sabemos por el flanco running→idle del finish() que toca lanzar.
    // No PROGRAMAMOS una notificación con setTimeout aparte porque iOS
    // PWA puede suspender el setInterval y la salida correcta sigue
    // siendo el evento finish() que ya tenemos.
    ensureNotificationPermission().catch(() => {});
  },

  /* Recalcula SIEMPRE desde el reloj real: si iOS pausó/throttleó el
   * setInterval mientras la pantalla estaba bloqueada entre series, al
   * volver el tiempo restante es correcto (no se queda colgado/desfasado). */
  tick() {
    if (!this.intervalId) return;
    this.remaining = Math.round((this.endAt - Date.now()) / 1000);
    if (this.remaining <= 0) this.finish();
    else this.render();
  },

  finish() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.remaining = 0;
    this.render();
    vibrate([200, 100, 200]);
    beepEndOfRest();
    toast('Descanso terminado', 'pr');
    // Notificación del sistema (cuando hay permiso) — gancho extra para
    // que el usuario sepa que terminó incluso si tiene el iPhone abajo
    // o ha cambiado a otra app. Best-effort: si no hay permiso o el SO
    // suspendió la pestaña antes de tiempo, se cae graceful.
    fireRestEndedNotification(this.exName);
    if (this._finishTO) clearTimeout(this._finishTO);
    this._finishTO = setTimeout(() => this.stop(), 1500);
  },

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this._finishTO) { clearTimeout(this._finishTO); this._finishTO = null; }
    $('#restPanel').classList.remove('show');
    this.notify();
  },

  add(seconds) {
    this.endAt += seconds * 1000;
    this.remaining = Math.round((this.endAt - Date.now()) / 1000);
    if (this.remaining <= 0) { this.finish(); return; }
    this.total = Math.max(this.total, this.remaining);
    this.render();
  },

  show() {
    $('#restPanel').classList.add('show');
  },

  render() {
    $('#rpTime').textContent = fmtMMSS(this.remaining);
    $('#rpName').textContent = this.exName;
    $('#rpSub').textContent  = `de ${fmtMMSS(this.total)} totales`;
    const off = RING_CIRC * (1 - this.remaining / this.total);
    $('#rpFg').setAttribute('stroke-dashoffset', off);
    this.notify();
  },

  bind() {
    $('#rpPlus').addEventListener('click',  () => this.add(15));
    $('#rpMinus').addEventListener('click', () => this.add(-15));
    $('#rpStop').addEventListener('click',  () => this.stop());
    // Al desbloquear el móvil / volver a la app, recalcula al instante.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.intervalId) this.tick();
    });
  },
};
