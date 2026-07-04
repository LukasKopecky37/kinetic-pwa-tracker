/**
 * RestTimer — temporizador de descanso global con panel circular.
 *
 * Estado vive en el módulo (singleton). El DOM del panel (#restPanel)
 * existe en index.html. `bind()` engancha los botones +/-/stop.
 *
 * Arquitectura de notificación (v60): programación a nivel de SO cuando el
 * navegador la soporta (Notification Triggers / TimestampTrigger, Chromium),
 * con reprogramación estricta en cada ±15 / Saltar. En iOS (sin ese API y
 * sin backend push) se degrada con honestidad: el timer es wall-clock y
 * recalcula al volver de segundo plano. Detalle completo en el bloque de
 * NOTIFICACIONES más abajo.
 */

import { $ } from '../utils/dom.js';
import { fmtMMSS } from '../utils/format.js';
import { beepEndOfRest } from './audio.js';
import { vibrate } from './haptics.js';
import { toast } from './toast.js';
import { scheduleRestPush, cancelRestPush } from './push.js';

/* ============================================================================
 * NOTIFICACIONES DE FIN DE DESCANSO — programación a nivel de SO (v60)
 *
 * ── LA REALIDAD DE PLATAFORMA (importante) ─────────────────────────────────
 * El bug reportado (la notificación no salta con la app minimizada y se
 * dispara "toda de golpe" al reabrir) es INHERENTE a las PWAs en iOS: cuando
 * la app pasa a segundo plano, WebKit SUSPENDE el JS (setInterval/setTimeout
 * se congelan). Para despertar una PWA suspendida en iOS hace falta un PUSH
 * de servidor (Web Push vía APNs → requiere backend) o envolver la app en un
 * contenedor nativo (Capacitor/Swift con UNUserNotificationCenter). El API
 * web de "notificación programada a un timestamp" (Notification Triggers /
 * TimestampTrigger) SOLO existe en Chromium (Android/desktop Chrome); Safari
 * NO lo implementa. No hay forma client-side de sortear esto en iOS.
 *
 * ── LO QUE HACE ESTE MÓDULO ────────────────────────────────────────────────
 *   1. Si el navegador SÍ soporta TimestampTrigger (Android/Chrome): programa
 *      la notificación en la cola del SO para `endAt`. El SO la entrega SOLO
 *      con la app en segundo plano — supervivencia real a la suspensión.
 *   2. Reprogramación estricta: cada ± 15 s o "Saltar" cancela la notif
 *      pendiente (mismo tag) y agenda una nueva con el nuevo `endAt`.
 *   3. En iOS (sin TimestampTrigger): degradamos con honestidad — el timer
 *      wall-clock recalcula al volver (visibilitychange) y `finish()` da el
 *      feedback in-app; NO se emite un banner tardío inútil.
 *   4. Foreground: si el timer termina con la app visible, feedback in-app
 *      (beep + vibración + toast) y se CIERRA cualquier banner del SO para no
 *      duplicar (equivalente a preferir presentación in-app sobre el banner).
 * ========================================================================== */

const NOTIF_TAG = 'rest-ended';

/** ¿El navegador soporta notificaciones? */
function notifSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** ¿Soporta programación a futuro a nivel de SO (Notification Triggers)? */
function supportsTrigger() {
  return typeof window !== 'undefined' && typeof window.TimestampTrigger === 'function';
}

/**
 * Pide permiso de notificación. DEBE invocarse desde un gesto del usuario
 * (un click) para que iOS muestre el prompt. Reintenta mientras el estado
 * sea 'default'. Devuelve el permiso final.
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

/** Registration del SW lista, o null. */
async function swReg() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready.catch(() => null);
}

/** Payload común de la notificación de fin de descanso. */
function restPayload(exName, extra) {
  return {
    body: 'Es hora de tu siguiente serie. ¡A por ello!'
          + (exName ? '\n' + exName : ''),
    icon: './icon.svg',
    badge: './icon.svg',
    tag: NOTIF_TAG,                     // un único tag → reemplazo/cancelación
    renotify: true,
    requireInteraction: false,
    silent: false,                      // sonido del SO (equivalente a .sound)
    vibrate: [200, 100, 200],
    data: { kind: 'rest-ended' },
    ...extra,
  };
}

/**
 * Programa la notificación en el SO para `fireAtMs` (timestamp absoluto).
 * Cancela primero cualquier notif pendiente con el mismo tag (reschedule
 * limpio). Devuelve true si de verdad quedó PROGRAMADA a nivel de SO
 * (solo posible con TimestampTrigger), false en caso contrario.
 *
 * @returns {Promise<boolean>}
 */
async function scheduleRestNotification(fireAtMs, exName) {
  await cancelScheduledRestNotification();
  if (!notifSupported() || Notification.permission !== 'granted') return false;
  if (!supportsTrigger()) return false;              // iOS/Safari → no-op honesto
  const reg = await swReg();
  if (!reg || !reg.showNotification) return false;
  try {
    await reg.showNotification('¡Descanso terminado!',
      restPayload(exName, { showTrigger: new window.TimestampTrigger(fireAtMs) }));
    return true;
  } catch (err) {
    console.warn('[restTimer] showTrigger schedule failed:', err);
    return false;
  }
}

/**
 * Cancela cualquier notificación de descanso pendiente o ya mostrada (mismo
 * tag). Se usa al reprogramar (± 15), al saltar, al terminar en foreground y
 * al matar el timer por fin de entrenamiento.
 */
async function cancelScheduledRestNotification() {
  const reg = await swReg();
  if (!reg || !reg.getNotifications) return;
  try {
    // includeTriggered:true → también las ya disparadas que sigan en bandeja.
    const list = await reg.getNotifications({ tag: NOTIF_TAG, includeTriggered: true });
    list.forEach(n => n.close());
  } catch (err) {
    console.warn('[restTimer] cancel schedule failed:', err);
  }
}

/**
 * Muestra una notificación INMEDIATA (best-effort). Solo se usa como último
 * recurso cuando NO hubo programación de SO y el timer terminó con la app en
 * segundo plano (p.ej. Android sin Triggers). En iOS con JS suspendido esto
 * nunca llega a ejecutarse a tiempo — por eso no dependemos de ello.
 */
async function fireRestEndedNotification(exName) {
  if (!notifSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await swReg();
    if (reg && reg.showNotification) {
      await reg.showNotification('¡Descanso terminado!', restPayload(exName));
      return;
    }
    new Notification('¡Descanso terminado!', restPayload(exName));
  } catch (err) {
    console.warn('[restTimer] immediate notification failed:', err);
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
  _scheduled: false, // ¿hay una notificación programada a nivel de SO?
                     // (solo true en navegadores con TimestampTrigger). Guía
                     // la decisión de finish() (foreground vs background).

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

    // Programación de la notificación de fondo (prefiere PUSH de servidor;
    // fallback a Notification Triggers). `_scheduled` lo fija el helper.
    this._scheduled = false;
    this._scheduleBackground(seconds, this.exName);
  },

  /**
   * Programa la notificación de fin de descanso para que llegue AUNQUE la
   * app esté en segundo plano / el móvil bloqueado.
   *   1º · PUSH de servidor (push.js → /api/schedule → QStash → APNs). Es lo
   *        único que funciona con la pantalla bloqueada en iOS.
   *   2º · Fallback: Notification Triggers a nivel de SO (Chromium/Android).
   *        En iOS es no-op → dependemos de finish() al volver a foreground.
   * @param {number} delaySeconds
   * @param {string} exName
   */
  _scheduleBackground(delaySeconds, exName) {
    return ensureNotificationPermission()
      .then(p => {
        if (p !== 'granted') { this._scheduled = false; return; }
        return scheduleRestPush(delaySeconds, exName).then(pushed => {
          if (pushed) { this._scheduled = true; return; }
          return scheduleRestNotification(this.endAt, this.exName)
            .then(ok => { this._scheduled = ok; });
        });
      })
      .catch(() => { this._scheduled = false; });
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
    // Feedback in-app SIEMPRE: en foreground es lo que el usuario oye/siente.
    vibrate([200, 100, 200]);
    beepEndOfRest();
    toast('Descanso terminado', 'pr');

    const visible = (typeof document !== 'undefined')
      && document.visibilityState === 'visible';
    if (visible) {
      // Foreground: preferimos presentación in-app → cancelamos el push de
      // servidor programado y cerramos cualquier banner del SO (no duplicar).
      cancelRestPush();
      cancelScheduledRestNotification();
    } else if (!this._scheduled) {
      // Background SIN programación de SO (Android sin Triggers, o el JS
      // corrió justo al reanudar): intento inmediato best-effort.
      fireRestEndedNotification(this.exName);
    }
    // Si _scheduled y estamos en background → el SO ya la entregó a tiempo.
    this._scheduled = false;

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
    // Cleanup estricto: cancela el push de servidor Y la notif del SO.
    cancelRestPush();
    cancelScheduledRestNotification();
    this._scheduled = false;
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
    cancelRestPush();
    cancelScheduledRestNotification();
    this._scheduled = false;
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
    // Reprogramación ESTRICTA (± 15): reprograma la notif de fondo (push o
    // trigger) con el nuevo tiempo restante. Los helpers cancelan la anterior.
    this._scheduleBackground(this.remaining, this.exName);
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
