/**
 * Vista CUERPO · Antropometría y progreso corporal (Fase J·1).
 *
 * - Pantalla principal: CTA "Registrar nueva medición" + lista histórica.
 * - Modal de registro: formulario por categorías (Apple Health-style).
 * - Persistencia: data.bodyMeasurements[] via Store.addBodyMeasurement().
 *
 * Fase J·2 añadirá gráficos por métrica + mapa visual del cuerpo. Esta
 * fase deja la infra de datos + UX de captura lista.
 */

import { $, $$, h, mount } from '../utils/dom.js';
import { todayISO, fmtDate } from '../utils/date.js';
import { escapeH } from '../utils/format.js';
import { Store } from '../store/store.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { renderBodyCompositionChart } from '../charts/body-composition.js';
import { muscleSVG } from '../components/muscle-map.js';

/* === Fase J·2 · estado de visualización (chart + heatmap) ===
   `bodyChart` se preserva entre renders para llamarle .destroy() en cada
   re-render (evita memory leaks de canvas; patrón ya usado en progress.js).
   `timeframe` persiste como módulo: la elección del usuario sobrevive a
   re-renders dentro de la sesión pero NO entre tabs (intencional, así
   cada apertura empieza en "Todo" para ver el panorama completo).
   `tooltipOpenedAt` evita que el click delegado del outside-close se
   dispare en el mismo tick que abrió el tooltip. */
let bodyChart        = null;
let timeframe        = 'all';
let tooltipOpenedAt  = 0;
let outsideBound     = false;

/* === Mapeo Antropometría → región del SVG muscular ===
   Reutilizamos el SVG existente de muscle-map.js (componente compartido
   con el heatmap del Análisis). Algunas medidas comparten región — biceps
   izq+der pintan el grupo "biceps" entero — y la tooltip diferencia los
   lados al hacer click. `positiveDir` codifica qué dirección del cambio
   se considera "buena":
     'grow'   → más cm = progreso (músculo creciendo)
     'shrink' → menos cm = progreso (reducción de zona de grasa) */
const FIELD_TO_REGION = {
  chest:  { region: 'chest',  label: 'Pecho',            positiveDir: 'grow'   },
  bicepL: { region: 'biceps', label: 'Bíceps izq.',      positiveDir: 'grow'   },
  bicepR: { region: 'biceps', label: 'Bíceps der.',      positiveDir: 'grow'   },
  waist:  { region: 'abs',    label: 'Cintura',          positiveDir: 'shrink' },
  navel:  { region: 'abs',    label: 'Ombligo',          positiveDir: 'shrink' },
  thighL: { region: 'quads',  label: 'Muslo izq.',       positiveDir: 'grow'   },
  thighR: { region: 'quads',  label: 'Muslo der.',       positiveDir: 'grow'   },
  calfL:  { region: 'calves', label: 'Pantorrilla izq.', positiveDir: 'grow'   },
  calfR:  { region: 'calves', label: 'Pantorrilla der.', positiveDir: 'grow'   },
};

const REGION_TITLE = {
  chest:        'Pecho',
  biceps:       'Bíceps',
  shoulder:     'Hombros',
  abs:          'Tronco · cintura',
  quads:        'Muslos',
  calves:       'Pantorrillas',
  triceps:      'Tríceps',
  lats:         'Dorsales',
  glutes:       'Glúteos',
  hamstrings:   'Isquios',
  'upper-back': 'Espalda alta',
  'lower-back': 'Espalda baja',
  'rear-delt':  'Deltoides post.',
};

const TIMEFRAMES = [
  { id: '1M',  label: '1M',   days: 30  },
  { id: '3M',  label: '3M',   days: 90  },
  { id: '6M',  label: '6M',   days: 180 },
  { id: 'all', label: 'Todo', days: null },
];

/* ============================================================================
   Esquema de campos · categorías + campos numéricos con unidad
   ----------------------------------------------------------------------------
   `step` se usa como `step` del <input type="number">. Para edad usamos
   step:1 (entero); para todo lo demás 0.5 cm / 0.1 kg como granularidad
   realista de cinta métrica / báscula.
   ============================================================================ */
const FIELD_SCHEMA = [
  {
    id: 'general',
    title: 'Datos generales',
    icon: '⊙',
    fields: [
      { key: 'age',     label: 'Edad',    unit: 'años', step: '1',   mode: 'numeric' },
      { key: 'height',  label: 'Altura',  unit: 'cm',   step: '0.5', mode: 'decimal' },
      { key: 'weight',  label: 'Peso',    unit: 'kg',   step: '0.1', mode: 'decimal' },
      { key: 'bodyFat', label: '% Grasa', unit: '%',    step: '0.1', mode: 'decimal' },
    ],
  },
  {
    id: 'trunk',
    title: 'Tronco',
    icon: '◇',
    fields: [
      { key: 'waist',  label: 'Cintura', unit: 'cm', step: '0.5', mode: 'decimal' },
      { key: 'navel',  label: 'Ombligo', unit: 'cm', step: '0.5', mode: 'decimal' },
      { key: 'chest',  label: 'Pecho',   unit: 'cm', step: '0.5', mode: 'decimal' },
    ],
  },
  {
    id: 'upper',
    title: 'Extremidades superiores',
    icon: '◑',
    fields: [
      { key: 'bicepL', label: 'Bíceps izquierdo', unit: 'cm', step: '0.5', mode: 'decimal' },
      { key: 'bicepR', label: 'Bíceps derecho',   unit: 'cm', step: '0.5', mode: 'decimal' },
    ],
  },
  {
    id: 'lower',
    title: 'Extremidades inferiores',
    icon: '◐',
    fields: [
      { key: 'thighL', label: 'Muslo izquierdo',       unit: 'cm', step: '0.5', mode: 'decimal' },
      { key: 'thighR', label: 'Muslo derecho',         unit: 'cm', step: '0.5', mode: 'decimal' },
      { key: 'calfL',  label: 'Pantorrilla izquierda', unit: 'cm', step: '0.5', mode: 'decimal' },
      { key: 'calfR',  label: 'Pantorrilla derecho',   unit: 'cm', step: '0.5', mode: 'decimal' },
    ],
  },
];

/** Lista plana de todos los campos predefinidos. */
const ALL_FIELDS = FIELD_SCHEMA.flatMap(s => s.fields);

/** Mapa key → meta (label / unit) para render del historial. */
const FIELD_META = Object.fromEntries(ALL_FIELDS.map(f => [f.key, f]));

/* ============================================================================
   RENDER · pantalla principal del tab "Cuerpo"
   ============================================================================ */

export function renderBody() {
  const host = $('#bodyMain');
  if (!host) return;

  // Cleanup chart anterior antes de tirar el DOM (evita leak del canvas).
  if (bodyChart) { bodyChart.destroy(); bodyChart = null; }

  const measurements = Store.bodyMeasurements();  // newest-first
  const last = measurements[0] || null;

  // Filtrado por timeframe para el chart y el heatmap (no afecta a la lista).
  const ascending = measurements.slice().reverse();  // oldest-first para el chart
  const filtered  = filterByTimeframe(ascending, timeframe);
  const deltas    = computeRegionDeltas(filtered);   // null si <2 puntos

  // Canvas + heatmap host + tooltip se preparan ANTES del mount para tener
  // referencias estables; la inicialización del Chart.js y la pintura del
  // SVG se hacen DESPUÉS del mount (necesitan los elementos en el DOM).
  const chartCanvas = h('canvas', { class: 'body-chart-canvas' });
  const heatmapHost = h('div', { class: 'body-heatmap-svg' });
  const tooltipEl   = h('div', { class: 'body-tooltip', role: 'tooltip' });
  const anchorEl    = h('div', { class: 'body-heatmap-anchor' },
    heatmapHost, tooltipEl);

  mount(host, h('div', { class: 'body-view' },
    h('div', { class: 'body-head' },
      h('h2', { class: 'body-h2' }, 'Progreso corporal'),
      h('p', { class: 'body-sub' },
        'Registra perímetros y composición para visualizar tu cambio físico ' +
        'sesión a sesión. Tus datos viven solo en este navegador.'),
    ),

    h('button', {
      class: 'body-cta', type: 'button',
      onClick: () => openBodyForm(null),
    },
      h('span', { class: 'body-cta-plus' }, '+'),
      h('span', { class: 'body-cta-text' },
        h('b', null, 'Registrar nueva medición'),
        h('small', null, last
          ? 'Última: ' + fmtMeasureDate(last.date)
          : 'Todavía no tienes mediciones'),
      ),
      h('span', { class: 'body-cta-chev' }, '›'),
    ),

    // === Selector de rango temporal (afecta chart + heatmap) ===
    buildTimeframeSelector(),

    // === Gráfico dual-axis Peso + %Grasa ===
    measurements.length >= 1
      ? buildChartCard(chartCanvas, filtered)
      : null,

    // === Mapa de calor anatómico con deltas ===
    measurements.length >= 1
      ? buildHeatmapCard(anchorEl, deltas, filtered)
      : null,

    // === Lista histórica completa (no filtrada) ===
    measurements.length
      ? buildHistoryList(measurements)
      : buildEmptyState(),
  ));

  // Inicializar visualizaciones AHORA que los elementos están en el DOM.
  if (filtered.length) {
    bodyChart = renderBodyCompositionChart(chartCanvas, filtered);
    heatmapHost.innerHTML = muscleSVG([]);   // silueta vacía como base
    const svgRoot = heatmapHost.querySelector('svg');
    paintHeatmap(svgRoot, deltas);
    bindRegionClicks(svgRoot, deltas, tooltipEl, anchorEl);
  }

  // Outside-click cierra la tooltip. Solo bind una vez por sesión.
  if (!outsideBound) {
    document.addEventListener('click', (e) => {
      if (Date.now() - tooltipOpenedAt < 80) return;  // del mismo gesto
      const t = $('#bodyMain .body-tooltip');
      if (!t || !t.classList.contains('on')) return;
      if (e.target.closest('[data-region]')) return;
      if (e.target.closest('.body-tooltip')) return;
      t.classList.remove('on');
    });
    outsideBound = true;
  }
}

/* ============================================================================
   Timeframe selector · segmented control [1M | 3M | 6M | Todo]
   ============================================================================ */

function buildTimeframeSelector() {
  return h('div', { class: 'body-timeframe', role: 'tablist' },
    ...TIMEFRAMES.map(tf => h('button', {
      class: 'btf-chip' + (timeframe === tf.id ? ' on' : ''),
      type: 'button',
      role: 'tab',
      'aria-selected': timeframe === tf.id ? 'true' : 'false',
      onClick: () => {
        if (timeframe === tf.id) return;
        timeframe = tf.id;
        renderBody();      // re-render para refrescar chart + heatmap
      },
    }, tf.label)),
  );
}

/* ============================================================================
   Tarjetas de chart y heatmap (envuelven canvas/SVG con eyebrow + sub)
   ============================================================================ */

function buildChartCard(canvasEl, filtered) {
  const hasData = filtered.some(m =>
    (m.weight != null && m.weight !== '') ||
    (m.bodyFat != null && m.bodyFat !== ''));

  return h('div', { class: 'body-card-block body-chart-block' },
    h('div', { class: 'body-block-head' },
      h('span', { class: 'bbh-eyebrow' }, 'COMPOSICIÓN CORPORAL'),
      h('span', { class: 'bbh-sub' }, 'Peso · % Grasa'),
    ),
    hasData
      ? h('div', { class: 'body-chart-wrap' }, canvasEl)
      : h('div', { class: 'body-block-empty' },
          'Registra peso y/o % de grasa en al menos dos mediciones para ver la curva.'),
  );
}

function buildHeatmapCard(anchorEl, deltas, filtered) {
  const points = filtered.length;
  const hasDelta = !!deltas && Object.keys(deltas).length > 0;

  return h('div', { class: 'body-card-block body-heatmap-block' },
    h('div', { class: 'body-block-head' },
      h('span', { class: 'bbh-eyebrow' }, 'MAPA ANATÓMICO'),
      h('span', { class: 'bbh-sub' },
        points < 2
          ? 'Necesitas ≥2 mediciones'
          : 'Toca una zona para ver el cambio'),
    ),
    hasDelta ? anchorEl : h('div', { class: 'body-block-empty' },
      points < 2
        ? 'Cuando registres tu siguiente medición verás aquí las zonas que cambiaron en cm.'
        : 'No hay perímetros suficientes para calcular cambios en el rango seleccionado.'),
    hasDelta ? buildHeatmapLegend() : null,
  );
}

function buildHeatmapLegend() {
  return h('div', { class: 'body-heatmap-legend' },
    h('span', { class: 'bhl-item' },
      h('i', { class: 'bhl-dot good' }), 'Progreso'),
    h('span', { class: 'bhl-item' },
      h('i', { class: 'bhl-dot bad' }), 'Regresión'),
    h('span', { class: 'bhl-item' },
      h('i', { class: 'bhl-dot neutral' }), 'Sin cambio'),
  );
}

/* ============================================================================
   Filtrado por timeframe + cómputo de deltas por región
   ============================================================================ */

function filterByTimeframe(measurements, tf) {
  const cfg = TIMEFRAMES.find(t => t.id === tf);
  if (!cfg || cfg.days == null) return measurements.slice();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cut = new Date(today);
  cut.setDate(cut.getDate() - cfg.days);
  const cutISO = cut.toISOString().slice(0, 10);
  return measurements.filter(m => m.date >= cutISO);
}

/** Compara la PRIMERA y la ÚLTIMA medición del rango y agrega por región.
 *  Devuelve null si <2 puntos (no se puede computar delta). */
function computeRegionDeltas(measurements) {
  if (!measurements || measurements.length < 2) return null;
  const start = measurements[0];
  const end   = measurements[measurements.length - 1];

  const byRegion = {};
  for (const [key, meta] of Object.entries(FIELD_TO_REGION)) {
    const v0 = start[key], v1 = end[key];
    if (v0 == null || v1 == null) continue;
    const change = +(v1 - v0).toFixed(2);
    const isGood = meta.positiveDir === 'grow' ? change > 0 : change < 0;
    if (!byRegion[meta.region]) {
      byRegion[meta.region] = { fields: [], goodSum: 0, count: 0 };
    }
    byRegion[meta.region].fields.push({
      key, label: meta.label,
      current: v1, previous: v0, change, isGood,
      positiveDir: meta.positiveDir,
    });
    // Score "good direction": grow → +change cuenta como positivo,
    // shrink → -change cuenta como positivo. Mean luego decide el color.
    byRegion[meta.region].goodSum += meta.positiveDir === 'grow'
      ? change : -change;
    byRegion[meta.region].count += 1;
  }
  for (const r of Object.values(byRegion)) {
    r.goodMean = +(r.goodSum / r.count).toFixed(2);
  }
  return byRegion;
}

/** Pinta cada [data-region] del SVG según el delta. Las regiones sin datos
 *  quedan en gris translúcido (silueta visible pero sin claim de cambio). */
function paintHeatmap(svgRoot, byRegion) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll('[data-region]').forEach(el => {
    const region = el.dataset.region;
    const data = byRegion ? byRegion[region] : null;
    el.style.cursor = data ? 'pointer' : 'default';
    if (!data) {
      el.style.fill    = 'rgba(255,255,255,.08)';
      el.style.opacity = '0.30';
      return;
    }
    const mean = data.goodMean;   // >0 = progreso; <0 = regresión
    if (mean > 0.4) {
      const t = Math.min(1, mean / 3);
      el.style.fill    = '#34d399';                       // emerald (progreso)
      el.style.opacity = (0.45 + 0.45 * t).toFixed(3);
    } else if (mean < -0.4) {
      const t = Math.min(1, Math.abs(mean) / 3);
      el.style.fill    = '#f87171';                       // soft red (regresión)
      el.style.opacity = (0.40 + 0.40 * t).toFixed(3);
    } else {
      el.style.fill    = 'rgba(255,255,255,.10)';         // neutral
      el.style.opacity = '0.50';
    }
  });
}

/* ============================================================================
   Tooltip flotante al tap sobre una región
   ============================================================================ */

function bindRegionClicks(svgRoot, byRegion, tooltipEl, anchor) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll('[data-region]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      tooltipOpenedAt = Date.now();
      showRegionTooltip(tooltipEl, el, byRegion, anchor);
    });
  });
}

function showRegionTooltip(tooltipEl, regionEl, byRegion, anchor) {
  const region = regionEl.dataset.region;
  const data = byRegion ? byRegion[region] : null;

  let html = '<div class="bt-head">' + escapeH(REGION_TITLE[region] || region) + '</div>';

  if (!data || !data.fields.length) {
    html += '<div class="bt-empty">Sin medición para esta zona en el rango seleccionado.</div>';
  } else {
    for (const f of data.fields) {
      const arrow = f.change > 0 ? '▲' : f.change < 0 ? '▼' : '·';
      const sign  = f.change > 0 ? '+' : '';
      const cls   = Math.abs(f.change) < 0.05 ? 'flat' : (f.isGood ? 'good' : 'bad');
      html += '<div class="bt-line">' +
        '<span class="bt-name">' + escapeH(f.label) + '</span>' +
        '<span class="bt-val">' + f.current.toFixed(1) + ' cm</span>' +
        '<span class="bt-delta ' + cls + '">' + arrow + ' ' +
          sign + f.change.toFixed(1) + '</span>' +
      '</div>';
    }
  }

  tooltipEl.innerHTML = html;

  // Posiciona arriba-centrado respecto al elemento clickeado. Si quedaría
  // recortado por arriba, lo flipea debajo (cubre el caso de zonas altas
  // como hombros / pecho que en iPhones pequeños no tienen sitio arriba).
  const rect       = regionEl.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const x = rect.left + rect.width / 2 - anchorRect.left;
  const yAbove = rect.top - anchorRect.top - 10;
  const yBelow = rect.bottom - anchorRect.top + 10;

  tooltipEl.style.left = x.toFixed(1) + 'px';
  if (yAbove < 60) {
    tooltipEl.classList.add('below');
    tooltipEl.style.top = yBelow.toFixed(1) + 'px';
  } else {
    tooltipEl.classList.remove('below');
    tooltipEl.style.top = yAbove.toFixed(1) + 'px';
  }
  tooltipEl.classList.add('on');
}

/* ============================================================================
   Lista del histórico
   ============================================================================ */

function buildHistoryList(measurements) {
  return h('div', { class: 'body-history' },
    h('div', { class: 'body-history-head' },
      h('span', { class: 'bh-eyebrow' }, 'Histórico'),
      h('span', { class: 'bh-count' }, measurements.length + ' registro' +
        (measurements.length === 1 ? '' : 's')),
    ),
    h('div', { class: 'body-history-list' },
      ...measurements.map(buildMeasurementCard),
    ),
  );
}

function buildMeasurementCard(m) {
  // Resumen: hasta 3 métricas más representativas que tenga.
  const summaryFields = ['weight', 'bodyFat', 'waist', 'chest', 'bicepL'];
  const summary = summaryFields
    .filter(k => m[k] != null && m[k] !== '')
    .slice(0, 3)
    .map(k => {
      const meta = FIELD_META[k];
      const label = meta ? shortLabel(meta.label) : k;
      return label + ' ' + m[k] + (meta?.unit === '%' ? '%' : '');
    })
    .join(' · ');

  const customCount = m.custom ? Object.keys(m.custom).length : 0;
  const extra = customCount ? ' · +' + customCount + ' custom' : '';

  return h('button', {
    class: 'body-card',
    type: 'button',
    onClick: () => openBodyDetail(m),
  },
    h('div', { class: 'bc-date' }, fmtMeasureDate(m.date)),
    h('div', { class: 'bc-summary' }, summary || '—', extra),
    h('span', { class: 'bc-chev' }, '›'),
  );
}

function buildEmptyState() {
  return h('div', { class: 'body-empty' },
    h('div', { class: 'be-icon', 'aria-hidden': 'true' }, '◯'),
    h('div', { class: 'be-title' }, 'Aún sin mediciones'),
    h('div', { class: 'be-sub' },
      'Toma tus primeras medidas con una cinta métrica y báscula. ' +
      'Cada nuevo registro alimentará los gráficos de progresión.'),
  );
}

/* ============================================================================
   Modal · formulario nuevo registro (o edición)
   ----------------------------------------------------------------------------
   `existing` null → registro nuevo (campos vacíos, placeholders con el
   último valor conocido para que el usuario solo cambie lo que se mueve).
   `existing` objeto → edición (pre-rellena el form con los valores guardados).
   ============================================================================ */

export function openBodyForm(existing) {
  const last = Store.lastBodyMeasurement();
  const customNames = Store.customBodyFieldNames();

  // Estado local del form (deep copy si editando).
  const draft = existing ? deepClone(existing) : {
    date: todayISO(),
    custom: {},
  };
  draft.custom = draft.custom || {};

  openModal('');
  const modal = $('#modal');
  modal.classList.add('body-modal');

  function render() {
    mount(modal, [
      h('div', { class: 'modal-head' },
        h('h3', null, existing ? 'Editar medición' : 'Nueva medición'),
        h('button', { class: 'x', onClick: () => close() }, '×'),
      ),
      h('div', { class: 'modal-body body-form' },
        // Fecha
        h('div', { class: 'bf-section' },
          h('div', { class: 'bf-section-head' },
            h('span', { class: 'bf-section-icon' }, '📅'),
            h('span', { class: 'bf-section-title' }, 'Fecha'),
          ),
          h('input', {
            class: 'bf-date', type: 'date',
            value: draft.date || todayISO(),
            onInput: (e) => { draft.date = e.target.value; },
          }),
        ),

        // Categorías de campos predefinidos
        ...FIELD_SCHEMA.map(sec => buildSection(sec, draft, last)),

        // Zonas personalizadas
        buildCustomSection(draft, customNames, render),

        // Notas
        h('div', { class: 'bf-section' },
          h('div', { class: 'bf-section-head' },
            h('span', { class: 'bf-section-icon' }, '✎'),
            h('span', { class: 'bf-section-title' }, 'Notas'),
          ),
          h('textarea', {
            class: 'bf-notes', rows: 2,
            placeholder: 'Cómo te sentiste, hora del día, hidratación…',
            value: draft.notes || '',
            onInput: (e) => { draft.notes = e.target.value; },
          }),
        ),
      ),
      h('div', { class: 'modal-foot bf-foot' },
        existing
          ? h('button', { class: 'btn danger small',
                          onClick: () => deleteAndClose(existing.id) }, 'Borrar')
          : null,
        h('button', { class: 'btn secondary',
                      onClick: () => close() }, 'Cancelar'),
        h('button', { class: 'btn',
                      onClick: () => save() }, 'Guardar'),
      ),
    ]);
  }

  function save() {
    // Filtramos campos vacíos: solo persistimos los que el usuario rellenó.
    const out = { date: draft.date, custom: {}, notes: (draft.notes || '').trim() };
    for (const f of ALL_FIELDS) {
      const v = draft[f.key];
      if (v != null && v !== '' && !isNaN(parseFloat(v))) {
        out[f.key] = parseFloat(v);
      }
    }
    for (const [name, val] of Object.entries(draft.custom || {})) {
      if (val != null && val !== '' && !isNaN(parseFloat(val))) {
        out.custom[name] = parseFloat(val);
      }
    }
    if (!out.date) {
      toast('Pon una fecha para la medición', 'bad');
      return;
    }
    if (!Object.keys(out.custom).length) delete out.custom;
    if (!out.notes) delete out.notes;

    if (existing) {
      Store.updateBodyMeasurement(existing.id, out);
      toast('Medición actualizada');
    } else {
      Store.addBodyMeasurement(out);
      toast('Medición guardada');
    }
    closeModal();
    modal.classList.remove('body-modal');
    renderBody();
  }

  function deleteAndClose(id) {
    if (!confirm('¿Eliminar esta medición? Esta acción no se puede deshacer.')) return;
    Store.deleteBodyMeasurement(id);
    toast('Medición eliminada');
    closeModal();
    modal.classList.remove('body-modal');
    renderBody();
  }

  function close() {
    closeModal();
    modal.classList.remove('body-modal');
  }

  render();
}

/** Construye una sección visual con header (icono + título) y N filas. */
function buildSection(section, draft, last) {
  return h('div', { class: 'bf-section' },
    h('div', { class: 'bf-section-head' },
      h('span', { class: 'bf-section-icon' }, section.icon),
      h('span', { class: 'bf-section-title' }, section.title),
    ),
    h('div', { class: 'bf-rows' },
      ...section.fields.map(f => buildFieldRow(f, draft, last)),
    ),
  );
}

/** Una fila del form: label a la izda, input + unidad a la dcha. El
 *  placeholder muestra el último valor conocido (en muted) para que el
 *  usuario solo cambie lo que se mueve. */
function buildFieldRow(field, draft, last) {
  const lastVal = last && last[field.key] != null ? last[field.key] : null;
  return h('div', { class: 'bf-row' },
    h('label', { class: 'bf-label', for: 'bf-' + field.key },
      field.label),
    h('div', { class: 'bf-input-wrap' },
      h('input', {
        id: 'bf-' + field.key,
        class: 'bf-input',
        type: 'number',
        inputmode: field.mode || 'decimal',
        step: field.step || '0.1',
        value: draft[field.key] != null ? draft[field.key] : '',
        placeholder: lastVal != null ? String(lastVal) : '—',
        onInput: (e) => { draft[field.key] = e.target.value; },
      }),
      h('span', { class: 'bf-unit' }, field.unit),
    ),
  );
}

/** Sección "Zonas personalizadas" — el usuario añade pares (nombre, cm). */
function buildCustomSection(draft, suggestedNames, rerender) {
  const entries = Object.entries(draft.custom || {});

  return h('div', { class: 'bf-section' },
    h('div', { class: 'bf-section-head' },
      h('span', { class: 'bf-section-icon' }, '✚'),
      h('span', { class: 'bf-section-title' }, 'Zonas personalizadas'),
    ),
    entries.length
      ? h('div', { class: 'bf-rows' },
          ...entries.map(([name, val]) => buildCustomRow(name, val, draft, rerender)),
        )
      : h('div', { class: 'bf-empty' },
          'Añade zonas propias (Antebrazo, Cuello, Hombro…) que la app no incluye.'),
    h('button', {
      class: 'bf-add-custom', type: 'button',
      onClick: () => promptCustomZone(draft, suggestedNames, rerender),
    }, '+ Añadir zona personalizada'),
  );
}

function buildCustomRow(name, val, draft, rerender) {
  return h('div', { class: 'bf-row bf-row-custom' },
    h('span', { class: 'bf-label' }, name),
    h('div', { class: 'bf-input-wrap' },
      h('input', {
        class: 'bf-input',
        type: 'number', inputmode: 'decimal', step: '0.5',
        value: val != null ? val : '',
        placeholder: '—',
        onInput: (e) => { draft.custom[name] = e.target.value; },
      }),
      h('span', { class: 'bf-unit' }, 'cm'),
      h('button', {
        class: 'bf-del', type: 'button',
        title: 'Quitar zona',
        onClick: () => {
          delete draft.custom[name];
          rerender();
        },
      }, '×'),
    ),
  );
}

function promptCustomZone(draft, suggestedNames, rerender) {
  const hint = suggestedNames.length
    ? '\n\nSugerencias: ' + suggestedNames.join(', ')
    : '';
  const name = prompt('Nombre de la zona (ej. Antebrazo izquierdo, Cuello):' + hint);
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;
  if (draft.custom[clean] != null) {
    toast('Ya tienes una zona con ese nombre', 'bad');
    return;
  }
  draft.custom[clean] = '';
  rerender();
}

/* ============================================================================
   Modal · detalle de una medición (todos los campos, action: editar/borrar)
   ============================================================================ */

function openBodyDetail(m) {
  // Para simplificar, abrimos el mismo form pero pre-rellenado en modo edit.
  openBodyForm(m);
}

/* ============================================================================
   Utilidades de display
   ============================================================================ */

function fmtMeasureDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = todayISO();
  if (iso === today) return 'Hoy';
  return d.toLocaleDateString('es-ES',
    { weekday: 'short', day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** Abreviación de labels para resumen del card del histórico. */
function shortLabel(label) {
  const map = {
    'Bíceps izquierdo': 'Bíceps L',
    'Bíceps derecho': 'Bíceps R',
    'Muslo izquierdo': 'Muslo L',
    'Muslo derecho': 'Muslo R',
    'Pantorrilla izquierda': 'Pant. L',
    'Pantorrilla derecho': 'Pant. R',
    '% Grasa': '%G',
  };
  return map[label] || label;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
