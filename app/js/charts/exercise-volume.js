/**
 * Gráfico de VOLUMEN total por sesión de un ejercicio.
 *
 * Volumen = Σ(peso × reps) de todas las series válidas (sin warm-ups).
 * Complementa al gráfico de fuerza: el de fuerza muestra el techo (top set);
 * éste muestra cuánto trabajo acumulaste en cada sesión.
 */

import { fmtDate } from '../utils/date.js';
import { sessionVolume } from '../analytics/volume.js';
import { sessionVolumeSide } from '../analytics/prs.js';
import { CHART } from './theme.js';

/* Mismos colores que progress.js → I = azul cyan, D = naranja (default).
 * Centralizar el HEX exacto en un solo lugar evitaría duplicación, pero
 * son tan pocos (2) que mantenerlos espejados aquí es más claro. */
const LEFT_COLOR      = '#60a5fa';
const LEFT_COLOR_FILL = 'rgba(96,165,250,.10)';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} sessions  ordenadas por fecha
 * @param {{isUnilateral?:boolean}} [opts]
 * @returns {Chart}
 */
export function renderExerciseVolumeChart(canvas, sessions, opts = {}) {
  const ctx = canvas.getContext('2d');

  /* Modo UNILATERAL: dos líneas de volumen por lado.
   * sessionVolumeSide('L') suma weightL × repsL en cada set de la sesión
   * (con fallback al weight/reps plano cuando falte el campo per-side y
   * exista repsL — coherente con el resto del refactor). */
  if (opts.isUnilateral) {
    const labels = sessions.map(s => fmtDate(s.date));
    const volL = sessions.map(s => sessionVolumeSide(s, 'L'));
    const volR = sessions.map(s => sessionVolumeSide(s, 'R'));

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'I (Izquierda)',
            data: volL.map(v => v > 0 ? v : null),
            borderColor: LEFT_COLOR,
            backgroundColor: LEFT_COLOR_FILL,
            tension: 0.25, fill: false,
            pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5,
            pointBackgroundColor: LEFT_COLOR,
            spanGaps: true,
          },
          {
            label: 'D (Derecha)',
            data: volR.map(v => v > 0 ? v : null),
            borderColor: CHART.accent2,
            backgroundColor: CHART.accent2Fill,
            tension: 0.25, fill: false,
            pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5,
            pointBackgroundColor: CHART.accent2,
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
                const v = c.parsed.y;
                return v == null ? ` ${side}: —` : ` ${side}: ${v} kg·rep`;
              },
            },
          },
        },
        scales: {
          x: { grid: { color: CHART.grid }, ticks: { color: CHART.muted, maxRotation: 0 } },
          y: { grid: { color: CHART.grid }, ticks: { color: CHART.muted }, beginAtZero: true },
        },
      },
    });
  }

  /* Modo BILATERAL clásico — inalterado. */
  const volumes = sessions.map(sessionVolume);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: sessions.map(s => fmtDate(s.date)),
      datasets: [{
        label: 'Volumen (kg·rep)',
        data: volumes,
        borderColor: CHART.accent2,
        backgroundColor: CHART.accent2Fill,
        tension: 0.25, fill: true,
        pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5,
        pointBackgroundColor: CHART.accent2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${volumes[c.dataIndex]} kg·rep`,
          },
        },
      },
      scales: {
        x: { grid: { color: CHART.grid }, ticks: { color: CHART.muted, maxRotation: 0 } },
        y: {
          grid: { color: CHART.grid }, ticks: { color: CHART.muted },
          beginAtZero: true,
        },
      },
    },
  });
}
