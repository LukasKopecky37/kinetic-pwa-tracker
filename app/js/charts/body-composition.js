/**
 * Body Composition · gráfico de doble eje Y para Peso (kg) + %Grasa.
 *
 * Eje izquierdo (y)  → Peso, color acento naranja.
 * Eje derecho (y1)   → % Grasa, color azul cielo.
 *
 * Una sola línea de tiempo (eje X) para que el usuario lea de un vistazo
 * si está ganando masa magra (peso ↑ + %grasa ↓) o lo contrario.
 *
 * Mantenemos el contrato de los otros charts del proyecto:
 *   - Recibe canvas DOM + dataset; devuelve la instancia para `.destroy()`.
 *   - Chart.js viene del global window.Chart (cargado por CDN en index.html).
 */

import { fmtDate } from '../utils/date.js';

const COLOR_WEIGHT      = '#ff7a2f';
const COLOR_WEIGHT_FILL = 'rgba(255,122,47,.14)';
const COLOR_FAT         = '#60a5fa';
const COLOR_FAT_FILL    = 'rgba(96,165,250,.10)';
const COLOR_GRID        = 'rgba(255,255,255,.05)';
const COLOR_TICK        = '#8a93a3';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{date:string, weight?:number, bodyFat?:number}>} measurements
 *        ordenados ASC por fecha
 * @returns {Chart|null}  null si no hay datos suficientes para dibujar
 */
export function renderBodyCompositionChart(canvas, measurements) {
  if (!canvas) return null;
  // Necesitamos al menos un punto con weight o bodyFat para que algo pinte.
  const usable = (measurements || []).filter(
    m => (m.weight != null && m.weight !== '') ||
         (m.bodyFat != null && m.bodyFat !== ''));
  if (!usable.length) return null;

  const ctx = canvas.getContext('2d');
  const labels = usable.map(m => fmtDate(m.date));
  const weights = usable.map(m => m.weight != null && m.weight !== '' ? +m.weight : null);
  const fats    = usable.map(m => m.bodyFat != null && m.bodyFat !== '' ? +m.bodyFat : null);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Peso',
          data: weights,
          borderColor: COLOR_WEIGHT,
          backgroundColor: COLOR_WEIGHT_FILL,
          yAxisID: 'y',
          tension: 0.32,
          fill: true,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: COLOR_WEIGHT,
          pointBorderColor: '#1a0a00',
          pointBorderWidth: 1.5,
          spanGaps: true,
        },
        {
          label: '% Grasa',
          data: fats,
          borderColor: COLOR_FAT,
          backgroundColor: COLOR_FAT_FILL,
          yAxisID: 'y1',
          tension: 0.32,
          fill: false,
          borderWidth: 2,
          borderDash: [5, 4],          // grasa con línea discontinua suave
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: COLOR_FAT,
          pointBorderColor: '#0b1224',
          pointBorderWidth: 1.5,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { color: COLOR_GRID, drawTicks: false },
          ticks: {
            color: COLOR_TICK,
            font: { size: 10 },
            maxTicksLimit: 6,
            autoSkip: true,
          },
          border: { display: false },
        },
        y: {
          position: 'left',
          beginAtZero: false,
          grid: { color: COLOR_GRID, drawTicks: false },
          ticks: {
            color: COLOR_WEIGHT,
            font: { size: 10 },
            padding: 6,
          },
          title: {
            display: true,
            text: 'kg',
            color: COLOR_WEIGHT,
            font: { size: 10, weight: '700' },
          },
          border: { display: false },
        },
        y1: {
          position: 'right',
          beginAtZero: false,
          grid: { drawOnChartArea: false },
          ticks: {
            color: COLOR_FAT,
            font: { size: 10 },
            padding: 6,
          },
          title: {
            display: true,
            text: '%',
            color: COLOR_FAT,
            font: { size: 10, weight: '700' },
          },
          border: { display: false },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#a8a8ad',
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            padding: 12,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,17,21,.96)',
          borderColor: 'rgba(255,255,255,.08)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleColor: '#f5f5f7',
          titleFont: { size: 11, weight: '700' },
          bodyColor: '#a8a8ad',
          bodyFont: { size: 11 },
          callbacks: {
            label: (item) => {
              const v = item.parsed.y;
              if (v == null) return null;
              const isWeight = item.datasetIndex === 0;
              return ' ' + item.dataset.label + ': ' + v +
                (isWeight ? ' kg' : ' %');
            },
          },
        },
      },
    },
  });
}
