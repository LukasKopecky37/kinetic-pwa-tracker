/**
 * Ajustes avanzados por ejercicio.
 *
 * Modal overlay accesible desde el botón "Ajustes" del header del player
 * activo (también desde el editor de Día como futura mejora). Expone los
 * parámetros que alimentan el motor de auto-progresión:
 *
 *   1. progressionType: 'standard' | 'assisted' | 'bodyweight'
 *      - standard:   pesa libre / máquina (default)
 *      - assisted:   dominadas asistidas, fondos asistidos (menos kg = +)
 *      - bodyweight: dominadas, flexiones (sin kg, progreso en reps)
 *   2. defaultRest: segundos entre series (60/90/120/150/180/240/300)
 *   3. targetRepRange: { min, max } (sustituye al item.repRange genérico
 *      para los cálculos del motor; el item de cada rutina puede seguir
 *      teniendo su propio rango "blando" para la UI)
 *   4. autoIncrementKg: 1.25 / 2.5 / 5 — el "paso" para subir o bajar
 *      cuando se cumple el rango estricto. Default 2.5 (disco olímpico
 *      mínimo por lado).
 *   5. isUnilateral: boolean — el ejercicio se entrena un lado a la vez.
 *      Cuando true, la auto-progresión exige repsL >= max AND repsR >= max
 *      (regla anti "falso positivo por suma" del refactor v55).
 *
 * Diseño: 4 secciones tipográficamente fuertes (mayúsculas, letter-spacing)
 * con chips/steppers grandes para entrada táctil. Coherente con el resto
 * de modales del player (.aw-tips-modal pattern).
 */

import { $, h, mount } from '../utils/dom.js';
import { escapeH } from '../utils/format.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { Store } from '../store/store.js';
import { vibrate } from '../services/haptics.js';

/* Presets — alineados con la realidad del gym, no son arbitrarios:
 * rest: el rango cubre todo desde 'hipertrofia con fatiga' (60s) hasta
 * 'fuerza máxima compuesta' (300s = 5 min). Saltos de 30/60s.
 * autoIncrement: 1.25 (microdisco por lado), 2.5 (un disco de 1.25kg por
 * lado), 5 (un disco de 2.5 por lado, salto agresivo).
 * targetRepRange: ranges típicos de double-progression — 5-8 (fuerza),
 * 8-12 (hipertrofia), 12-15 (resistencia muscular), 15-20 (endurance). */
const REST_PRESETS = [60, 90, 120, 150, 180, 240, 300];
// Incrementos de carga: micro-disco (1.25), disco estándar (2.5/5) y saltos
// grandes (10/20) para compuestos pesados — sirven igual para subir (+) que
// para bajar (−), ya que autoIncrementKg es el "paso" en ambas direcciones.
const INC_PRESETS  = [1.25, 2.5, 5, 10, 20];
const RANGE_PRESETS = [
  { min: 3,  max: 5,  label: '3–5'  },
  { min: 5,  max: 8,  label: '5–8'  },
  { min: 6,  max: 10, label: '6–10' },
  { min: 8,  max: 12, label: '8–12' },
  { min: 10, max: 15, label: '10–15'},
  { min: 12, max: 15, label: '12–15'},
  { min: 15, max: 20, label: '15–20'},
];
const TYPE_OPTIONS = [
  {
    key: 'standard',
    label: 'Estándar',
    sub: 'Más peso = progreso. Pesos libres y máquinas.',
  },
  {
    key: 'assisted',
    label: 'Asistido',
    sub: 'Menos peso = progreso. Asistidas / fondos con contrapeso.',
  },
  {
    key: 'bodyweight',
    label: 'Peso corporal',
    sub: 'Sin carga externa. El progreso se mide en reps.',
  },
];

/** Lee los settings actuales con defaults razonables. */
function readSettings(ex) {
  return {
    progressionType:
      ex.progressionType === 'assisted'  ? 'assisted'
      : ex.progressionType === 'bodyweight' ? 'bodyweight'
      : 'standard',
    defaultRest: +ex.defaultRest > 0 ? +ex.defaultRest
                : Store.getDefaultRest() || 120,
    targetRepRange: (ex.targetRepRange
                     && Number.isFinite(ex.targetRepRange.min)
                     && Number.isFinite(ex.targetRepRange.max))
      ? { ...ex.targetRepRange }
      : { min: 8, max: 12 },
    autoIncrementKg: +ex.autoIncrementKg > 0 ? +ex.autoIncrementKg : 2.5,
    isUnilateral: !!(ex.isUnilateral || ex.unilateralSplit),
  };
}

/**
 * Abre el modal de ajustes para un ejercicio.
 * @param {string} exerciseId
 * @param {() => void} [onSaved]  callback opcional para refrescar el player
 *        (el active workout lo usa para re-leer rest/range y aplicar nueva
 *        config sin re-render completo).
 */
export function openExerciseSettings(exerciseId, onSaved) {
  const ex = Store.exerciseById(exerciseId);
  if (!ex) { toast('Ejercicio no encontrado', 'bad'); return; }

  const draft = readSettings(ex);

  // Montamos head/body/foot DIRECTAMENTE en #modal (no en un wrapper extra).
  // El #modal tiene el flex-column + max-height:88vh + overflow:hidden; su
  // hijo .modal-body lleva overflow-y:auto. Si metiéramos todo dentro de un
  // <div id="exSet"> intermedio, ese div crecería con el contenido y el
  // scroll del body NUNCA se activaría → el fondo del modal se cortaba
  // (bug IMG_6099: "Incremento de carga" quedaba fuera de pantalla).
  openModal('');
  const root = $('#modal');

  function render() {
    // Preserva el scroll del body entre re-renders (cada tap de chip re-monta
    // el modal); sin esto, tocar un chip de "Incremento" abajo te devolvía
    // bruscamente arriba.
    const prevScroll = root.querySelector('.modal-body')?.scrollTop || 0;
    mount(root, [
      h('div', { class: 'modal-head' },
        h('h3', null, 'Ajustes · ', h('span', { class: 'exset-exname' }, ex.name)),
        h('button', {
          class: 'x', type: 'button', 'aria-label': 'Cerrar',
          onClick: closeModal,
        }, '×'),
      ),
      h('div', { class: 'modal-body exset-body' },
        section('Tipo de progresión',
          'Define cómo el motor de auto-progreso interpreta los kg.',
          h('div', { class: 'exset-type-list' },
            ...TYPE_OPTIONS.map(opt => h('button', {
              class: 'exset-type' + (draft.progressionType === opt.key ? ' on' : ''),
              type: 'button',
              onClick: () => { draft.progressionType = opt.key; vibrate(10); render(); },
            },
              h('div', { class: 'exset-type-label' }, opt.label),
              h('div', { class: 'exset-type-sub' }, opt.sub),
            )),
          ),
        ),
        section('Descanso entre series',
          `Actual: ${fmtRest(draft.defaultRest)}.`,
          h('div', { class: 'exset-chip-row' },
            ...REST_PRESETS.map(s => h('button', {
              class: 'exset-chip' + (draft.defaultRest === s ? ' on' : ''),
              type: 'button',
              onClick: () => { draft.defaultRest = s; vibrate(10); render(); },
            }, fmtRest(s))),
          ),
        ),
        section('Rango de reps objetivo',
          'Cuando TODAS las series llegan al máximo, el peso sube en el siguiente entreno.',
          h('div', { class: 'exset-chip-row' },
            ...RANGE_PRESETS.map(r => h('button', {
              class: 'exset-chip'
                + (draft.targetRepRange.min === r.min && draft.targetRepRange.max === r.max
                  ? ' on' : ''),
              type: 'button',
              onClick: () => {
                draft.targetRepRange = { min: r.min, max: r.max };
                vibrate(10); render();
              },
            }, r.label)),
          ),
        ),
        // Incremento solo tiene sentido si el tipo USA kg.
        draft.progressionType !== 'bodyweight'
          ? section('Incremento de carga',
              draft.progressionType === 'assisted'
                ? 'Paso de asistencia (sube ▲ o baja ▼) y de los botones ± en la serie.'
                : 'Paso de peso al subir (+) o bajar (−), en la serie y en la próxima sesión.',
              h('div', { class: 'exset-chip-row' },
                ...INC_PRESETS.map(kg => h('button', {
                  class: 'exset-chip' + (draft.autoIncrementKg === kg ? ' on' : ''),
                  type: 'button',
                  onClick: () => { draft.autoIncrementKg = kg; vibrate(10); render(); },
                }, `${kg} kg`)),
              ),
            )
          : null,
        section('Unilateral (un lado a la vez)',
          'Cuando activo, la app exige que AMBOS lados (I + D) cumplan el rango para subir el peso.',
          h('label', { class: 'exset-switch-row' },
            h('div', null,
              h('div', { class: 'exset-switch-label' }, 'Activado'),
              h('div', { class: 'exset-switch-sub' },
                draft.isUnilateral ? 'Sí — analítica por lado' : 'No — registro bilateral'),
            ),
            h('button', {
              class: 'aw-switch' + (draft.isUnilateral ? ' on' : ''),
              type: 'button',
              'aria-pressed': String(draft.isUnilateral),
              onClick: () => { draft.isUnilateral = !draft.isUnilateral; vibrate(10); render(); },
            }),
          ),
        ),
      ),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn secondary', type: 'button', onClick: closeModal }, 'Cancelar'),
        h('button', {
          class: 'btn', type: 'button',
          onClick: () => commit(),
        }, 'Guardar'),
      ),
    ]);
    // Restaura la posición de scroll tras re-montar.
    const body = root.querySelector('.modal-body');
    if (body && prevScroll) body.scrollTop = prevScroll;
  }

  function commit() {
    Store.updateExercise(ex.id, {
      progressionType: draft.progressionType,
      defaultRest: draft.defaultRest,
      targetRepRange: { min: draft.targetRepRange.min, max: draft.targetRepRange.max },
      autoIncrementKg: draft.autoIncrementKg,
      isUnilateral: draft.isUnilateral,
      // Espejo para compat con código que aún lee `unilateralSplit`:
      unilateralSplit: draft.isUnilateral,
    });
    vibrate([10, 30, 10]);
    toast('Ajustes guardados');
    closeModal();
    if (typeof onSaved === 'function') onSaved();
  }

  render();
}

/* --------------------- helpers --------------------- */

function section(title, sub, ...children) {
  return h('section', { class: 'exset-section' },
    h('h4', { class: 'exset-h4' }, title),
    sub ? h('p', { class: 'exset-sub' }, sub) : null,
    ...children,
  );
}

function fmtRest(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec === 0 ? `${m} min` : `${m}:${String(sec).padStart(2, '0')}`;
}
