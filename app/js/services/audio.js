/**
 * Audio feedback — pitido al terminar el descanso.
 * Sin dependencias externas: usa WebAudio en línea.
 */

export function beepEndOfRest() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.frequency.value = 1100; }, 200);
    setTimeout(() => { o.stop(); ctx.close(); }, 500);
  } catch (_) {
    // Audio bloqueado o no soportado: silencio.
  }
}
