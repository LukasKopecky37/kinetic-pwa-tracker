/**
 * Gráfico de volumen semanal por grupo muscular (barras).
 *
 * Color de las barras según el rango recomendado de series por grupo/semana:
 *  - < 10 series → warn (poco)
 *  - 10..20      → good
 *  - > 20        → bad (probable sobrecarga)
 */

import { CHART } from './theme.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object<string, number>} setsByGroup  ej: { Pecho: 12, Espalda: 18 }
 * @returns {Chart}
 */
export function renderVolumeChart(canvas, setsByGroup) {
  const labels = Object.keys(setsByGroup);
  const values = labels.map((l) => setsByGroup[l]);
  const ctx = canvas.getContext('2d');

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Series últimos 7 días',
        data: values,
        backgroundColor: values.map((v) =>
          v < 10 ? CHART.warn : v > 20 ? CHART.bad : CHART.good
        ),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y} series` } },
      },
      scales: {
        x: { grid: { display: false },    ticks: { color: CHART.muted } },
        y: { grid: { color: CHART.grid }, ticks: { color: CHART.muted }, beginAtZero: true },
      },
    },
  });
}
