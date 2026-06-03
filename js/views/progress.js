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
  chart    = renderProgressChart($('#chartCanvas'), sessions, avgPos);
  chartVol = renderExerciseVolumeChart($('#volumeCanvas'), sessions);
}
