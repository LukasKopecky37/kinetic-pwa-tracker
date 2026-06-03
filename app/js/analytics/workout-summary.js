/**
 * Resumen de un workout — analítica pura.
 *
 * v6: las sesiones tienen `sets[]`. Recibimos el workout, sus sesiones
 * enlazadas y un lookup para los ejercicios. Devolvemos totales, PRs y
 * lista por ejercicio (con el top set).
 */

import { sessionVolume, sessionSetCount } from './volume.js';
import { isPR, topSet } from './prs.js';
import { MUSCLE_MAP } from '../constants.js';

/**
 * @param {object} workout
 * @param {Array<object>} sessions     sesiones del workout (workoutId === workout.id)
 * @param {Array<object>} allSessions  todas las sesiones (para PR check)
 * @param {(id:string)=>object|undefined} exerciseById
 */
export function summarizeWorkout(workout, sessions, allSessions, exerciseById) {
  // Duración
  let durationSec = null;
  if (workout.startAt) {
    const end = workout.endAt ? new Date(workout.endAt) : new Date();
    durationSec = Math.max(0, Math.floor((end - new Date(workout.startAt)) / 1000));
  }

  let totalSets = 0, totalReps = 0, totalVolume = 0, prCount = 0;
  const perExercise = [];
  const groups  = new Set();
  const regions = new Set();

  for (const s of sessions) {
    const ex = exerciseById(s.exerciseId);
    if (!ex) continue;

    const setN = sessionSetCount(s);
    const reps = (s.sets || []).reduce((a, st) => a + (st.warmup ? 0 : (st.reps || 0)), 0);
    const vol  = sessionVolume(s);
    const pr   = isPR(s, allSessions.filter(x => x.exerciseId === s.exerciseId));
    const top  = topSet(s);

    totalSets   += setN;
    totalReps   += reps;
    totalVolume += vol;
    if (pr) prCount++;

    groups.add(ex.group);
    (MUSCLE_MAP[ex.group] || []).forEach(r => regions.add(r));

    perExercise.push({ ex, session: s, topSet: top, volume: vol, isPR: pr });
  }

  return {
    durationSec,
    totalSets,
    totalReps,
    totalVolume,
    prCount,
    exerciseCount: perExercise.length,
    muscleGroups:  [...groups],
    muscleRegions: [...regions],
    perExercise,
    readiness: workout.readiness || null,
  };
}

/**
 * Formatea segundos como 'Hh MMm' o 'MMm' o 'SSs'.
 */
export function fmtDuration(sec) {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}
