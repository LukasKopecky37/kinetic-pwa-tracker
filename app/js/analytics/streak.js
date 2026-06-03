/**
 * Racha de entrenamiento y consistencia semanal.
 *
 * Funciones puras: solo leen sesiones.
 */

import { todayISO } from '../utils/date.js';

/** Días únicos con al menos una sesión, ordenados ascendente. */
function distinctTrainingDays(sessions) {
  return [...new Set(sessions.map(s => s.date))].sort();
}

/**
 * Racha de días consecutivos entrenando hasta hoy (o ayer).
 * Si hoy o ayer no hay sesión, devuelve la racha más reciente que se
 * extiende hasta uno de esos dos días. Si no hay sesiones recientes,
 * devuelve 0.
 *
 * @param {Array<{date:string}>} sessions
 * @returns {number}
 */
export function streakDays(sessions) {
  const days = distinctTrainingDays(sessions);
  if (!days.length) return 0;

  // Se cuenta si el último día es hoy o ayer
  const today = todayISO();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = yesterday.toISOString().slice(0, 10);

  const last = days[days.length - 1];
  if (last !== today && last !== yISO) return 0;

  // Cuenta hacia atrás desde `last` mientras los días sean consecutivos
  let count = 1;
  let cursor = new Date(last);
  for (let i = days.length - 2; i >= 0; i--) {
    cursor.setDate(cursor.getDate() - 1);
    const expected = cursor.toISOString().slice(0, 10);
    if (days[i] === expected) count++;
    else break;
  }
  return count;
}

/**
 * Días distintos entrenados en los últimos N días.
 * @param {Array<{date:string}>} sessions
 * @param {number} [n=7]
 * @returns {number}
 */
export function daysTrainedInLastN(sessions, n = 7) {
  const cutoff = new Date(todayISO());
  cutoff.setDate(cutoff.getDate() - (n - 1));
  const cutISO = cutoff.toISOString().slice(0, 10);
  return distinctTrainingDays(sessions).filter(d => d >= cutISO).length;
}

/**
 * Adherencia semanal: días entrenados / días planificados en la rutina activa.
 * Si no hay rutina con días, devuelve null (no se puede calcular).
 *
 * @param {Array<object>} routines  rutinas del mesociclo
 * @param {Array<object>} sessions
 * @returns {{plannedDays:number, doneDays:number, pct:number}|null}
 */
export function weeklyConsistency(routines, sessions) {
  const plannedDows = new Set();
  routines.forEach(r => (r.days || []).forEach(d => plannedDows.add(d)));
  if (plannedDows.size === 0) return null;

  // Mirar los últimos 7 días naturales
  const today = new Date(todayISO());
  const days7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days7.push({ iso: d.toISOString().slice(0, 10), dow: d.getDay() });
  }

  const planned = days7.filter(d => plannedDows.has(d.dow));
  const sessionDates = new Set(sessions.map(s => s.date));
  const done = planned.filter(d => sessionDates.has(d.iso));

  return {
    plannedDays: planned.length,
    doneDays: done.length,
    pct: planned.length ? Math.round((done.length / planned.length) * 100) : 0,
  };
}
