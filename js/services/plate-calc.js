/**
 * PlateCalc — calculadora de discos para barra olímpica.
 *
 * Función pura: in (peso total, peso barra) → out (discos por lado).
 * El modal/visualización vive en /js/views/.
 */

const PLATES = [20, 15, 10, 5, 2.5, 1.25];

/**
 * @param {number} weight   peso total objetivo en kg
 * @param {number} [barWeight=20]  peso de la barra
 * @returns {{ perSide: number[], leftover?: number, over?: boolean }}
 */
export function compute(weight, barWeight) {
  barWeight = barWeight || 20;
  const total = weight - barWeight;
  if (total <= 0) return { perSide: [], over: total < 0 };

  const result = [];
  let rem = total / 2;
  PLATES.forEach((p) => {
    const n = Math.floor(rem / p);
    for (let i = 0; i < n; i++) result.push(p);
    rem = +(rem - n * p).toFixed(3);
  });
  return { perSide: result, leftover: rem, over: false };
}

/** Mapa de tamaño de peso → clase CSS. */
export const PLATE_CLASS = {
  20: 'p20',
  15: 'p15',
  10: 'p10',
  5:  'p5',
  2.5: 'p2-5',
  1.25: 'p1-25',
};
