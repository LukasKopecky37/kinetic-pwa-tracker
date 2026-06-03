/**
 * Análisis de músculos trabajados.
 *
 * Pequeña capa pura para mapear "lo que toca hoy" a regiones del SVG.
 * Mantenerla fuera de `components/muscle-map.js` separa "qué músculos
 * están activos" (analítica) de "cómo se dibujan" (componente).
 */

import { MUSCLE_MAP } from '../constants.js';

/**
 * @param {Array<{exerciseId:string}>} items   items de la rutina filtrados
 *                                              por día (lo que se entrena hoy)
 * @param {(id:string)=>object|undefined} byId  lookup ejercicio por id
 * @returns {string[]}  claves de región: 'chest', 'lats', 'biceps', etc.
 */
export function activeMuscles(items, byId) {
  const set = new Set();
  for (const it of items) {
    const ex = byId(it.exerciseId);
    if (!ex) continue;
    (MUSCLE_MAP[ex.group] || []).forEach(r => set.add(r));
  }
  return [...set];
}
