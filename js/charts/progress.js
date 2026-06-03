/**
 * Gráfico de progresión de un ejercicio (peso del TOP SET a lo largo del tiempo).
 *
 * v6: el "peso de la sesión" es el peso del top set (set más pesado, no warm-up).
 * El tooltip detalla el top set y reps compactas.
 *
 * Colorea puntos según orden (posición) vs media — útil para detectar
 * sesiones hechas en posición tardía.
 */

import { fmtDate } from '../utils/date.js';
import { fmtRepsCompact } from '../utils/format.js';
import { roman } from '../utils/roman.js';
import { topSet } from '../analytics/prs.js';
import { CHART } from './theme.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} sessions  ordenadas por fecha
 * @param {number|null} avgPos
 * @returns {Chart}
 */
export function renderProgressChart(canvas, sessions, avgPos) {
  const ctx = canvas.getContext('2d');
  const tops = sessions.map(topSet);   // pre-compute para el dataset y tooltip

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: sessions.map((s) => fmtDate(s.date)),
      datasets: [{
        label: 'Top set (kg)',
        data: tops.map(t => t ? t.weight : 0),
        borderColor: CHART.accent,
        backgroundColor: CHART.accentFill,
        tension: 0.25, fill: true,
        pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5,
        pointBackgroundColor: sessions.map((s) => {
          if (avgPos == null || s.order == null) return CHART.accent;
          const ref = Math.round(avgPos);
          if (s.order > ref) return CHART.bad;
          if (s.order < ref) return CHART.good;
          return CHART.accent;
        }),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const s = sessions[c.dataIndex];
              const t = tops[c.dataIndex];
              const head = t ? `${t.weight} kg × ${t.reps}` : '—';
              const reps = fmtRepsCompact(s.sets);
              return `${head} · ${reps}${s.order ? ' · pos.' + roman(s.order) : ''}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: CHART.grid }, ticks: { color: CHART.muted, maxRotation: 0 } },
        y: { grid: { color: CHART.grid }, ticks: { color: CHART.muted }, beginAtZero: false },
      },
    },
  });
}
