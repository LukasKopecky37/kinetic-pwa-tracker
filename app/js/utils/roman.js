import { ROMAN } from '../constants.js';

/**
 * Convierte 1..20 en numeral romano. Fuera de rango devuelve el número
 * como string, o '—' si es falsy.
 * @param {number|null|undefined} n
 */
export const roman = (n) =>
  (n > 0 && n <= 20) ? ROMAN[n - 1] : (n ? String(n) : '—');
