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
import { topSet, topSetSide } from '../analytics/prs.js';
import { CHART } from './theme.js';

/* Color del lado IZQUIERDO en charts duales. Reutilizado en exercise-volume.js
 * para consistencia visual entre "fuerza" y "volumen". Azul cyan moderno
 * que contrasta limpio con el naranja accent del lado derecho. */
const LEFT_COLOR      = '#60a5fa';
const LEFT_COLOR_FILL = 'rgba(96,165,250,.10)';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} sessions  ordenadas por fecha
 * @param {number|null} avgPos
 * @param {{isUnilateral?:boolean}} [opts]  cuando es true, renderiza DOS
 *        líneas independientes (I = Izquierda en azul, D = Derecha en naranja)
 *        en vez de una sola con el top set bilateral.
 * @returns {Chart}
 */
export function renderProgressChart(canvas, sessions, avgPos, opts = {}) {
  const ctx = canvas.getContext('2d');

  /* ---------------------------------------------------------------------
   * Modo UNILATERAL: dos datasets independientes I + D.
   * Cada uno usa su propio topSetSide(side) → si una sesión solo registró
   * un lado (sets antiguos pre-split), el otro lado queda como `null` y
   * Chart.js con `spanGaps:true` une los puntos saltando huecos sin
   * inventar un cero (que destrozaría la línea visualmente).
   * ------------------------------------------------------------------- */
  if (opts.isUnilateral) {
    const labels = sessions.map((s) => fmtDate(s.date));
    const topsL = sessions.map(s => topSetSide(s, 'L'));
    const topsR = sessions.map(s => topSetSide(s, 'R'));

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'I (Izquierda)',
            data: topsL.map(t => t ? t.weight : null),
            borderColor: LEFT_COLOR,
            backgroundColor: LEFT_COLOR_FILL,
            tension: 0.25, fill: false,
            pointRadius: 3.5, pointHoverRadius: 6, borderWidth: 2.5,
            pointBackgroundColor: LEFT_COLOR,
            spanGaps: true,
          },
          {
            label: 'D (Derecha)',
            data: topsR.map(t => t ? t.weight : null),
            borderColor: CHART.accent,
            backgroundColor: CHART.accentFill,
            tension: 0.25, fill: false,
            pointRadius: 3.5, pointHoverRadius: 6, borderWidth: 2.5,
            pointBackgroundColor: CHART.accent,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true, position: 'top', align: 'end',
            labels: {
              color: CHART.muted, usePointStyle: true, pointStyle: 'circle',
              boxWidth: 8, padding: 10, font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (c) => {
                const side = c.datasetIndex === 0 ? 'I' : 'D';
                const top = c.datasetIndex === 0
                  ? topsL[c.dataIndex] : topsR[c.dataIndex];
                if (!top) return ` ${side}: —`;
                return ` ${side}: ${top.weight} kg × ${top.reps}`;
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

  /* ---------------------------------------------------------------------
   * Modo BILATERAL clásico (default): una sola línea con el top set por
   * sesión. Inalterado respecto a la versión previa.
   * ------------------------------------------------------------------- */
  const tops = sessions.map(topSet);

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
