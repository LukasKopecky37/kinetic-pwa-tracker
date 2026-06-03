/**
 * Vista Análisis — minimalista (Apple premium, "menos es más").
 *
 * Composición (de arriba abajo):
 *  - 3 KPIs sutiles: Top progresión · Consistencia · Enfoque sugerido
 *  - Volumen semanal por grupo (barras)
 *  - Mapa de calor muscular (carga últimos 30 días, biomecánica corregida)
 *  - Frecuencia de entrenamiento (heatmap de adherencia + leyenda)
 *
 * Se eliminó el motor de "Insights" y el listado de "Estancamientos"
 * (ruido visual + falsos negativos con el histórico importado).
 */

import { $, h, mount } from '../utils/dom.js';
import { escapeH } from '../utils/format.js';
import { Store } from '../store/store.js';
import { renderVolumeChart } from '../charts/volume.js';
import { muscleSVG, updateMuscleHeatmap } from '../components/muscle-map.js';
import {
  calculateMuscleVolume, normalizeMuscleVolume, regionIntensities,
} from '../analytics/muscle-load.js';
import { bestEstimated1RM } from '../analytics/one-rm.js';
import { sessionVolume, sessionSetCount } from '../analytics/volume.js';

let volChart = null;

const HEATMAP_DAYS = 30;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const isoDaysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export function renderAnalysis() {
  renderBento();

  // Volumen por grupo
  const sets = Store.weeklySetsByGroup();
  if (volChart) volChart.destroy();
  if (Object.keys(sets).length) {
    volChart = renderVolumeChart($('#volCanvas'), sets);
  } else {
    const cv = $('#volCanvas');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }

  renderMuscleHeatmap();

  // Frecuencia de entrenamiento (adherencia 12 sem, alineada lunes-domingo)
  renderAdherence();
}

function renderAdherence() {
  const cells = Store.adherenceMatrix(12);

  // Etiquetas de mes: una por columna (semana). Solo se rellena cuando el
  // mes del lunes de esa columna cambia respecto al anterior.
  const monthsHost = document.getElementById('hmMonths');
  if (monthsHost) {
    let lastMonth = -1;
    const labels = [];
    for (let w = 0; w < 12; w++) {
      const monday = cells[w * 7];
      if (!monday) { labels.push(''); continue; }
      const d = new Date(monday.date + 'T00:00:00');
      const m = d.getMonth();
      if (m !== lastMonth) {
        labels.push(
          d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
        );
        lastMonth = m;
      } else {
        labels.push('');
      }
    }
    monthsHost.innerHTML = labels.map(l => `<span>${escapeH(l)}</span>`).join('');
  }

  const grid = document.getElementById('hmGrid');
  if (grid) {
    grid.innerHTML = cells.map(c => {
      const cls = ['hm-cell'];
      if (c.lvl)    cls.push('l' + c.lvl);
      if (c.future) cls.push('future');
      const t = c.future
        ? c.date
        : `${c.date} · ${c.count} ej.${c.v ? ' · ' + Math.round(c.v) + ' kg·rep' : ''}`;
      return `<div class="${cls.join(' ')}" title="${t}"></div>`;
    }).join('');
  }
}

/* ============================================================================
   Dashboard Bento — 4 bloques con datos reales de Dexie/IndexedDB.
   Hero + Volumen semanal + Consistencia + Enfoque metódico.
   ============================================================================ */

// Grupos "canónicos" (los del catálogo: Pecho, Espalda, Hombros, Piernas…)
// para el detector de debilidades del Bloque 4. Coincide con MUSCLE_MAP.
const ROUTINE_GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Piernas',
  'Glúteos', 'Bíceps', 'Tríceps', 'Abdominales', 'Gemelos'];

function renderBento() {
  const host = $('#anBento');
  if (!host) return;
  const sessions = Store.data.sessions;

  mount(host, [
    bentoHero(sessions),                    // grid-column 1 / -1 (full width)
    bentoVolume(sessions),                  // half
    bentoConsistency(sessions),             // half
    bentoFocus(sessions),                   // full width
  ]);
}

/* ─── BLOQUE 1 · HERO: HITO DE FUERZA (mayor +Δ 1RM estimado en 60 días) ─── */
function bentoHero(sessions) {
  const cut = isoDaysAgo(60);
  const byEx = {};
  for (const s of sessions) {
    if (s.date < cut) continue;
    (byEx[s.exerciseId] || (byEx[s.exerciseId] = [])).push(s);
  }

  let best = null;
  for (const exId in byEx) {
    const ss = byEx[exId].slice().sort((a, b) => a.date.localeCompare(b.date));
    if (ss.length < 3) continue;
    // Comparamos PR de la primera mitad vs PR de la segunda mitad
    const half = Math.max(1, Math.floor(ss.length / 2));
    const e1rmEarly = bestEstimated1RM(ss.slice(0, half));
    const e1rmLate  = bestEstimated1RM(ss.slice(-half));
    const delta = Math.round((e1rmLate - e1rmEarly) * 10) / 10;
    if (delta > 0 && (!best || delta > best.delta)) {
      const ex = Store.exerciseById(exId);
      // Sparkline: e1RM por sesión (últimas 15)
      const spark = ss.slice(-15).map(s => bestEstimated1RM([s]));
      best = { name: ex?.name || exId, delta, e1rmLate, spark };
    }
  }

  if (!best) {
    return h('div', { class: 'bento bento-hero bento-empty' },
      h('div', { class: 'bento-label' }, 'Hito de fuerza'),
      h('div', { class: 'bento-empty-msg' },
        'Sigue acumulando sesiones para detectar tu próximo PR.'),
    );
  }

  return h('div', { class: 'bento bento-hero' },
    h('span', { class: 'bento-pro' }, 'Progresión Pro'),
    h('div', { class: 'bento-label' }, 'Hito de fuerza · 60 días'),
    h('div', { class: 'bento-val' },
      `+${best.delta}`,
      h('span', { class: 'bento-unit' }, ' kg 1RM'),
    ),
    h('div', { class: 'bento-ex' }, best.name),
    h('div', { class: 'bento-spark-wrap', html: sparkline(best.spark) }),
  );
}

/* ─── BLOQUE 2 · VOLUMEN SEMANAL (últimos 7d vs 7d anteriores) ─── */
function bentoVolume(sessions) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = (n) => {
    const d = new Date(today); d.setDate(today.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const cut7 = iso(7), cut14 = iso(14);

  let cur = 0, prev = 0;
  for (const s of sessions) {
    if (s.date >= cut7) cur += sessionVolume(s);
    else if (s.date >= cut14) prev += sessionVolume(s);
  }

  const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const dir = deltaPct == null ? '·' : deltaPct > 0 ? '↑' : deltaPct < 0 ? '↓' : '→';
  const dirCls = deltaPct == null ? '' : deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : '';

  return h('div', { class: 'bento bento-vol' },
    h('div', { class: 'bento-label' }, 'Volumen semanal'),
    h('div', { class: 'bento-val' }, formatVolume(cur)),
    h('div', { class: 'bento-sub' },
      h('span', { class: `bento-trend ${dirCls}` }, dir + ' '),
      deltaPct == null
        ? 'sin semana previa'
        : `${deltaPct > 0 ? '+' : ''}${deltaPct}% vs sem. ant.`,
    ),
  );
}

/* ─── BLOQUE 3 · CONSISTENCIA (entrenos del mes + ritmo últimos 7d) ─── */
function bentoConsistency(sessions) {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const monthDays = new Set(
    sessions.filter(s => s.date.startsWith(ym)).map(s => s.date));
  const count = monthDays.size;
  const noun = count === 1 ? 'entreno' : 'entrenos';

  // Ritmo: 7 puntos para los últimos 7 días (hoy → derecha)
  const trainedRecent = new Set(sessions.map(s => s.date));
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    dots.push(h('span', { class: trainedRecent.has(iso) ? 'on' : '' }));
  }

  return h('div', { class: 'bento bento-cons' },
    h('div', { class: 'bento-label' }, 'Consistencia'),
    h('div', { class: 'bento-val' },
      String(count),
      h('span', { class: 'bento-unit' }, ' ' + noun),
    ),
    h('div', { class: 'bento-sub' }, `en ${MONTHS[now.getMonth()]}`),
    h('div', { class: 'bento-dots' }, ...dots),
  );
}

/* ─── BLOQUE 4 · ENFOQUE METÓDICO (grupo más flojo vs lo planificado) ─── */
function bentoFocus(sessions) {
  const mesoId = Store.data.currentMesoId;
  const days = mesoId ? Store.routines(mesoId) : [];

  // Series PLANIFICADAS por grupo (suma a través de los Días de la rutina)
  const planned = {};
  for (const d of days) {
    for (const it of d.items || []) {
      const ex = Store.exerciseById(it.exerciseId);
      if (!ex) continue;
      planned[ex.group] = (planned[ex.group] || 0) + (it.sets || 3);
    }
  }

  // Series REALES últimos 14 días por grupo
  const cut14 = isoDaysAgo(14);
  const actual = {};
  for (const s of sessions) {
    if (s.date < cut14) continue;
    const ex = Store.exerciseById(s.exerciseId);
    if (!ex) continue;
    actual[ex.group] = (actual[ex.group] || 0) + sessionSetCount(s);
  }

  // Ratio actual / planificado×2 (14 días ≈ 2 semanas). Más bajo = más flojo.
  let weakest = null;
  for (const g of ROUTINE_GROUPS) {
    const p = planned[g] || 0;
    if (p <= 0) continue;                  // si no está en la rutina, ignorar
    const a = actual[g] || 0;
    const ratio = a / (p * 2);
    if (!weakest || ratio < weakest.ratio) {
      weakest = { group: g, ratio, actual: a, planned: p * 2 };
    }
  }

  if (!weakest) {
    return h('div', { class: 'bento bento-focus bento-empty' },
      h('div', { class: 'bento-label' }, 'Enfoque sugerido'),
      h('div', { class: 'bento-empty-msg' },
        'Crea una rutina para que detectemos tu grupo más flojo.'),
    );
  }

  const pct = Math.round(weakest.ratio * 100);
  const sub = weakest.actual === 0
    ? 'no lo entrenaste esta quincena. Dale prioridad en la primera sesión.'
    : `solo ${pct}% de lo planificado en 2 semanas. Dale prioridad en la primera sesión.`;

  return h('div', { class: 'bento bento-focus' },
    h('div', { class: 'bento-focus-head' },
      h('div', { class: 'bento-label' }, 'Enfoque sugerido'),
      h('div', { class: 'bento-focus-pct' }, `${pct}%`),
    ),
    h('div', { class: 'bento-focus-name' }, weakest.group),
    h('div', { class: 'bento-sub bento-coach' },
      'Es el grupo más flojo esta quincena · ', sub),
  );
}

/* ─── Helpers de presentación ─── */

/** Sparkline SVG ultraligero (sin Chart.js). */
function sparkline(values, w = 220, h = 44) {
  const v = (values || []).filter(n => Number.isFinite(n) && n > 0);
  if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v);
  const range = (mx - mn) || 1;
  const stepX = w / (v.length - 1);
  const pts = v.map((n, i) => {
    const x = i * stepX;
    const y = h - ((n - mn) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = pts.join(' ');
  const area = `M 0,${h} L ${polyline} L ${w},${h} Z`;
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="bento-spark">
      <defs>
        <linearGradient id="bentoSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff7a2f" stop-opacity=".55"/>
          <stop offset="100%" stop-color="#ff7a2f" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#bentoSparkGrad)"/>
      <polyline points="${polyline}" fill="none"
        stroke="#ff7a2f" stroke-width="2.2"
        stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

function formatVolume(kg) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

/* ============================================================================
   Mapa de calor muscular (carga 30 días · biomecánica corregida)
   ============================================================================ */
function renderMuscleHeatmap() {
  const host = $('#muscleHeatmap');
  if (!host) return;

  const vol = calculateMuscleVolume(
    Store.data.sessions, (id) => Store.exerciseById(id),
    { daysBack: HEATMAP_DAYS });
  const { norm, max } = normalizeMuscleVolume(vol);

  host.innerHTML = muscleSVG([]);
  updateMuscleHeatmap(host, regionIntensities(norm));

  const topEl = $('#muscleHeatTop');
  if (!topEl) return;
  if (max <= 0) {
    topEl.innerHTML = '<li class="mh-empty">Sin series en los últimos 30 días</li>';
    return;
  }
  const top = Object.entries(vol)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  topEl.innerHTML = top.map(([m, v]) => `
    <li>
      <span class="mt-name">${escapeH(m)}</span>
      <span class="mt-bar"><i style="width:${Math.round((v / max) * 100)}%"></i></span>
      <b class="mt-val">${Number.isInteger(v) ? v : v.toFixed(1)}</b>
    </li>`).join('');
}
