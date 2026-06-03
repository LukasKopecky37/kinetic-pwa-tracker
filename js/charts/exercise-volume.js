/**
 * Gráfico de VOLUMEN total por sesión de un ejercicio.
 *
 * Volumen = Σ(peso × reps) de todas las series válidas (sin warm-ups).
 * Complementa al gráfico de fuerza: el de fuerza muestra el techo (top set);
 * éste muestra cuánto trabajo acumulaste en cada sesión.
 */

import { fmtDate } from '../utils/date.js';
import { sessionVolume } from '../analytics/volume.js';
import { CHART } from './theme.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} sessions  ordenadas por fecha
 * @returns {Chart}
 */
export function renderExerciseVolumeChart(canvas, sessions) {
  const ctx = canvas.getContext('2d');
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
