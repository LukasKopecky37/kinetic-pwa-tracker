/**
 * Gráfico de DURACIÓN de entrenamiento — minutos totales por semana (barras).
 * Eje X: semana (lunes). Eje Y: minutos. Datos de weeklyDurationMinutes().
 */

import { CHART } from './theme.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{label:string, minutes:number}>} weekly  asc por semana
 * @returns {Chart|null}
 */
export function renderDurationChart(canvas, weekly) {
  if (!canvas) return null;
  const labels = weekly.map(w => w.label);
  const values = weekly.map(w => w.minutes);
  const ctx = canvas.getContext('2d');

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Minutos',
        data: values,
        backgroundColor: CHART.accentFill,
        borderColor: CHART.accent,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const m = c.parsed.y || 0;
              if (m < 60) return `${m} min`;
              const h = Math.floor(m / 60), r = m % 60;
              return `${h}h ${String(r).padStart(2, '0')}min`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: {
          grid: { color: CHART.grid },
          ticks: { color: CHART.muted, callback: (v) => v + '′' },
          beginAtZero: true,
        },
      },
    },
  });
}
