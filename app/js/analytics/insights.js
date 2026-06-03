/**
 * Motor de Insights — analítica que genera frases procesables.
 *
 * Objetivo: dar al usuario lecturas tipo Whoop/Hevy:
 *   "Tu volumen de espalda subió 18%"
 *   "Press de banca lleva 4 sesiones estancado"
 *   "3 PRs esta semana"
 *
 * Diseño:
 *   `generateInsights(data, exerciseById)` → array de {id, type, severity, title, detail, meta}
 *   Cada regla es una función independiente para que añadir/quitar reglas sea barato.
 *
 * Severidades:
 *   - 'good': progreso positivo destacable
 *   - 'warn': algo que requiere atención
 *   - 'info': observación neutra
 *
 * Próximas reglas (no en MVP de Fase F):
 *   - correlación readiness ↔ rendimiento
 *   - tendencia RPE creciente con misma carga (fatiga real)
 *   - balance push/pull descompensado
 *   - sugerencia de deload por volumen acumulado de 4+ semanas
 */

import { weeklySetsByGroup, sessionSetCount }    from './volume.js';
import { findStalledExercises } from './stagnation.js';
import { isPR, topWeight }      from './prs.js';
import { streakDays, weeklyConsistency } from './streak.js';
import { todayISO } from '../utils/date.js';

const WEEK_MS = 7 * 86400000;

/**
 * Punto de entrada.
 * @param {object} data                  Store.data
 * @param {(id:string)=>object|undefined} byId
 * @returns {Array<object>}              insights ordenados por severidad
 */
export function generateInsights(data, byId) {
  const out = [];

  // 1. Volumen por grupo: esta semana vs la anterior
  const cutThis = new Date(todayISO());
  const cutPrev = new Date(cutThis); cutPrev.setDate(cutPrev.getDate() - 7);
  const cutPrev2 = new Date(cutPrev); cutPrev2.setDate(cutPrev2.getDate() - 7);

  const thisWeek = weeklySetsByGroup(data.sessions, byId, 7);
  const prevWeek = setsByGroupBetween(data.sessions, byId, cutPrev2, cutPrev);

  const allGroups = [...new Set([...Object.keys(thisWeek), ...Object.keys(prevWeek)])];
  for (const g of allGroups) {
    const a = thisWeek[g] || 0;
    const b = prevWeek[g] || 0;
    if (b === 0 && a === 0) continue;
    if (b === 0) {
      if (a >= 8) out.push({
        id: 'volume-new-' + g, type: 'volume-up', severity: 'good',
        title: `${a} series de ${g} esta semana`,
        detail: 'No registraste nada la semana pasada — buen arranque.',
        meta: { group: g, delta: a },
      });
      continue;
    }
    const pct = Math.round(((a - b) / b) * 100);
    if (pct >= 15 && a >= 6) {
      out.push({
        id: 'volume-up-' + g, type: 'volume-up', severity: 'good',
        title: `Tu volumen de ${g} subió ${pct}%`,
        detail: `${a} series esta semana vs ${b} la anterior.`,
        meta: { group: g, pct, a, b },
      });
    } else if (pct <= -25 && b >= 6) {
      out.push({
        id: 'volume-down-' + g, type: 'volume-down', severity: 'warn',
        title: `${g}: ${Math.abs(pct)}% menos volumen`,
        detail: `${a} series esta semana vs ${b} la anterior.`,
        meta: { group: g, pct, a, b },
      });
    }
  }

  // 2. Sub-entrenamiento / sobre-entrenamiento
  for (const g of Object.keys(thisWeek)) {
    const v = thisWeek[g];
    if (v > 0 && v < 8) {
      out.push({
        id: 'under-' + g, type: 'undertrained', severity: 'info',
        title: `${g}: ${v} series esta semana`,
        detail: 'Para hipertrofia se recomienda 10-20 series por grupo a la semana.',
        meta: { group: g, sets: v },
      });
    } else if (v > 25) {
      out.push({
        id: 'over-' + g, type: 'overload', severity: 'warn',
        title: `${g}: ${v} series (mucho)`,
        detail: 'Sostener > 20 series/semana puede llevar a sobreentrenamiento.',
        meta: { group: g, sets: v },
      });
    }
  }

  // 3. Estancamientos por ejercicio (en el meso activo)
  const activeMesoSessions = data.sessions.filter(s => s.mesoId === data.currentMesoId);
  const stalled = findStalledExercises(activeMesoSessions, data.sessions, byId);
  for (const { ex, last } of stalled) {
    out.push({
      id: 'stalled-' + ex.id, type: 'stalled', severity: 'warn',
      title: `${ex.name}: estancado`,
      detail: last
        ? `4 sesiones sin progreso (último: ${topWeight(last)} kg). Prueba descarga o cambio de variante.`
        : '4 sesiones sin progreso. Prueba descarga o cambio de variante.',
      meta: { exerciseId: ex.id, group: ex.group },
    });
  }

  // 4. PRs de esta semana
  const cutWeekISO = isoMinusDays(7);
  const recent = data.sessions.filter(s => s.date >= cutWeekISO);
  const prCount = recent.filter(s =>
    isPR(s, data.sessions.filter(x => x.exerciseId === s.exerciseId))
  ).length;
  if (prCount > 0) {
    out.push({
      id: 'pr-week', type: 'pr-streak', severity: 'good',
      title: `${prCount} récord${prCount > 1 ? 's' : ''} esta semana`,
      detail: 'Brutal — sigue así.',
      meta: { count: prCount },
    });
  }

  // 5. Racha
  const streak = streakDays(data.sessions);
  if (streak >= 3) {
    out.push({
      id: 'streak', type: 'streak', severity: 'good',
      title: `Racha: ${streak} días`,
      detail: 'Días seguidos entrenando. La constancia es lo que hace progreso real.',
      meta: { days: streak },
    });
  }

  // 6. Consistencia con la rutina planificada
  const cons = weeklyConsistency(
    data.routines.filter(r => r.mesoId === data.currentMesoId),
    data.sessions.filter(s => s.date >= cutWeekISO),
  );
  if (cons && cons.plannedDays > 0) {
    if (cons.pct >= 100) {
      out.push({
        id: 'consistency-full', type: 'consistency', severity: 'good',
        title: `Cumpliste todos los días planificados`,
        detail: `${cons.doneDays} de ${cons.plannedDays} días.`,
        meta: cons,
      });
    } else if (cons.pct < 50 && cons.plannedDays >= 3) {
      out.push({
        id: 'consistency-low', type: 'consistency', severity: 'warn',
        title: `Solo ${cons.doneDays} de ${cons.plannedDays} días planificados`,
        detail: 'Cumplir el plan semanal es la palanca con más impacto.',
        meta: cons,
      });
    }
  }

  // Ordenar: warn primero (lo que requiere acción), luego good, luego info.
  const order = { warn: 0, good: 1, info: 2 };
  out.sort((a, b) => (order[a.severity] - order[b.severity]));
  return out;
}

/* ============================================================================
   Helpers internos
   ============================================================================ */

function isoMinusDays(n) {
  const d = new Date(todayISO());
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Series por grupo entre dos fechas [start, end) (exclusiva end). */
function setsByGroupBetween(sessions, byId, startDate, endDate) {
  const startISO = startDate.toISOString().slice(0, 10);
  const endISO   = endDate.toISOString().slice(0, 10);
  const byGroup = {};
  for (const s of sessions) {
    if (s.date < startISO || s.date >= endISO) continue;
    const ex = byId(s.exerciseId);
    if (!ex) continue;
    byGroup[ex.group] = (byGroup[ex.group] || 0) + sessionSetCount(s);
  }
  return byGroup;
}
