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

/* ============================================================================
 * NOTIFICACIONES LOCALES — ciclo de vida robusto (fix bug 4)
 *
 * Problema reportado: las notificaciones de "descanso terminado" dejaron de
 * salir. Causas que blindamos aquí:
 *   - Permiso bloqueado en estado 'default' por un guard que NUNCA reintentaba
 *     (la antigua _notifPermissionAsked impedía volver a pedir).
 *   - El disparo dependía de un SW que podía no estar listo.
 *   - Sin limpieza de callbacks viejos entre series (listeners zombi).
 *
 * Lo que SÍ se puede en una PWA iOS 16.4+ instalada: mostrar una Notification
 * vía el Service Worker en cuanto el timer llega a 0 (finish). Lo que NO se
 * puede sin backend Web Push: entregar la notificación mientras el JS está
 * suspendido (pantalla bloqueada largo rato). En primer plano iOS suele
 * suprimir el banner de PWA → por eso mantenemos toast+beep+vibración como
 * feedback garantizado en foreground.
 * ========================================================================== */

/** ¿El navegador soporta notificaciones? */
function notifSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Pide permiso de notificación. DEBE invocarse desde un gesto del usuario
 * (un click) para que iOS muestre el prompt. Reintenta mientras el estado
 * sea 'default' (sin el guard roto anterior). Devuelve el permiso final.
 */
async function ensureNotificationPermission() {
  if (!notifSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Muestra la notificación de fin de descanso. Reevalúa permiso en caliente
 * y prefiere el SW (banner persistente, puede salir con la app en segundo
 * plano); si no hay SW, cae a la Notification directa.
 */
async function fireRestEndedNotification(exName) {
  if (!notifSupported()) return;
  if (Notification.permission !== 'granted') return;
  const payload = {
    body: 'Es hora de tu siguiente serie. ¡A por ello!'
          + (exName ? '\n' + exName : ''),
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'rest-ended',                  // reemplaza la anterior en la bandeja
    renotify: true,
    requireInteraction: false,
    silent: false,                      // ← sonido del SO (equivalente a .sound)
    vibrate: [200, 100, 200],           // patrón en plataformas que lo soporten
    data: { kind: 'rest-ended', when: Date.now() },
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && reg.showNotification) {
        await reg.showNotification('¡Descanso terminado!', payload);
        return;
      }
    }
    // Fallback directo (foreground en plataformas que lo permitan).
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
  endAt: 0,         // timestamp objetivo (ms) — fuente de verdad
  _finishTO: null,  // timeout del auto-ocultar (evita "timer fantasma")
  _onComplete: null, // callback one-shot: se dispara al COMPLETAR/SALTAR el
                     // descanso (no al matar el timer por fin de entreno).
                     // Lo usa el flujo de bi-serie para volver al ejercicio A.

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

  /**
   * Arranca un descanso.
   * @param {number} seconds
   * @param {string} exName
   * @param {Function} [onComplete] callback one-shot que se dispara cuando el
   *        descanso TERMINA (timer a 0) o el usuario pulsa "Saltar". NO se
   *        dispara si el timer se mata por fin/cancelación de entrenamiento.
   */
  start(seconds, exName, onComplete) {
    this.total = seconds;
    this.endAt = Date.now() + seconds * 1000;
    this.remaining = seconds;
    this.exName = exName || 'Descanso';
    // LIMPIEZA de listeners viejos ANTES de armar el nuevo descanso
    // (requisito bug 4: no acumular callbacks/timeouts zombi entre series).
    this._onComplete = typeof onComplete === 'function' ? onComplete : null;
    if (this._finishTO) { clearTimeout(this._finishTO); this._finishTO = null; }
    this.show();
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), 1000);
    this.render();

    // Permiso de notificación: lazy en el primer start (gesto de usuario).
    ensureNotificationPermission().catch(() => {});
  },

  /** Dispara (una sola vez) el callback de finalización y lo limpia. */
  _fireComplete() {
    const cb = this._onComplete;
    this._onComplete = null;
    if (typeof cb === 'function') {
      try { cb(); } catch (e) { console.warn('[restTimer] onComplete error', e); }
    }
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
    // Bi-serie: vuelta automática al ejercicio A (se dispara una vez).
    this._fireComplete();
    if (this._finishTO) clearTimeout(this._finishTO);
    this._finishTO = setTimeout(() => this.stop(), 1500);
  },

  /**
   * "Saltar": el usuario corta el descanso a propósito. Termina el timer YA
   * y dispara el onComplete (igual que un finish natural) → en una bi-serie
   * eso vuelve al ejercicio A. NO suena ni notifica (fue una acción manual).
   */
  skip() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this._finishTO) { clearTimeout(this._finishTO); this._finishTO = null; }
    this.remaining = 0;
    $('#restPanel').classList.remove('show');
    this.notify();
    this._fireComplete();
  },

  /**
   * Kill SILENCIOSO del timer — usado al terminar/cancelar el entrenamiento.
   * A diferencia de skip(), NO dispara onComplete (no queremos un salto de
   * bi-serie cuando el entreno se está cerrando) y DESCARTA el callback
   * pendiente para que no se ejecute más tarde sobre un overlay cerrado.
   */
  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this._finishTO) { clearTimeout(this._finishTO); this._finishTO = null; }
    this._onComplete = null;
    $('#restPanel').classList.remove('show');
    this.notify();
  },

  /** Pide permiso de notificaciones (envuelve el helper para uso externo). */
  requestNotifications() {
    return ensureNotificationPermission();
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
    // "Saltar" del panel fijo = skip() → corta el descanso y dispara el
    // onComplete (vuelta de bi-serie). Antes llamaba a stop() (silencioso),
    // por eso el retorno automático no ocurría al saltar manualmente.
    $('#rpStop').addEventListener('click',  () => this.skip());
    // Al desbloquear el móvil / volver a la app, recalcula al instante.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.intervalId) this.tick();
    });
  },
};
