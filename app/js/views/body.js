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

  const measurements = Store.bodyMeasurements();
  const last = measurements[0] || null;

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

    measurements.length
      ? buildHistoryList(measurements)
      : buildEmptyState(),
  ));
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
