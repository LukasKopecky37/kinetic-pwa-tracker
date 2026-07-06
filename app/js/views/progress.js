/**
 * Vista Progreso — gráfico de progresión + stats por ejercicio.
 *
 * Stats: última, PR, 1RM estimado, posición media.
 * Banner inferior: sugerencia de próximo peso o advertencia de estancamiento.
 *
 * El chart se destruye/recrea cada render para evitar leaks.
 */

import { $, h, mount } from '../utils/dom.js';
import { roman } from '../utils/roman.js';
import { escapeH } from '../utils/format.js';
import { Store } from '../store/store.js';
import { topWeight, topSet } from '../analytics/prs.js';
import { renderProgressChart } from '../charts/progress.js';
import { renderExerciseVolumeChart } from '../charts/exercise-volume.js';
import { StatsCard } from '../components/StatsCard.js';
import { openTipsModal } from '../services/tips-modal.js';

let chart = null;       // A · fuerza (top set)
let chartVol = null;    // B · volumen total por sesión

export function renderProgress() {
  const sel = $('#progressExercise');
  const cur = sel.value || (Store.exercises()[0] || {}).id;
  sel.innerHTML = Store.exercises().map(e => `<option value="${e.id}">${escapeH(e.name)}</option>`).join('');
  sel.value = cur;
  sel.onchange = () => renderProgress();

  const exId = sel.value;
  const ex   = Store.exerciseById(exId);
  const sessions = Store.sessionsByExercise(exId, true);
  const stats = $('#progressStats');
  const sugBox = $('#suggestionBox');

  // Tarjeta de Notas / Tips — independiente de si hay sesiones registradas
  // (las notas técnicas son útiles incluso antes del primer entreno).
  renderTipsCard(ex);

  if (!ex || sessions.length === 0) {
    mount(stats, h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'Sin datos para este ejercicio.'));
    sugBox.innerHTML = '';
    if (chart)    { chart.destroy();    chart = null; }
    if (chartVol) { chartVol.destroy(); chartVol = null; }
    return;
  }

  const last    = sessions[sessions.length - 1];
  const lastTop = topSet(last);
  const prTop   = sessions.reduce((a, s) => (topWeight(s) > topWeight(a) ? s : a), sessions[0]);
  const oneRM   = Store.best1RMForExercise(exId);
  const avgPos  = Store.avgPosition(exId, 5);
  const stalled = Store.isStalled(exId);

  mount(stats, [
    StatsCard({ label: 'Última',     value: lastTop ? lastTop.weight : '—', unit: lastTop ? 'kg' : '' }),
    StatsCard({ label: 'PR',         value: topWeight(prTop),               unit: 'kg' }),
    StatsCard({ label: '1RM est.',   value: oneRM || '—', unit: oneRM ? 'kg' : '' }),
    StatsCard({ label: 'Pos. media', value: avgPos != null ? roman(Math.round(avgPos)) : '—' }),
  ]);

  const sug = Store.suggestWeight(exId, '8-12');
  const stalledTxt = stalled
    ? '<div class="suggestion" style="background:var(--warn-bg);border-color:var(--warn);color:#fde68a"><span>⚠ Posible estancamiento. Considera <b>descarga</b> o cambio de variante.</span></div>'
    : '';
  sugBox.innerHTML = stalledTxt + (sug && !stalled
    ? `<div class="suggestion"><span>Próxima sesión sugerida: <b>${sug} kg</b></span></div>`
    : '');

  if (chart)    chart.destroy();
  if (chartVol) chartVol.destroy();
  // Modo unilateral estricto: solo activamos charts duales si el ejercicio
  // está marcado Y la sesión tiene datos per-side (mismo guard que la
  // Bitácora). Eso evita pintar una I plana en 0 cuando el usuario marcó
  // unilateral hace 5 minutos y todo el histórico es bilateral.
  const hasSplitData = sessions.some(sess =>
    (sess.sets || []).some(s =>
      !s.warmup && (s.repsL != null || s.repsR != null
                    || s.weightL != null || s.weightR != null)));
  const isUnilateral = !!(ex.unilateralSplit && hasSplitData);
  chart    = renderProgressChart($('#chartCanvas'), sessions, avgPos, { isUnilateral });
  chartVol = renderExerciseVolumeChart($('#volumeCanvas'), sessions, { isUnilateral });
}

/**
 * Tarjeta "Notas · Tips" del ejercicio seleccionado. Lee `ex.tips`. Si hay
 * notas, las muestra; si no, un estado vacío que invita a añadirlas. En ambos
 * casos un botón abre el editor compartido (openTipsModal) y refresca al
 * guardar. Así las notas escritas durante el entreno se leen y editan también
 * desde aquí, fuera del entrenamiento.
 */
function renderTipsCard(ex) {
  const host = $('#progressTips');
  if (!host) return;
  if (!ex) { host.innerHTML = ''; return; }

  const hasTips = !!(ex.tips && ex.tips.trim());
  const edit = () => openTipsModal(ex, () => renderProgress());

  mount(host, h('div', { class: 'pg-tips-card' + (hasTips ? '' : ' empty') },
    h('div', { class: 'pg-tips-head' },
      h('div', { class: 'pg-tips-title' }, '💡 Notas · Tips'),
      h('button', {
        class: 'pg-tips-edit', type: 'button',
        onClick: edit,
      }, hasTips ? 'Editar' : 'Añadir'),
    ),
    hasTips
      ? h('div', { class: 'pg-tips-body' }, ex.tips)
      : h('div', { class: 'pg-tips-empty' },
          'Sin notas todavía. Guarda aquí configuraciones de máquina, claves técnicas o recordatorios de foco para este ejercicio.'),
  ));
}
