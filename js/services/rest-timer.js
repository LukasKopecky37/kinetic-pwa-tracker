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
 *   - tras 1.5s, oculta el panel.
 */

import { $ } from '../utils/dom.js';
import { fmtMMSS } from '../utils/format.js';
import { beepEndOfRest } from './audio.js';
import { vibrate } from './haptics.js';
import { toast } from './toast.js';

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
