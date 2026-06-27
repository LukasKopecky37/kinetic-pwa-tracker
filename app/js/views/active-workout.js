/**
 * Vista de entrenamiento activo (Fase I) — el "player" a pantalla completa.
 *
 * Es el equivalente a la pantalla "ahora entrenando" de Hevy/Strong:
 *   - Un ejercicio por página, swipe horizontal entre ellos (drag con dedo
 *     + chevrons + dots de progreso).
 *   - Registro serie a serie: cada serie viene pre-rellenada (peso sugerido
 *     / última); haces la serie, pulsas ✓ y se guarda al instante, el
 *     descanso arranca solo y la serie se pone en verde.
 *   - Timer de descanso GRANDE (espejo del RestTimer global vía suscripción).
 *   - Preview del siguiente ejercicio en el pie.
 *
 * Persistencia: cada ✓ reescribe la sesión del ejercicio (removeSessionFor +
 * addSession) con las series marcadas como hechas. addSession enlaza solo al
 * workout activo (activeWorkoutId). Cero cambios de esquema.
 *
 * Ciclo de vida: `openActiveWorkout()` monta y muestra; `closeActiveWorkout()`
 * minimiza (el workout sigue activo). El overlay vive en #activeWorkout.
 */

import { $, $$, h, mount } from '../utils/dom.js';
import { fmtMMSS, fmtTopSet, escapeH } from '../utils/format.js';
import { roman } from '../utils/roman.js';
import { Store } from '../store/store.js';
import { topSet } from '../analytics/prs.js';
import { EXERCISE_CATALOG, catalogToExercise } from '../store/exercise-catalog.js';
/* Cronómetro HH:MM:SS (en el gym el tiempo exacto importa, no "12m"). */
function fmtHMS(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
import { RestTimer } from '../services/rest-timer.js';
import { toast } from '../services/toast.js';
import { openModal, closeModal } from '../services/modal.js';
import { vibrate } from '../services/haptics.js';
import { fireConfetti } from '../services/confetti.js';
import { confirmFinishWorkout } from './workout.js';
import { openExerciseSettings } from './exercise-settings.js';
import { App } from '../app.js';

/* ---- estado de módulo (un solo player activo a la vez) ---- */
let idx = 0;
let pages = [];
let date = null;
let elapsedTimer = null;
let restRenderer = null;
let onResize = null;
// Ejercicios añadidos "sobre la marcha" con "Cambiar ej.": SOLO para este
// entrenamiento, NO se escriben en la plantilla de la rutina. Se limpian al
// terminar/cancelar o al abrir un workout distinto.
let extraItems = [];
let lastWorkoutId = null;
/* === Bi-serie (superset) — flujo intercalado ===
 * La vuelta automática al ejercicio A tras el descanso del ejercicio B ya
 * NO usa flags de módulo + detección de flancos (frágil). Ahora pasamos un
 * callback one-shot `onComplete` a RestTimer.start() que se dispara exacta-
 * mente al terminar o saltar el descanso. Ver toggleDone(). */

/** Items del workout activo = los del día + los transitorios (sin duplicar). */
function activeItems(routine) {
  const base = routine ? Store.itemsForDate(routine.id, date) : [];
  const seen = new Set(base.map(it => it.exerciseId));
  return [...base, ...extraItems.filter(it => !seen.has(it.exerciseId))];
}

/**
 * Anota cada página con info de su bi-serie. Después de esta llamada cada
 * página de ejercicio que forma parte de un par tiene:
 *   page.superset = {
 *     groupId,          // gid compartido
 *     pairIndex: 0|1,   // 0 = ejercicio A (primero), 1 = ejercicio B (segundo)
 *     partnerPageIdx,   // índice en `pages` del compañero
 *   }
 * Pages sin bi-serie no llevan el campo (undefined).
 *
 * Importante: el index en `pages` es items_idx + 1 porque pages[0] es la
 * pantalla de calentamiento. La cleanup del Store ya garantiza que solo
 * llegan aquí grupos válidos (par estricto + adyacentes en items[]).
 */
function decorateSupersets(items, pages) {
  const groups = new Map();
  items.forEach((it, i) => {
    if (!it || !it.supersetGroupId) return;
    if (!groups.has(it.supersetGroupId)) groups.set(it.supersetGroupId, []);
    groups.get(it.supersetGroupId).push(i);
  });
  for (const [gid, idxs] of groups) {
    if (idxs.length !== 2) continue;
    const [aItem, bItem] = idxs[0] < idxs[1] ? idxs : [idxs[1], idxs[0]];
    const aPage = pages[aItem + 1];
    const bPage = pages[bItem + 1];
    if (!aPage || !bPage) continue;
    aPage.superset = { groupId: gid, pairIndex: 0, partnerPageIdx: bItem + 1 };
    bPage.superset = { groupId: gid, pairIndex: 1, partnerPageIdx: aItem + 1 };

    // Pista visual en el player: un chip arriba de cada página de la pareja.
    const aPartnerName = bPage.ex ? bPage.ex.name : '';
    const bPartnerName = aPage.ex ? aPage.ex.name : '';
    const aChip = h('div', { class: 'aw-ss-chip', 'data-role': 'A' },
      h('span', { class: 'aw-ss-tag' }, '🔗 Bi-serie · A'),
      h('span', { class: 'aw-ss-sub' }, `tras esta serie: ${aPartnerName}`));
    const bChip = h('div', { class: 'aw-ss-chip', 'data-role': 'B' },
      h('span', { class: 'aw-ss-tag' }, '🔗 Bi-serie · B'),
      h('span', { class: 'aw-ss-sub' }, `de ${bPartnerName}`));
    if (aPage.el) aPage.el.insertBefore(aChip, aPage.el.firstChild);
    if (bPage.el) bPage.el.insertBefore(bChip, bPage.el.firstChild);
  }
}

const REST_RING = 326.726; // 2π·52

/* ============================================================================
   Helpers
   ============================================================================ */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const numify = (v) => (typeof v === 'number' ? v : parseFloat(v));
const intify = (v) => (typeof v === 'number' ? v : parseInt(v, 10));
/** minúsculas + sin acentos, para buscar "biceps" y encontrar "Bíceps". */
const fold = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Primer entero dentro de un rango de reps ("8-12" → 8, "10" → 10). */
function parseTargetReps(repRange) {
  const m = String(repRange || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : '';
}

/** ¿Hay una sesión registrada hoy para este ejercicio? */
function hasSession(exId) {
  return Store.sessionsByDate(date).some(
    s => s.exerciseId === exId && (s.sets || []).length > 0,
  );
}

/** Orden de ejecución estable: el de la sesión si existe, si no el siguiente. */
function computeOrder(exId) {
  const existing = Store.sessionsByDate(date).find(s => s.exerciseId === exId);
  if (existing && existing.order != null) return existing.order;
  const orders = Store.sessionsByDate(date).map(s => s.order).filter(o => o != null);
  return (orders.length ? Math.max(...orders) : 0) + 1;
}

/** Reescribe la sesión del ejercicio con las series marcadas como hechas. */
function persist(state) {
  const doneSets = state.rows
    .filter(r => r.done)
    .map(r => {
      const out = {
        weight: numify(r.weight),
        reps: intify(r.reps),
      };
      if (r.rpe != null && r.rpe !== '' && !isNaN(parseFloat(r.rpe))) {
        out.rpe = parseFloat(r.rpe);
      }
      // === Persistencia del modo "Manos separadas" (is_unilateral) ===
      // Escribimos repsL/repsR si EITHER se ha rellenado (independiente del
      // flag actual). Eso preserva los datos históricos aunque el usuario
      // luego desactive split. La invariante `reps = repsL + repsR` se
      // mantiene → toda la analítica existente sigue funcionando sin tocar.
      //
      // weightL/weightR (refactor unilateral estricto): cuando hay split
      // activo, además del campo `weight` plano (que conservamos como
      // `max(weightL, weightR)` para PR/top-set globales), persistimos
      // el peso ESPECÍFICO de cada lado. Por ahora la UI usa un único
      // input de peso → weightL = weightR = weight. La estructura de
      // datos queda futura-proof para inputs por lado en una siguiente
      // iteración, y la Bitácora + charts duales pueden leer los lados
      // por separado sin más cambios.
      const L = intify(r.repsL);
      const R = intify(r.repsR);
      const hasL = Number.isFinite(L) && L >= 0 && r.repsL !== '';
      const hasR = Number.isFinite(R) && R >= 0 && r.repsR !== '';
      if (hasL || hasR) {
        out.repsL = hasL ? L : 0;
        out.repsR = hasR ? R : 0;
        out.reps  = out.repsL + out.repsR;
      }
      // Si la fila tiene weightL/weightR explícitos (futura UI por lado),
      // los respetamos; si no, espejamos `weight` en ambos lados cuando
      // hay split activo en el ejercicio. Eso garantiza que cada set
      // unilateral tenga DOS pesos consultables independientes.
      const wL = numify(r.weightL);
      const wR = numify(r.weightR);
      const hasWL = Number.isFinite(wL) && wL >= 0 && r.weightL !== '' && r.weightL != null;
      const hasWR = Number.isFinite(wR) && wR >= 0 && r.weightR !== '' && r.weightR != null;
      if (hasWL || hasWR) {
        out.weightL = hasWL ? wL : numify(r.weight);
        out.weightR = hasWR ? wR : numify(r.weight);
        out.weight  = Math.max(out.weightL, out.weightR);
      } else if (state.split) {
        // split activo, sin inputs per-side todavía → espejamos el peso.
        out.weightL = numify(r.weight);
        out.weightR = numify(r.weight);
      }
      return out;
    })
    // Peso corporal: weight=0 es VÁLIDO (sin carga externa). Para el resto,
    // exigimos peso > 0. Las reps siempre deben ser > 0.
    .filter(s => s.reps > 0 && (state.bodyweight ? s.weight >= 0 : s.weight > 0));

  Store.removeSessionFor(date, state.ex.id);
  if (doneSets.length === 0) return null;

  // ¿Es un ejercicio temporal (añadido sobre la marcha)? Marca la sesión
  // para que la Bitácora lo distinga; la rutina nunca se toca.
  const isTemp = extraItems.some(it => it.exerciseId === state.ex.id && it.temporary);

  return Store.addSession({
    date,
    exerciseId: state.ex.id,
    sets: doneSets,
    order: computeOrder(state.ex.id),
    notes: (state.notes || '').trim(),
    // Override manual del usuario para la próxima sesión (transient en UI,
    // persistido en el log para que suggestNextWeight lo respete).
    ...(state.nextOverride ? { nextOverride: state.nextOverride } : {}),
    ...(isTemp ? { temporary: true } : {}),
  });
}

/* ============================================================================
   Página de CALENTAMIENTO — siempre en pages[0]
   ----------------------------------------------------------------------------
   Apple Fitness-style: pantalla dedicada con icono pulsante, título grande,
   subtítulo de duración, lista de tips, y un botón "Marcar completado" que
   persiste en localStorage (`warmup-<date>`).
   El page object devuelve `warmup: true` → isPageDone() lo trata como done
   (no bloquea "Terminar entrenamiento") y nextNavTarget() lo trata como
   gate de inicio (botón "Empezar entrenamiento" → primer ejercicio real).
   ============================================================================ */
function buildWarmupPage(workoutDate) {
  const KEY = 'warmup-' + workoutDate;
  const isOn = () => localStorage.getItem(KEY) === '1';

  const el = h('div', { class: 'aw-page aw-page-warmup' });

  const checkBtn = h('button', {
    class: 'aw-warmup-check' + (isOn() ? ' on' : ''),
    type: 'button',
  }, isOn() ? '✓ Calentamiento completado' : 'Marcar calentamiento completado');

  checkBtn.addEventListener('click', () => {
    if (isOn()) {
      localStorage.removeItem(KEY);
      checkBtn.classList.remove('on');
      checkBtn.textContent = 'Marcar calentamiento completado';
    } else {
      localStorage.setItem(KEY, '1');
      checkBtn.classList.add('on');
      checkBtn.textContent = '✓ Calentamiento completado';
    }
  });

  el.append(
    h('div', { class: 'aw-warmup-hero' },
      h('div', { class: 'aw-warmup-icon', 'aria-hidden': 'true' }, '🔥'),
      h('h2', { class: 'aw-warmup-title' }, 'Calentamiento'),
      h('p', { class: 'aw-warmup-sub' }, '5 - 10 min · prepara tu cuerpo'),
    ),
    h('ul', { class: 'aw-warmup-tips' },
      h('li', null, 'Movilidad articular general'),
      h('li', null, 'Activación dinámica del grupo principal'),
      h('li', null, 'Sube progresivamente hasta la primera carga'),
    ),
    checkBtn,
  );

  return {
    el,
    ex: null,
    item: null,
    warmup: true,             // marca distintiva para isPageDone / nextNavTarget
    refresh() {},
    state: { rows: [] },
  };
}

/* ============================================================================
   Página de un ejercicio
   ============================================================================ */
function buildPage(item, pageIdx) {
  const ex = Store.exerciseById(item.exerciseId);
  const el = h('div', { class: 'aw-page' });

  if (!ex) {
    el.appendChild(h('div', { class: 'aw-ex-head' },
      h('div', { class: 'aw-ex-name' }, '⚠ ejercicio borrado')));
    return { el, ex: null, item, refresh() {}, state: { rows: [] } };
  }

  const last       = Store.lastSession(ex.id, date);
  const lastTop    = last ? topSet(last) : null;
  // Rango efectivo: prioriza el `targetRepRange` per-ejercicio sobre el del
  // item de la rutina. Se lo pasamos a suggestNextWeight para que la
  // auto-progresión use el rango "duro" del ejercicio, no el genérico del día.
  const _exRange = (ex.targetRepRange
                    && Number.isFinite(ex.targetRepRange.min)
                    && Number.isFinite(ex.targetRepRange.max))
    ? `${ex.targetRepRange.min}-${ex.targetRepRange.max}`
    : (item.repRange || '8-12');
  const suggestedW = Store.suggestWeight(ex.id, _exRange, item.sets);
  const baseW      = suggestedW || (lastTop ? lastTop.weight : '');
  const targetReps = parseTargetReps(_exRange)
    || (lastTop ? lastTop.reps : '');

  /* === "Última" dinámica por fila ===
     Antes el placeholder de peso/reps era el mismo para TODAS las filas
     (mostraba el top set durante todo el ejercicio). El usuario perdía
     la referencia de qué hizo en la serie 2 o 3 la semana pasada.
     Ahora cada fila lee SU mismo índice en el array de sets del último
     entrenamiento, con fallback a la última serie registrada si hoy
     añade más series (ej. hoy 4 cuando la semana pasada hizo 3). */
  const lastWorkSets = (last && last.sets)
    ? last.sets.filter(s => !s.warmup && s.reps != null)
    : [];

  function lastSetForRow(i) {
    if (!lastWorkSets.length) return null;
    return lastWorkSets[i] || lastWorkSets[lastWorkSets.length - 1];
  }
  // Prioridad de configuración:
  //   1. Ajustes per-ejercicio (Exercise Settings — refactor v55)
  //   2. Config del item de la rutina
  //   3. Default global
  // Esto deja al usuario afinar parámetros por ejercicio (rest largo en
  // sentadilla, corto en bíceps) sin tocar la plantilla de la rutina.
  const restSec    = (+ex.defaultRest > 0)
    ? +ex.defaultRest
    : (item.rest || Store.getDefaultRest());
  const todayDone  = Store.sessionsByDate(date).find(s => s.exerciseId === ex.id);
  const plannedN   = item.sets || 3;

  // Filas iniciales
  // En modo SPLIT (manos separadas) las series guardan también `repsL` y
  // `repsR`. `reps` se mantiene como SUMA para que toda la analítica
  // existente (volume, PR, 1RM, etc.) siga funcionando sin tocar nada.
  // === Estado de cada fila ===
  // Campos canónicos:
  //   weight, reps           → la "cara bilateral" del set; analytics clásicas
  //                            (PR, top weight, volumen) leen de aquí.
  //   weightL/R, repsL/R     → modo unilateral estricto (is_unilateral). Si
  //                            el usuario activa "Manos separadas", la UI
  //                            edita estos cuatro campos directamente; persist
  //                            sincroniza `weight = max(L,R)` y `reps = L+R`.
  //   rpe                    → opcional.
  let rows;
  if (todayDone && (todayDone.sets || []).length) {
    rows = todayDone.sets.map(s => ({
      weight: s.weight, reps: s.reps,
      weightL: s.weightL ?? (s.weight ?? ''),
      weightR: s.weightR ?? (s.weight ?? ''),
      repsL: s.repsL ?? '', repsR: s.repsR ?? '',
      rpe: s.rpe ?? '', done: true,
    }));
    for (let i = rows.length; i < plannedN; i++) {
      rows.push({ weight: baseW, reps: targetReps,
                  weightL: baseW, weightR: baseW,
                  repsL: '', repsR: '', rpe: '', done: false });
    }
  } else {
    rows = Array.from({ length: plannedN }, () => ({
      weight: baseW, reps: targetReps,
      weightL: baseW, weightR: baseW,
      repsL: '', repsR: '', rpe: '', done: false,
    }));
  }

  const state = {
    ex, item, restSec, rows,
    notes: todayDone?.notes || '',
    /* === Override de carga para la PRÓXIMA sesión ===
       null   → algoritmo automático (suggestNextWeight aplica double-progression)
       'up'   → forzar progreso (+bumpKgFor en la próxima sesión)
       'down' → forzar regresión (-bumpKgFor, mínimo 0)
       Se persiste en la session log → la lee `suggestNextWeight` cuando el
       generador construye la próxima sesión de este ejercicio. */
    nextOverride: todayDone?.nextOverride || null,
    /* === Modo "Manos separadas" (unilateral split) ===
       Boolean per-ejercicio (no per-sesión): persistido en exercises[].
       Cuando true:
         - rowEl renderiza dos mini-steppers (L | R) en vez de uno
         - headRow muestra columnas "KG | L | R" (RPE oculto)
         - persist() escribe repsL + repsR + reps=L+R en cada set
         - validación: la suma L+R > 0 para marcar ✓ done */
    split: !!ex.unilateralSplit,
    /* === Modo "Peso corporal" ===
       Auto-activo para ejercicios marcados progressionType:'bodyweight'
       (dominadas, fondos, flexiones). Cuando true:
         - la columna KG se bloquea a 0 (sin carga externa) y muestra "PC"
         - el foco visual y de entrada es solo las reps
         - toggle OFF si el usuario quiere registrar lastre (peso añadido)
       No se persiste por sesión: deriva del flag del ejercicio + el toggle. */
    bodyweight: ex.progressionType === 'bodyweight',
    prCelebrated: false,
  };
  // En modo peso corporal arrancamos con weight=0 en todas las filas no
  // tocadas (lastre vacío); el usuario puede desbloquear para añadir carga.
  if (state.bodyweight) {
    state.rows.forEach(r => { if (!r.done && (r.weight === baseW || r.weight === '' || r.weight == null)) r.weight = 0; });
  }

  // ---- Cabecera del ejercicio ----
  // Botón "Tips" junto al nombre. Indicador naranja automático si el
  // ejercicio ya tiene notas guardadas en ex.tips.
  const tipsBtn = h('button', {
    class: 'aw-ex-tips' + (ex.tips ? ' has-tips' : ''),
    type: 'button',
    'aria-label': ex.tips
      ? 'Notas técnicas del ejercicio (tienes notas guardadas)'
      : 'Añadir notas técnicas permanentes al ejercicio',
    title: 'Notas técnicas permanentes',
    onClick: () => openTipsModal(ex, () => {
      // Tras guardar refrescamos el indicador visual sin re-renderizar
      // la página entera (mantiene el foco y el scroll del usuario).
      tipsBtn.classList.toggle('has-tips', !!ex.tips);
      tipsBtn.setAttribute('aria-label', ex.tips
        ? 'Notas técnicas del ejercicio (tienes notas guardadas)'
        : 'Añadir notas técnicas permanentes al ejercicio');
    }),
  }, 'Tips');

  /* === Chip "ÚLTIMA" dinámico (refactor v53+) ===
   * Antes mostraba SIEMPRE el `lastTop` (mejor serie de la sesión previa)
   * durante todo el ejercicio. El usuario reportó (IMG_5521/5523) que eso
   * no le servía: necesita ver el reflejo de la SERIE concreta en la que
   * está trabajando ahora mismo. Por ejemplo, si ya cerró la serie 1 con
   * check verde y pasa el foco a la serie 2, el chip debe pasar de
   * "65 kg × 12" (lo que hizo la semana pasada en S1) a "65 kg × 8" (lo
   * que hizo en S2). Esto convierte ÚLTIMA en un espejo serie-por-serie.
   *
   * Implementación: capturamos un ref vivo al <b> del valor y exponemos
   * `updateLastChip()`. Lo llamamos en el render inicial y en cada mutación
   * que cambie el foco — toggleDone (✓/reabrir), removeRow (×), addBtn
   * (+ añadir serie). Resto del flujo sin cambios. */
  const lastValueEl = last ? h('b', null, '') : null;
  // Botón "Ajustes" — abre el modal de Exercise Settings (rest, rango,
  // incremento, tipo de progresión, unilateral). Al guardar refresca el
  // player completo via rebuildPages para reflejar nuevos parámetros sin
  // perder las series ya marcadas (persisten en Store).
  const settingsBtn = h('button', {
    class: 'aw-ex-settings',
    type: 'button',
    'aria-label': 'Ajustes avanzados del ejercicio',
    title: 'Ajustes (descanso, rango, incremento, tipo)',
    onClick: () => openExerciseSettings(ex.id, () => rebuildPages(ex.id)),
  }, '⚙');

  const head = h('div', { class: 'aw-ex-head' },
    h('div', { class: 'aw-ex-titles' },
      h('div', { class: 'aw-ex-name-row' },
        h('div', { class: 'aw-ex-name' }, ex.name),
        tipsBtn,
        settingsBtn,
      ),
      h('div', { class: 'aw-ex-meta' },
        `${escapeH(ex.group)} · ${item.sets}×${_exRange} · descanso ${fmtMMSS(restSec)}`),
    ),
    h('div', { class: 'aw-ex-last' },
      last
        ? h('div', null,
            h('span', { class: 'aw-last-cap' }, 'última'),
            lastValueEl,
          )
        : h('span', { class: 'aw-last-cap' }, 'sin registros'),
    ),
  );

  /**
   * Recalcula el contenido del chip ÚLTIMA según la fila con foco actual.
   * - Foco = primera fila no-done (la "siguiente serie" que el player
   *   resalta en naranja). Si todas están hechas → reflejo de la última fila
   *   como cierre, para mantener una referencia útil en pantalla.
   * - El reflejo histórico de cada fila lo da `lastSetForRow(i)`, que ya
   *   aplica fallback: si la sesión pasada tuvo N series y hoy haces N+k,
   *   las filas extra heredan la última serie histórica.
   * - Si NO hay sesión previa (`!last`), el chip muestra "sin registros"
   *   desde el render inicial — no hay nada que actualizar.
   */
  function updateLastChip() {
    if (!last || !lastValueEl) return;
    const firstUndone = state.rows.findIndex(r => !r.done);
    const focusIdx = firstUndone === -1
      ? state.rows.length - 1   // todas hechas → reflejo de la última fila
      : firstUndone;
    const ref = lastSetForRow(focusIdx);
    if (!ref) {
      lastValueEl.classList.remove('split');
      lastValueEl.textContent = '—';
      return;
    }
    /* UNILATERAL (fix bug 1): si el ejercicio está en modo split Y la serie
     * histórica de referencia trae datos per-lado, mostramos el desglose
     * I / D en dos líneas compactas en vez del valor plano unificado. Si la
     * serie histórica es bilateral (sin repsL/R), caemos al fmtTopSet clásico. */
    const hasSide = ref.repsL != null || ref.repsR != null;
    if (state.split && hasSide) {
      const wL = ref.weightL != null ? ref.weightL : ref.weight;
      const wR = ref.weightR != null ? ref.weightR : ref.weight;
      const rL = ref.repsL != null ? ref.repsL : '–';
      const rR = ref.repsR != null ? ref.repsR : '–';
      lastValueEl.classList.add('split');
      lastValueEl.innerHTML =
        `<span class="aw-last-side i"><i>I</i> ${wL}×${rL}</span>` +
        `<span class="aw-last-side d"><i>D</i> ${wR}×${rR}</span>`;
    } else {
      lastValueEl.classList.remove('split');
      lastValueEl.textContent = fmtTopSet(ref);
    }
  }
  updateLastChip();

  // ---- Lista de series (Módulo 2: fila limpia + check circular) ----
  const setsHost = h('div', { class: 'aw-sets' });

  // Cabecera de columnas (una sola vez, alineada con la grid de la fila).
  //   - Normal: 6 cols → n · KG · REPS · RPE · check · del
  //   - Split:  6 cols → n · KG · L · R · check · del (RPE oculto)
  const headRow = () => {
    if (state.split) {
      // En unilateral las dos sub-filas (I/D) están auto-etiquetadas
      // dentro de cada serie → el header solo necesita los nombres de
      // columna agnósticos: "KG" y "REPS" (sin RPE, sin L/R, sin chk/del).
      return h('div', { class: 'aw-set-head split' },
        h('span', null, ''),     // #
        h('span', null, ''),     // tag I/D
        h('span', null, 'KG'),
        h('span', null, 'REPS'),
        h('span', null, ''),     // ✓
        h('span', null, ''),     // ×
      );
    }
    return h('div', { class: 'aw-set-head' },
      h('span', null, ''),
      h('span', null, 'KG'),
      h('span', null, 'REPS'),
      h('span', null, 'RPE'),
      h('span', null, ''),
      h('span', null, ''),
    );
  };

  /**
   * Módulo 3 — Autofill: al teclear KG en una serie y NO haber historial
   * previo, replica ese peso a las series siguientes que el usuario aún no
   * haya tocado ni completado (sin re-render, para no perder el foco).
   */
  function propagateWeight(fromIdx) {
    const val = state.rows[fromIdx].weight;
    if (val === '' || val == null) return;
    for (let j = fromIdx + 1; j < state.rows.length; j++) {
      const rj = state.rows[j];
      if (rj.done || rj.userW) continue;
      rj.weight = val;
      const dom = setsHost.querySelector(`.aw-set[data-i="${j}"] .aw-w`);
      if (dom) dom.value = val;
    }
  }

  function field(cls, key, row, i, mode) {
    // "Última" per fila: lee el set del MISMO índice en el último workout.
    // Si hoy hay más series que la semana pasada, repite la última serie
    // registrada como referencia (fallback en lastSetForRow).
    const rowLast = lastSetForRow(i);
    const phWeight = rowLast?.weight != null
      ? String(rowLast.weight)
      : (baseW || '');
    const phReps = rowLast?.reps != null
      ? String(rowLast.reps)
      : (targetReps || '');
    const inp = h('input', {
      class: 'aw-in ' + cls,
      type: 'number', inputmode: mode,
      step: key === 'reps' ? '1' : '0.5',
      value: row[key] === '' || row[key] == null ? '' : row[key],
      placeholder: key === 'weight' ? phWeight
                 : key === 'reps'   ? phReps
                 : '',
      disabled: row.done || undefined,    // bloqueado al completar la serie
    });
    const isWeight = key === 'weight' || key === 'weightL' || key === 'weightR';
    inp.addEventListener('input', () => {
      const v = inp.value;
      row[key] = v === '' ? '' : (key === 'reps' ? parseInt(v, 10) : parseFloat(v));
      if (key === 'weight') {
        row.userW = true;                 // esta fila fue editada a mano
        if (!last) propagateWeight(i);    // solo si no hay registro previo
      }
      if (isWeight) fitWeightFont(inp);   // re-escala si cambia el nº de dígitos
      if (row.done) schedulePersist();
    });
    if (isWeight) fitWeightFont(inp);     // estado inicial (valor o placeholder)
    return inp;
  }

  /**
   * Escala el font-size del input de KG según los dígitos que muestra (valor
   * o, si está vacío, su placeholder "ghost"). Evita que un peso de 3+ dígitos
   * (137, 200, 137.5) se recorte contra los botones ± (fix IMG_6101/6102).
   * Togglea las clases .dig3 / .dig4 que define active.css.
   */
  function fitWeightFont(inp) {
    const shown = (inp.value && inp.value.length) ? inp.value : (inp.placeholder || '');
    const digits = String(shown).replace(/[.,\s]/g, '').length;   // sin separadores
    inp.classList.toggle('dig3', digits === 3);
    inp.classList.toggle('dig4', digits >= 4);
  }

  /* Stepper [- N +] para reps: sin teclado nativo en el gym. Smart default:
   * si la celda no tiene valor y se pulsa por primera vez, salta al límite
   * inferior del rango objetivo (12-15 → 12); después ±1. Además marca la
   * fila como `is-under` si el valor queda por debajo del mínimo (aviso).
   *
   * Parámetro `key` permite reutilizar el stepper para reps unificado
   * ('reps') o para los dos lados en modo split ('repsL', 'repsR').
   * Parámetro `extra` añade clase CSS (ej. 'aw-stepper-mini' para split).
   * Parámetro `rowIdx` activa el modo "última per fila" — placeholder ghost
   * + smart-default con el valor del MISMO índice del último entrenamiento. */
  function repsStepper(row, key = 'reps', extra = '', rowIdx = null) {
    // Última per fila: si tenemos índice y hay histórico, leemos el set
    // del mismo índice (con fallback a la última serie registrada).
    const rowLast = (rowIdx != null) ? lastSetForRow(rowIdx) : null;
    const lastRefForKey =
      rowLast == null ? null :
      key === 'reps'  ? rowLast.reps :
      key === 'repsL' ? (rowLast.repsL != null ? rowLast.repsL : null) :
      key === 'repsR' ? (rowLast.repsR != null ? rowLast.repsR : null) :
      null;

    const isEmpty = () => row[key] === '' || row[key] == null;
    const display = () => {
      if (!isEmpty()) return String(row[key]);
      if (lastRefForKey != null) return String(lastRefForKey);   // ghost de "última"
      return '—';
    };
    const val = h('div', {
      class: 'aw-step-val' + (isEmpty() ? ' placeholder' : ''),
    }, display());
    const wrap = h('div', { class: 'aw-stepper' + (extra ? ' ' + extra : '') });

    const refreshUnder = () => {
      // Solo el stepper unificado dispara el aviso `is-under` (en split
      // mode el cálculo "bajo del mínimo" no aplica per-side cleanly).
      if (key !== 'reps') return;
      const cur = parseInt(row.reps, 10);
      const under = !!(targetReps && cur > 0 && cur < targetReps);
      const setRow = wrap.closest('.aw-set');
      if (setRow) setRow.classList.toggle('is-under', under);
    };

    const refreshDisplay = () => {
      val.textContent = display();
      val.classList.toggle('placeholder', isEmpty());
    };

    const bump = (delta) => {
      if (row.done) return;
      const cur = parseInt(row[key], 10);
      if (!Number.isFinite(cur)) {
        // Smart default: salta al valor de la última semana en ESTA serie.
        // Si no hay histórico, cae al targetReps del rango del item.
        row[key] = (lastRefForKey != null ? lastRefForKey : (targetReps || 1));
      } else {
        row[key] = Math.max(0, cur + delta);
      }
      refreshDisplay();
      refreshUnder();
    };

    wrap.append(
      h('button', {
        class: 'aw-step', type: 'button',
        'aria-label': 'Restar repetición',
        disabled: row.done || undefined,
        onClick: () => bump(-1),
      }, '−'),
      val,
      h('button', {
        class: 'aw-step', type: 'button',
        'aria-label': 'Sumar repetición',
        disabled: row.done || undefined,
        onClick: () => bump(+1),
      }, '+'),
    );
    return wrap;
  }

  function rowEl(row, i) {
    const firstUndone = state.rows.findIndex(r => !r.done);
    const isNext = !row.done && i === firstUndone;
    const curReps = parseInt(row.reps, 10);
    const under = !!(targetReps && curReps > 0 && curReps < targetReps);

    /* ============================================================
     * UNILATERAL ESTRICTO — sub-filas apiladas I y D.
     *
     * Layout (CSS grid 6 cols × 2 rows):
     *   [#] [I] [KG_I] [REPS_I] [✓] [×]
     *   [#] [D] [KG_D] [REPS_D] [✓] [×]
     * Donde [#], [✓] y [×] usan grid-row: 1 / 3 (span vertical).
     *
     * Por qué APILADO y no inline:
     *   - Dos pares de inputs + stepper (KG+REPS × L+R) horizontales
     *     colapsan irremediablemente en iPhone (320-414px de ancho útil).
     *   - El usuario lee top-to-bottom igual que en un cuaderno: primero
     *     el lado izquierdo, luego el derecho, marca ✓ cuando ambos
     *     están listos.
     *   - Mantiene la altura de la fila razonable (~96px en split vs
     *     ~52px en bilateral); 4 series caben en pantalla sin scroll.
     * ============================================================ */
    if (state.split) {
      const els = [
        h('div', { class: 'aw-set-n', style: 'grid-area:n' }, String(i + 1)),
        // Sub-fila I
        h('div', { class: 'aw-side-tag aw-side-i', style: 'grid-area:il' }, 'I'),
        h('div', { class: 'aw-side-kg',  style: 'grid-area:ikg' },
          weightField(row, i, 'weightL', 'L')),
        h('div', { class: 'aw-side-reps', style: 'grid-area:irp' },
          repsStepper(row, 'repsL', '', i)),
        // Sub-fila D
        h('div', { class: 'aw-side-tag aw-side-d', style: 'grid-area:dl' }, 'D'),
        h('div', { class: 'aw-side-kg',  style: 'grid-area:dkg' },
          weightField(row, i, 'weightR', 'R')),
        h('div', { class: 'aw-side-reps', style: 'grid-area:drp' },
          repsStepper(row, 'repsR', '', i)),
        // Acciones (span vertical)
        h('button', {
          class: 'aw-check', type: 'button', style: 'grid-area:chk',
          'aria-label': row.done ? 'Reabrir serie' : 'Marcar serie completada',
          onClick: (e) => toggleDone(i, e.currentTarget),
        }, row.done ? '✓' : ''),
        h('button', {
          class: 'aw-set-del', type: 'button', style: 'grid-area:del',
          'aria-label': 'Quitar serie',
          onClick: () => removeRow(i),
        }, '×'),
      ];
      return h('div', {
        class: 'aw-set split'
          + (row.done ? ' is-completed' : '')
          + (isNext ? ' next' : ''),
        dataset: { i: String(i) },
      }, ...els);
    }

    // Modo bilateral clásico.
    // Peso corporal: la celda KG se bloquea a "PC" (peso corporal = 0 carga)
    // y el foco pasa a las reps. Un tap en la pastilla PC desbloquea para
    // añadir lastre puntualmente sin tener que ir a Ajustes.
    const kgCell = state.bodyweight
      ? h('button', {
          class: 'aw-bw-cell', type: 'button',
          'aria-label': 'Peso corporal — pulsa para añadir lastre',
          title: 'Peso corporal (sin carga). Pulsa para añadir lastre.',
          onClick: () => {
            // Desbloqueo SOLO de esta sesión (no toca el tipo persistido del
            // ejercicio). El strip superior permite volver a bloquear.
            state.bodyweight = false;
            toast('Lastre activado — añade el peso extra');
            renderSets();
          },
        }, 'PC')
      : weightField(row, i);
    const baseEls = [
      h('div', { class: 'aw-set-n' }, String(i + 1)),
      kgCell,
    ];
    const midEls = [
      repsStepper(row, 'reps', '', i),
      field('aw-rpe', 'rpe', row, i, 'decimal'),
    ];
    const tailEls = [
      h('button', {
        class: 'aw-check', type: 'button',
        'aria-label': row.done ? 'Reabrir serie' : 'Marcar serie completada',
        onClick: (e) => toggleDone(i, e.currentTarget),
      }, row.done ? '✓' : ''),
      h('button', {
        class: 'aw-set-del', type: 'button', 'aria-label': 'Quitar serie',
        onClick: () => removeRow(i),
      }, '×'),
    ];

    return h('div', {
      class: 'aw-set'
        + (row.done ? ' is-completed' : '')
        + (isNext ? ' next' : '')
        + (under ? ' is-under' : ''),
      dataset: { i: String(i) },
    }, ...baseEls, ...midEls, ...tailEls);
  }

  /**
   * Campo KG con stepper inline: [−] [input editable] [+]
   * - Tap −/+ → -/+`step` kg (default 2.5)
   * - Tap directo en el número → teclado decimal (edición manual)
   * - Smart default: si el input está vacío y tocas +/−, salta al peso
   *   sugerido (baseW) en vez de a 2.5 desde 0.
   * - Min 0 kg (no permite valores negativos).
   *
   * Parámetros:
   *   key — campo del row al que escribe ('weight' bilateral, 'weightL' /
   *         'weightR' en modo unilateral estricto).
   *   side — 'L' | 'R' | null. Cuando se especifica, el smart-default
   *         lee del lado correcto del histórico (lastSetForRow(i).weightL/R
   *         con fallback al weight bilateral).
   */
  function weightField(row, i, key = 'weight', side = null) {
    const inp = field('aw-w', key, row, i, 'decimal');
    const step = +ex.autoIncrementKg > 0 ? +ex.autoIncrementKg : 2.5;
    const isAssisted = ex.progressionType === 'assisted';

    const sideLastWeight = (rowLast) => {
      if (!rowLast) return null;
      if (side === 'L' && rowLast.weightL != null) return rowLast.weightL;
      if (side === 'R' && rowLast.weightR != null) return rowLast.weightR;
      return rowLast.weight;
    };

    const bump = (delta) => {
      if (row.done) return;
      const cur = numify(row[key]);
      let next;
      if (!Number.isFinite(cur) || cur <= 0) {
        const rowLast = lastSetForRow(i);
        const lastW = sideLastWeight(rowLast);
        const sugg = (lastW != null) ? lastW : numify(baseW);
        next = Number.isFinite(sugg) && sugg > 0 ? sugg : Math.max(0, delta);
      } else {
        next = Math.max(0, Math.round((cur + delta) * 2) / 2);
      }
      row[key] = next;
      row.userW = true;
      inp.value = next;
      fitWeightFont(inp);                 // re-escala tras ± (puede pasar a 3 díg.)
      // Autofill solo aplica al campo bilateral (la propagación entre lados
      // independientes sería invasiva — el usuario quiere control fino).
      if (!last && key === 'weight') propagateWeight(i);
      if (row.done) schedulePersist();
    };

    // En modo asistido invertimos las flechas semánticamente: arriba sigue
    // siendo "más asistencia" (regresión) y abajo "menos asistencia"
    // (progreso). Para evitar confusión, etiquetamos como "+/−" pero los
    // títulos del botón se actualizan: + = SUMAR kg de asistencia.
    const minusLabel = isAssisted ? `${step} kg menos de asistencia` : `Restar ${step} kg`;
    const plusLabel  = isAssisted ? `${step} kg más de asistencia` : `Sumar ${step} kg`;

    return h('div', { class: 'aw-w-stepper' },
      h('button', {
        class: 'aw-w-step', type: 'button',
        'aria-label': minusLabel, title: `−${step} kg`,
        disabled: row.done || undefined,
        onClick: () => bump(-step),
      }, '−'),
      inp,
      h('button', {
        class: 'aw-w-step', type: 'button',
        'aria-label': plusLabel, title: `+${step} kg`,
        disabled: row.done || undefined,
        onClick: () => bump(+step),
      }, '+'),
    );
  }

  function renderSets() {
    mount(setsHost, [headRow(), ...state.rows.map(rowEl)]);
    // El chip ÚLTIMA del header refleja la fila CON FOCO (primera no-done).
    // renderSets() se llama tras cada mutación de filas (✓, ×, + añadir,
    // toggle split, override) → mantener el refresh aquí cubre todos los
    // callsites con una sola línea, sin hooks ad-hoc.
    updateLastChip();
  }

  function toggleDone(i, btn) {
    const row = state.rows[i];
    clearTimeout(persistT);   // cancela un persist debounced en vuelo
    if (!row.done) {
      let totalReps;
      let w;
      if (state.split) {
        // === UNILATERAL ESTRICTO ===
        // Requerimos peso Y reps válidos en AMBOS lados. Una serie del
        // unilateral solo está "hecha" cuando se ha entrenado izquierdo
        // y derecho — si falta uno, el usuario aún no terminó la serie.
        // (La regla AND de auto-progresión vive en metTargetStrict; aquí
        // simplemente impedimos cerrar series incompletas.)
        const wL = numify(row.weightL), wR = numify(row.weightR);
        const rL = intify(row.repsL),   rR = intify(row.repsR);
        const okL = Number.isFinite(wL) && wL > 0 && Number.isFinite(rL) && rL > 0;
        const okR = Number.isFinite(wR) && wR > 0 && Number.isFinite(rR) && rR > 0;
        if (!okL || !okR) {
          toast(!okL && !okR
            ? 'Rellena peso y reps en I y D'
            : (!okL ? 'Falta peso o reps en el lado I'
                    : 'Falta peso o reps en el lado D'),
            'bad');
          return;
        }
        // Sincroniza los campos canónicos para que toda la analítica
        // bilateral existente (PR clásico, top weight, sessionVolume)
        // siga funcionando sin tocarse.
        totalReps   = rL + rR;
        row.reps    = totalReps;
        row.weight  = Math.max(wL, wR);
        w           = row.weight;
      } else if (state.bodyweight) {
        // Peso corporal: la carga es 0 (sin lastre). Solo exigimos reps.
        row.weight = 0;
        w = 0;
        totalReps = intify(row.reps);
        if (!(totalReps > 0)) {
          toast('Pon las reps de la serie', 'bad');
          return;
        }
      } else {
        w = numify(row.weight);
        totalReps = intify(row.reps);
        if (!(w > 0) || !(totalReps > 0)) {
          toast('Pon peso y reps en la serie', 'bad');
          return;
        }
      }
      row.done = true;
      const sess = persist(state);
      renderSets();
      refreshProgress();
      // FIX (bug del 'stay' atascado): cuando cierras la ÚLTIMA serie del
      // ÚLTIMO ejercicio pendiente, el botón inferior necesita reevaluar
      // nextNavTarget() para pasar de 'stay'/'next' a 'finish'. Sin esto,
      // el usuario queda atascado con "Completa las series" disabled
      // aunque ya no quede nada pendiente en toda la rutina.
      updateChrome();

      /* ============================================================
       * PR + CONFETI (fix bug 2)
       *
       * Antes: gate = Store.isPR(sess), que evalúa el VOLUMEN de la mejor
       * serie de la sesión vs el histórico. Funciona, pero el usuario
       * reportó disparos inconsistentes. La causa: comparar a nivel de
       * SESIÓN (max sobre todos los sets) en vez del set RECIÉN marcado.
       *
       * Ahora, para ejercicios estándar, comparamos EXPLÍCITAMENTE el
       * volumen de la serie que se acaba de cerrar contra el mejor volumen
       * de serie histórico de este ejercicio (excluyendo la sesión en
       * curso): current_weight × current_reps > historical_best_set_volume.
       * Estricto → dispara confeti el 100% de las veces que se supera.
       *
       * Para 'assisted'/'bodyweight' delegamos en Store.isPR, que invierte
       * la métrica correctamente (menos peso / más reps = progreso).
       *
       * Mapeo unilateral v52: w = max(weightL, weightR), totalReps =
       * repsL + repsR (sincronizados arriba en la rama split) → el volumen
       * de serie usa los MISMOS campos canónicos que bestSetVolume lee del
       * histórico. Comparación manzana-con-manzana garantizada. */
      let isPRHit;
      if (ex.progressionType === 'assisted' || ex.progressionType === 'bodyweight') {
        isPRHit = !!(sess && Store.isPR(sess));
      } else {
        const checkedSetVol = (numify(w) || 0) * (totalReps || 0);
        const histBest = Store.bestHistoricalSetVolume(ex.id, sess && sess.id);
        isPRHit = checkedSetVol > 0 && checkedSetVol > histBest;
      }
      if (isPRHit && !state.prCelebrated) {
        state.prCelebrated = true;
        toast(`¡Nuevo PR en ${ex.name}!`, 'pr');
        vibrate([30, 50, 30, 50, 90]);
        const rect = btn.getBoundingClientRect();
        fireConfetti(rect.left + rect.width / 2, rect.top);
      } else {
        vibrate(15);
      }

      /* ============================================================
       * BI-SERIE — flujo intercalado A → B → rest → A
       *
       * Mi page real en `pages[]` = pageIdx + 1 (offset por warmup).
       * Si esta página tiene metadata `superset`, decide:
       *   - pairIndex 0 (soy A): si B tiene set i pendiente, NO arrancar
       *     descanso; auto-swipe a B para meter el set i.
       *   - pairIndex 1 (soy B): arrancar descanso normal, pero si A tiene
       *     set i+1 pendiente, programar AUTO-VOLVER a A cuando el rest
       *     termine. La vuelta se gestiona en `renderRest()` detectando el
       *     flanco running→idle del RestTimer.
       * Cualquier otro caso (mitad de pareja con compañero terminado,
       * sin pareja, etc.) cae al comportamiento clásico: rest siempre.
       * ============================================================ */
      const myPage = pages[pageIdx + 1];
      const ss = myPage && myPage.superset;
      let suppressRest = false;
      let onRestDone = null;
      if (ss) {
        const partner = pages[ss.partnerPageIdx];
        const partnerRow = partner && partner.state && partner.state.rows[i];
        if (ss.pairIndex === 0 && partnerRow && !partnerRow.done) {
          // Soy A → salto a B para su set i sin disparar descanso.
          suppressRest = true;
          // Micro-delay para que el estado del botón se anime antes del swipe.
          setTimeout(() => goTo(ss.partnerPageIdx), 120);
        } else if (ss.pairIndex === 1) {
          // Soy B → al TERMINAR o SALTAR el descanso, volver a A si A todavía
          // tiene alguna serie pendiente. Callback one-shot robusto: lo
          // dispara RestTimer en finish()/skip(), sin flags de módulo.
          const aHasPending = partner && partner.state
            && partner.state.rows.some(r => !r.done);
          if (aHasPending) {
            const returnPageIdx = ss.partnerPageIdx;
            onRestDone = () => {
              // Solo navegar si el overlay sigue abierto (no minimizado/cerrado).
              const overlay = document.getElementById('activeWorkout');
              if (!overlay || !overlay.classList.contains('show')) return;
              goTo(returnPageIdx);
            };
          }
        }
      }
      if (!suppressRest) {
        RestTimer.start(restSec, ex.name, onRestDone);
      }
    } else {
      row.done = false;
      persist(state);
      renderSets();
      refreshProgress();
      // Mismo motivo en la dirección inversa: reabrir una serie cierra el
      // ejercicio actual y reabre el "stay" o el "next" — necesita refresh.
      updateChrome();
    }
  }

  function removeRow(i) {
    clearTimeout(persistT);
    const wasDone = state.rows[i].done;
    const wasAllDone = state.rows.every(r => r.done);
    state.rows.splice(i, 1);
    if (state.rows.length === 0) {
      state.rows.push({ weight: baseW, reps: targetReps, rpe: '', done: false });
    }
    if (wasDone) { persist(state); refreshProgress(); }
    renderSets();
    // Si la fila eliminada era la que mantenía la serie incompleta — o si
    // tras quitar una done el ejercicio deja de estar 100% completado — el
    // botón inferior necesita reevaluarse.
    if (wasDone || wasAllDone) updateChrome();
  }

  let persistT = null;
  function schedulePersist() {
    clearTimeout(persistT);
    persistT = setTimeout(() => persist(state), 500);
  }

  renderSets();

  const addBtn = h('button', {
    class: 'aw-add', type: 'button',
    onClick: () => {
      const prev = state.rows[state.rows.length - 1];
      state.rows.push({
        weight: prev ? prev.weight : baseW,
        reps: prev ? prev.reps : targetReps,
        rpe: '', done: false,
      });
      renderSets();
    },
  }, '+ añadir serie');

  const notes = h('input', {
    class: 'aw-notes', type: 'text', placeholder: 'Notas (opcional)',
    value: escapeH(state.notes),
  });
  notes.addEventListener('input', () => { state.notes = notes.value; });
  notes.addEventListener('blur', () => { if (hasSession(ex.id)) persist(state); });

  /* === Override de carga para la PRÓXIMA sesión ===
     UI: strip horizontal con label "Próxima sesión" + ▲ subir / ▼ bajar.
     Comportamiento:
       - 1 tap en ▲ → 'up'.   2º tap → cancela (vuelve a null).
       - 1 tap en ▼ → 'down'. 2º tap → cancela.
       - Tapar el opuesto del actual → cambia de dirección.
     El estado se persiste via persist() → se guarda con la session log,
     y suggestNextWeight lo lee al calcular la sugerencia para mañana. */
  const overrideStrip = h('div', { class: 'aw-override' });

  function renderOverride() {
    const v = state.nextOverride;
    overrideStrip.innerHTML = '';
    overrideStrip.append(
      h('span', { class: 'awo-label' }, 'Próxima sesión'),
      h('span', { class: 'awo-spacer' }),
      h('button', {
        class: 'awo-arrow awo-up' + (v === 'up' ? ' on' : ''),
        type: 'button',
        title: 'Forzar +2.5 kg en la próxima sesión',
        'aria-label': v === 'up'
          ? 'Quitar forzado de subida'
          : 'Forzar subida de peso en la próxima sesión',
        'aria-pressed': v === 'up' ? 'true' : 'false',
        onClick: () => setOverride(v === 'up' ? null : 'up'),
      }, '▲'),
      // = · FREEZE/LOCK · congela el peso para la próxima sesión.
      // Puentea al algoritmo: aunque cumplas el rango estricto y la
      // app quisiera subir +2.5 automáticamente, te quedas en el mismo
      // peso (útil para consolidar antes del próximo escalón).
      h('button', {
        class: 'awo-arrow awo-flat' + (v === 'flat' ? ' on' : ''),
        type: 'button',
        title: 'Mantener el mismo peso en la próxima sesión',
        'aria-label': v === 'flat'
          ? 'Quitar bloqueo de carga'
          : 'Bloquear el peso actual para la próxima sesión',
        'aria-pressed': v === 'flat' ? 'true' : 'false',
        onClick: () => setOverride(v === 'flat' ? null : 'flat'),
      }, '='),
      h('button', {
        class: 'awo-arrow awo-down' + (v === 'down' ? ' on' : ''),
        type: 'button',
        title: 'Forzar -2.5 kg en la próxima sesión (descarga)',
        'aria-label': v === 'down'
          ? 'Quitar forzado de bajada'
          : 'Forzar bajada de peso en la próxima sesión',
        'aria-pressed': v === 'down' ? 'true' : 'false',
        onClick: () => setOverride(v === 'down' ? null : 'down'),
      }, '▼'),
    );
  }

  function setOverride(value) {
    state.nextOverride = value;
    renderOverride();
    // Si ya hay session persistida (hay al menos una serie done) actualiza
    // el log al instante. Si no, la marca queda en memoria y se persistirá
    // al cerrar la primera serie. Sin sets done → persist es no-op.
    persist(state);
  }

  renderOverride();

  /* === Toggle "Manos separadas" ===
     Solo visible si el equipamiento del ejercicio admite trabajo
     unilateral o si el usuario ya lo activó manualmente alguna vez
     (preserva su elección en ejercicios custom). */
  const splitToggle = canSplitSides(ex) ? buildSplitToggleStrip(ex, state, renderSets) : null;

  /* === Strip "Peso corporal" ===
     Solo para ejercicios marcados progressionType:'bodyweight'. Toggle
     prominente para alternar entre peso corporal puro (KG bloqueado a PC)
     y modo lastre (KG editable). Session-local: no muta el tipo persistido. */
  const bodyweightStrip = ex.progressionType === 'bodyweight'
    ? buildBodyweightStrip(ex, state, renderSets)
    : null;

  el.append(
    head,
    overrideStrip,
    ...(bodyweightStrip ? [bodyweightStrip] : []),
    ...(splitToggle ? [splitToggle] : []),
    setsHost,
    addBtn,
    h('div', { class: 'aw-notes-wrap' }, notes),
  );

  return {
    el, ex, item, state,
    refresh() { renderSets(); },
  };
}

/* === Helper del modo "Peso corporal" ===
 * Strip prominente con switch iOS. ON = peso corporal puro (KG bloqueado a
 * "PC", solo reps). OFF = lastre (KG editable). Es session-local: NO toca
 * el progressionType persistido del ejercicio (ese se cambia en Ajustes).
 * Al alternar, re-renderiza las filas (la celda KG cambia de PC a stepper). */
function buildBodyweightStrip(ex, state, onRender) {
  const strip = h('div', { class: 'aw-bw-strip' });
  const render = () => {
    strip.innerHTML = '';
    strip.append(
      h('div', { class: 'aw-bw-main' },
        h('div', { class: 'aw-bw-title' }, 'Peso corporal'),
        h('div', { class: 'aw-bw-sub' },
          state.bodyweight
            ? 'Sin carga externa · registra solo las reps'
            : 'Con lastre · introduce el peso añadido'),
      ),
      h('button', {
        class: 'aw-switch' + (state.bodyweight ? ' on' : ''),
        type: 'button',
        'aria-pressed': state.bodyweight ? 'true' : 'false',
        'aria-label': 'Activar / desactivar peso corporal',
        onClick: () => {
          state.bodyweight = !state.bodyweight;
          if (state.bodyweight) {
            // Al volver a peso corporal: limpiar el lastre de las filas no
            // completadas (las completadas conservan su registro histórico).
            state.rows.forEach(r => { if (!r.done) r.weight = 0; });
          }
          render();
          if (onRender) onRender();
        },
      }),
    );
  };
  render();
  return strip;
}

/* === Helpers del modo "Manos separadas" === */

/** Equipos que típicamente admiten trabajo unilateral asimétrico. */
const UNILATERAL_EQUIPMENT = new Set([
  'Mancuernas',     // 1 mancuerna por mano → un brazo puede fallar antes
  'Polea',          // unilateral con polea → un brazo a la vez
]);

/** ¿Tiene sentido mostrar el toggle "Manos separadas" para este ejercicio?
 *  Sí si el equipo es unilateral-friendly O si el flag ya está activo
 *  (preserva la elección del usuario aunque cambien el equipamiento). */
function canSplitSides(ex) {
  if (!ex) return false;
  if (ex.unilateralSplit) return true;
  return ex.equipment && UNILATERAL_EQUIPMENT.has(ex.equipment);
}

/** Construye el strip horizontal con label + switch iOS-style. El switch
 *  alterna `state.split` Y persiste en `exercise.unilateralSplit` para que
 *  la próxima sesión del mismo ejercicio cargue con la misma configuración.
 *  Al cambiar de modo dispara un re-render del sets host (la grid y los
 *  inputs cambian) preservando los valores en memoria de cada fila. */
function buildSplitToggleStrip(ex, state, onRender) {
  const strip = h('div', { class: 'aw-split-toggle' });
  const switchBtn = h('button', {
    class: 'aw-switch' + (state.split ? ' on' : ''),
    type: 'button',
    'aria-pressed': state.split ? 'true' : 'false',
    'aria-label': 'Activar / desactivar modo manos separadas',
    onClick: () => {
      state.split = !state.split;
      Store.updateExercise(ex.id, { unilateralSplit: state.split });
      switchBtn.classList.toggle('on', state.split);
      switchBtn.setAttribute('aria-pressed', state.split ? 'true' : 'false');
      if (onRender) onRender();   // re-render del sets host con la nueva grid
    },
  });
  strip.append(
    h('div', { class: 'awst-label' },
      'Manos separadas',
      h('span', { class: 'awst-help' },
        'Registra reps por brazo cuando uno falla antes que el otro'),
    ),
    switchBtn,
  );
  return strip;
}

/* ============================================================================
   Notas técnicas permanentes del ejercicio
   ----------------------------------------------------------------------------
   Pop-up que escribe a `exercise.tips` (en `data.exercises[]`, NO en el log
   de la sesión). Persistencia automática al cerrar (Apple Notes-style: no
   hay "cancelar"). El indicador naranja del botón ⓘ se refresca tras guardar.
   ============================================================================ */
function openTipsModal(exercise, onSaved) {
  const initial = exercise.tips || '';
  openModal(
    '<div class="modal-head">' +
      '<div>' +
        '<h3>Notas técnicas</h3>' +
        '<div class="tips-sub">' + escapeH(exercise.name) + '</div>' +
      '</div>' +
      '<button class="x" id="tipsClose" type="button" aria-label="Guardar y cerrar">×</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<p class="tips-hint">' +
        'Información <b>permanente</b> del ejercicio · se mostrará en todas las ' +
        'sesiones futuras. Ideal para configuraciones de máquina, claves técnicas ' +
        'o recordatorios de foco.' +
      '</p>' +
      '<textarea id="tipsText" class="tips-textarea" rows="7" ' +
        'placeholder="Ej. Ajustar el banco en la posición 3 · Mantener los codos cerrados · Foco en la fase excéntrica…" ' +
        'autocapitalize="sentences" autocorrect="on" spellcheck="true">' +
        escapeH(initial) +
      '</textarea>' +
    '</div>' +
    '<div class="modal-foot">' +
      '<button class="btn" id="tipsSave" type="button">Listo</button>' +
    '</div>'
  );

  const ta = $('#tipsText');
  // Foco diferido — algunos navegadores no aceptan focus durante un layout
  // pendiente; 60 ms es suficiente para que el modal pinte completo.
  setTimeout(() => ta.focus(), 60);

  function saveAndClose() {
    const next = ta.value.trim();
    if (next !== (initial || '').trim()) {
      // Solo persistimos si cambió algo → evita un emit innecesario que
      // dispararía suscriptores del Store sin razón.
      Store.updateExercise(exercise.id, { tips: next });
      toast(next ? 'Notas guardadas' : 'Notas eliminadas');
    }
    closeModal();
    if (onSaved) onSaved();
  }

  $('#tipsClose').addEventListener('click', saveAndClose);
  $('#tipsSave').addEventListener('click', saveAndClose);
  // Cmd/Ctrl + Enter desde el textarea → guardar (atajo de power-user).
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveAndClose();
    }
  });
}

/* ============================================================================
   Chrome del overlay (cabecera, progreso, descanso, pie)
   ============================================================================ */
function refreshProgress() {
  const dots = $$('#awDots .aw-dot');
  pages.forEach((p, i) => {
    if (!dots[i]) return;
    dots[i].classList.toggle('done', p.ex ? hasSession(p.ex.id) : false);
    dots[i].classList.toggle('cur', i === idx);
  });
}

/* ============================================================================
   Smart finish — el botón inferior detecta pendientes saltados
   ----------------------------------------------------------------------------
   Antes: lógica lineal pura. Si estabas en la última página, "Terminar"
   aparecía AUNQUE el ejercicio 2 estuviera sin tocar porque te lo saltaste.
   Ahora: si quedan pendientes, "Terminar" NO aparece — el botón te lleva al
   primer pendiente saltado ("Volver a [name]"). Solo cuando todos están
   completados el botón pasa a modo "Terminar entrenamiento".
   ============================================================================ */
function isPageDone(page) {
  if (!page) return true;
  if (page.warmup) return true;             // warmup nunca bloquea "Terminar"
  if (!page.ex) return true;                // ejercicio borrado → no bloquea
  if (!page.state || !page.state.rows.length) return false;
  return page.state.rows.every(r => r.done);
}

/**
 * Encuentra el primer ejercicio PENDIENTE en una dirección dada.
 * @param {1|-1} direction +1 = adelante, -1 = atrás
 * @param {number} fromIdx índice inicial (inclusive) de la búsqueda
 * @returns {number} índice del primer pendiente, o -1 si no hay ninguno
 *
 * Usa isPageDone() como criterio → warmup, ejercicios borrados y series
 * 100% completadas se tratan TODOS como "done" → invisibles para nav.
 * Eso es el "Smart Skip / Linear Bypass" del requerimiento: la nav avanza
 * sobre ejercicios completados sin que el usuario lo perciba.
 */
function findPendingIdx(direction, fromIdx) {
  const n = pages.length;
  for (let i = fromIdx; i >= 0 && i < n; i += direction) {
    if (!isPageDone(pages[i])) return i;
  }
  return -1;
}

/** Calcula a dónde debe ir el botón INFERIOR (avanzar/terminar). */
function nextNavTarget() {
  const n = pages.length;
  if (n === 0) return { mode: 'finish' };

  // Warmup → CTA propia "Empezar entrenamiento" → primer ejercicio real.
  if (pages[idx] && pages[idx].warmup) {
    const firstExIdx = pages.findIndex((p, i) => i > 0 && p.ex);
    if (firstExIdx === -1) return { mode: 'finish' };
    return { mode: 'start', targetIdx: firstExIdx };
  }

  if (pages.every(isPageDone)) return { mode: 'finish' };

  // Smart skip ADELANTE: encuentra el primer pendiente desde idx+1.
  const fwd = findPendingIdx(+1, idx + 1);
  if (fwd !== -1) {
    return { mode: 'next', targetIdx: fwd, ex: pages[fwd].ex };
  }

  // Sin pendientes adelante: ¿hay pendientes atrás saltados?
  const bwd = findPendingIdx(-1, idx - 1);
  if (bwd !== -1) {
    return { mode: 'back', targetIdx: bwd, ex: pages[bwd].ex };
  }

  // Caso límite: solo el ejercicio actual está pendiente. No hay a dónde
  // navegar — el usuario debe completar las series aquí. Botón deshabilitado.
  return { mode: 'stay' };
}

function updateChrome() {
  const n = pages.length;
  const cur = pages[idx];

  if (cur && cur.warmup) {
    // Header del warmup: nombre claro, sin pos romana.
    $('#awCounter').textContent = 'Calentamiento';
    $('#awPos').textContent = '';
  } else {
    // En ejercicios reales el contador descuenta el warmup del total.
    const realCount = pages.filter(p => !p.warmup).length;
    const realIdx   = pages.slice(0, idx + 1).filter(p => !p.warmup).length;
    $('#awCounter').textContent = realCount ? `Ej. ${realIdx} / ${realCount}` : '';
    if (cur && cur.ex) {
      const ord = computeOrder(cur.ex.id);
      $('#awPos').textContent = roman(ord);
    } else {
      $('#awPos').textContent = '';
    }
  }

  const foot      = $('#awNext');
  const prevBtn   = $('#awPrev');
  const changeBtn = $('#awChange');
  // Smart prev: visible solo si hay un pendiente HACIA ATRÁS — si todos los
  // anteriores ya están completados, no tiene sentido ofrecer "volver".
  const prevPendingIdx = findPendingIdx(-1, idx - 1);
  prevBtn.style.visibility   = prevPendingIdx !== -1 ? 'visible' : 'hidden';
  prevBtn.setAttribute('data-target-idx', String(prevPendingIdx));
  // "Cambiar ej." no aplica al warmup (no hay ejercicio que cambiar).
  if (changeBtn) changeBtn.style.visibility = (cur && cur.warmup) ? 'hidden' : 'visible';

  const action = nextNavTarget();
  foot.classList.remove('finish', 'return', 'start', 'stay');
  foot.disabled = false;
  foot.innerHTML = '';

  if (action.mode === 'finish') {
    foot.classList.add('finish');
    foot.append(h('span', { class: 'aw-next-name' }, 'Terminar entrenamiento'));
  } else if (action.mode === 'start') {
    // Modo dedicado del warmup → CTA primaria "Empezar entrenamiento".
    foot.classList.add('start');
    foot.append(
      h('span', { class: 'aw-next-name' }, 'Empezar entrenamiento'),
      h('span', { class: 'aw-next-arrow' }, '›'),
    );
  } else if (action.mode === 'back') {
    foot.classList.add('return');
    foot.append(
      h('span', { class: 'aw-next-cap' }, 'Volver a'),
      h('span', { class: 'aw-next-name' }, action.ex ? action.ex.name : '—'),
      h('span', { class: 'aw-next-arrow' }, '↶'),
    );
  } else if (action.mode === 'stay') {
    // Único pendiente = current → no hay donde ir. Botón disabled +
    // mensaje que invita a completar las series aquí.
    foot.classList.add('stay');
    foot.disabled = true;
    foot.append(
      h('span', { class: 'aw-next-cap' }, '·'),
      h('span', { class: 'aw-next-name' }, 'Completa las series'),
    );
  } else {
    // mode === 'next' — apunta al SIGUIENTE PENDIENTE (que puede no ser
    // idx+1 si hay ejercicios ya completados intermedios).
    foot.append(
      h('span', { class: 'aw-next-cap' }, 'Siguiente'),
      h('span', { class: 'aw-next-name' }, action.ex ? action.ex.name : '—'),
      h('span', { class: 'aw-next-arrow' }, '›'),
    );
  }

  refreshProgress();
}

function goTo(i) {
  const stage = $('#awStage');
  idx = clamp(i, 0, pages.length - 1);
  const track = $('#awTrack');
  track.style.transform = `translateX(${-idx * stage.offsetWidth}px)`;
  if (pages[idx]) pages[idx].el.scrollTop = 0;
  updateChrome();
}

/* ============================================================================
   Módulo 4 — Cambiar ejercicio (saltar en la rutina / añadir del catálogo)
   ============================================================================ */

/** Reconstruye las páginas desde el Store (tras añadir un ejercicio) y
 * navega al ejercicio indicado. Las series ya completadas están persistidas;
 * las no completadas se vuelven a derivar (sugerencia/última). */
function rebuildPages(focusExId) {
  const a = Store.activeWorkout();
  const routine = a && a.routineId ? Store.routineById(a.routineId) : null;
  const items = activeItems(routine);
  // Pages[0] = warmup; pages[1..n] = ejercicios reales.
  // Si no hay items, no añadimos warmup (no tiene sentido warmupear para nada).
  pages = items.length
    ? [buildWarmupPage(date), ...items.map((it, i) => buildPage(it, i))]
    : [];
  decorateSupersets(items, pages);

  const track = $('#awTrack');
  if (track) mount(track, pages.map(p => p.el));

  const dots = $('#awDots');
  if (dots) mount(dots, pages.map((p, i) => h('button', {
    class: 'aw-dot', type: 'button', 'aria-label': `Ejercicio ${i + 1}`,
    onClick: () => goTo(i),
  })));

  const ni = focusExId ? pages.findIndex(p => p.ex && p.ex.id === focusExId) : idx;
  goTo(ni === -1 ? idx : ni);
}

function closeSheet() {
  const s = document.getElementById('awSheet');
  if (s) s.remove();
}

function addCatalogOnTheFly(catId) {
  const a = Store.activeWorkout();
  if (!a || !a.routineId) { toast('Este entrenamiento no tiene rutina', 'bad'); return; }
  const cat = EXERCISE_CATALOG.find(c => c.id === catId);
  if (!cat) return;
  const e = catalogToExercise(cat);
  Store.addExerciseFromCatalog(catId);   // crea el ejercicio en biblioteca
  // SOLO para este entrenamiento: no contamina la plantilla de la rutina.
  // `temporary:true` → la sesión resultante se marca como temporal y se
  // guarda en la Bitácora, pero el ejercicio NUNCA se añade al día/rutina.
  if (!extraItems.some(it => it.exerciseId === catId)) {
    extraItems.push({
      exerciseId: catId, sets: e.defaultSets, repRange: e.defaultRepRange,
      rest: Store.getDefaultRest(), days: [], temporary: true,
    });
  }
  closeSheet();
  rebuildPages(catId);
  toast(`Ejercicio temporal añadido: ${e.name}`);
}

function openChangeSheet() {
  closeSheet();
  const overlay = $('#activeWorkout');
  if (!overlay) return;

  // a) Saltar a otro ejercicio de la rutina
  const others = pages
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i !== idx && p.ex);
  const jumpList = others.length
    ? others.map(({ p, i }) => h('button', {
        class: 'aw-sheet-row', type: 'button',
        onClick: () => { closeSheet(); goTo(i); },
      },
        h('span', { class: 'aw-sheet-row-name' }, p.ex.name),
        h('span', { class: 'aw-sheet-row-tag' },
          hasSession(p.ex.id) ? '✓ hecho' : `Ej. ${i + 1}`),
      ))
    : [h('div', { class: 'aw-sheet-empty' }, 'No hay más ejercicios en la rutina.')];

  // b) Añadir un ejercicio del catálogo (búsqueda por nombre / grupo)
  const listHost = h('div', { class: 'aw-sheet-list' });
  const renderCat = (q) => {
    const fq = fold(q);
    const res = EXERCISE_CATALOG.filter(c =>
      !fq || fold(c.nombre).includes(fq) || fold(c.grupo_muscular).includes(fq)
    ).slice(0, 40);
    mount(listHost, res.length
      ? res.map(c => h('button', {
          class: 'aw-sheet-row', type: 'button',
          onClick: () => addCatalogOnTheFly(c.id),
        },
          h('span', { class: 'aw-sheet-row-name' }, c.nombre),
          h('span', { class: 'aw-sheet-row-tag' },
            `${c.grupo_muscular} · ${c.equipamiento}`),
        ))
      : [h('div', { class: 'aw-sheet-empty' }, 'Sin resultados.')]);
  };
  const search = h('input', {
    class: 'aw-sheet-search', type: 'text',
    placeholder: 'Buscar por nombre o grupo muscular…',
  });
  search.addEventListener('input', () => renderCat(search.value));

  const sheet = h('div', { class: 'aw-sheet-bg', id: 'awSheet',
    onClick: (e) => { if (e.target.id === 'awSheet') closeSheet(); } },
    h('div', { class: 'aw-sheet' },
      h('div', { class: 'aw-sheet-head' },
        h('h3', null, 'Cambiar ejercicio'),
        h('button', { class: 'aw-sheet-x', type: 'button',
          'aria-label': 'Cerrar', onClick: () => closeSheet() }, '×'),
      ),
      h('div', { class: 'aw-sheet-body' },
        h('div', { class: 'aw-sheet-cap' }, 'Saltar a otro de la rutina'),
        h('div', { class: 'aw-sheet-jump' }, ...jumpList),
        h('div', { class: 'aw-sheet-cap' }, 'Añadir ejercicio temporal'),
        h('div', { class: 'aw-sheet-note' },
          'Solo para hoy · se guarda en tu Bitácora pero NO en la rutina.'),
        search,
        listHost,
      ),
    ),
  );
  overlay.appendChild(sheet);
  renderCat('');
}

function bindSwipe() {
  const stage = $('#awStage');
  const track = $('#awTrack');
  let sx = 0, sy = 0, dragging = false, decided = false, horiz = false, base = 0;

  stage.addEventListener('touchstart', (e) => {
    if (e.target.closest('input, textarea')) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    dragging = true; decided = false; horiz = false;
    base = -idx * stage.offsetWidth;
    track.style.transition = 'none';
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = true;
      horiz = Math.abs(dx) > Math.abs(dy);
    }
    if (!horiz) return;
    e.preventDefault();
    let tx = base + dx;
    const min = -(pages.length - 1) * stage.offsetWidth;
    if (tx > 0) tx = tx * 0.35;
    if (tx < min) tx = min + (tx - min) * 0.35;
    track.style.transform = `translateX(${tx}px)`;
  }, { passive: false });

  stage.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    track.style.transition = '';
    if (!horiz) return;
    const dx = e.changedTouches[0].clientX - sx;
    const w = stage.offsetWidth;
    if (dx < -w * 0.2) goTo(idx + 1);
    else if (dx > w * 0.2) goTo(idx - 1);
    else goTo(idx);
  });
}

/* ---- Timer grande de descanso (espejo del RestTimer) ---- */
function buildRest() {
  return h('div', { class: 'aw-rest', id: 'awRest', hidden: true },
    h('div', { class: 'aw-rest-ring' },
      h('div', { class: 'aw-rest-time', id: 'awRestTime' }, '0:00'),
    ),
    h('div', { class: 'aw-rest-mid' },
      h('div', { class: 'aw-rest-name', id: 'awRestName' }, 'Descanso'),
      h('div', { class: 'aw-rest-actions' },
        h('button', { type: 'button', onClick: () => RestTimer.add(-15) }, '−15'),
        h('button', { type: 'button', onClick: () => RestTimer.add(15) }, '+15'),
        h('button', { class: 'skip', type: 'button',
          onClick: () => RestTimer.skip() }, 'Saltar'),
      ),
    ),
  );
}

function renderRest(s) {
  const host = $('#awRest');
  if (!host) return;
  if (!s.running || s.remaining <= 0) {
    host.hidden = true;
    // La vuelta de bi-serie ya NO se gestiona aquí (era frágil con flancos);
    // ahora la dispara el callback onComplete de RestTimer. Ver toggleDone().
    return;
  }
  host.hidden = false;
  $('#awRestTime').textContent = fmtMMSS(s.remaining);
  $('#awRestName').textContent = s.exName || 'Descanso';
  const ring = host.querySelector('.aw-rest-ring');
  const pct = s.total ? (1 - s.remaining / s.total) : 0;
  ring.style.background =
    `conic-gradient(var(--accent) ${pct * 360}deg, var(--line) 0)`;
}

/* ============================================================================
   Acciones (terminar / cancelar / minimizar)
   ============================================================================ */
/**
 * Módulo 5 — Reset total de la sesión de entrenamiento.
 *
 * Diferencia clave con `closeActiveWorkout()` (que es solo "minimizar" y
 * deja el descanso corriendo a propósito): aquí SÍ matamos el RestTimer.
 * Era el bug del "timer fantasma": al Terminar, el #restPanel seguía
 * contando con el nombre de un ejercicio anterior porque nadie llamaba a
 * `RestTimer.stop()`.
 */
export function resetWorkoutSession() {
  RestTimer.stop();        // clearInterval del descanso + oculta #restPanel
  closeActiveWorkout();    // overlay + elapsedTimer + suscripción + estado
  extraItems = [];         // los ejercicios "solo hoy" no sobreviven al fin
  lastWorkoutId = null;
}

function finishFromPlayer() {
  const a = Store.activeWorkout();
  if (!a) { resetWorkoutSession(); App.showHome(); return; }
  if (!confirm('¿Terminar entrenamiento?')) return;
  resetWorkoutSession();
  App.showHome();             // estado limpio en view-home
  confirmFinishWorkout(a.id); // sella fin + resumen + refresh + háptica
}

function cancelFromPlayer() {
  if (!confirm('¿Cancelar el entrenamiento? Las series registradas se conservan.')) return;
  const a = Store.activeWorkout();
  if (a) Store.cancelWorkout(a.id);
  resetWorkoutSession();
  App.showHome();
  toast('Entrenamiento cancelado');
  App.refreshAll();
}

/* ============================================================================
   API pública
   ============================================================================ */
export function openActiveWorkout() {
  const a = Store.activeWorkout();
  if (!a) { toast('No hay entrenamiento activo', 'bad'); return; }

  const overlay = $('#activeWorkout');
  if (!overlay) return;

  date = a.date;
  // Workout distinto al último abierto → descarta extras del anterior.
  if (a.id !== lastWorkoutId) { extraItems = []; lastWorkoutId = a.id; }
  const routine = a.routineId ? Store.routineById(a.routineId) : null;
  const items = activeItems(routine);

  // Construir páginas: warmup en pages[0], ejercicios en pages[1..n].
  pages = items.length
    ? [buildWarmupPage(date), ...items.map((it, i) => buildPage(it, i))]
    : [];
  decorateSupersets(items, pages);

  // Decisión de la página inicial:
  //   - Workout NUEVO (ningún ejercicio iniciado todavía) → pages[0] = warmup.
  //   - Workout en CURSO (ya hay sesiones registradas) → primer pendiente,
  //     saltándose el warmup (no tiene sentido volver a calentar a mitad).
  const hasAnySession = pages.some(p => p.ex && hasSession(p.ex.id));
  if (!hasAnySession) {
    idx = pages.length ? 0 : 0;       // arranca en warmup
  } else {
    const start = pages.findIndex(p => p.ex && !hasSession(p.ex.id));
    idx = start === -1 ? 0 : start;
  }

  const track = h('div', { class: 'aw-track', id: 'awTrack' },
    ...(pages.length ? pages.map(p => p.el)
      : [h('div', { class: 'aw-page' },
          h('div', { class: 'aw-empty' },
            'Este día no tiene ejercicios.',
            h('br'), h('br'),
            h('button', { class: 'btn', onClick: () => finishFromPlayer() },
              'Terminar')))]),
  );

  mount(overlay, [
    h('div', { class: 'aw-top' },
      h('button', {
        class: 'aw-min', type: 'button', 'aria-label': 'Minimizar',
        onClick: () => closeActiveWorkout(),
      }, '⌄'),
      h('div', { class: 'aw-top-mid' },
        h('div', { class: 'aw-elapsed', id: 'awElapsed' }, '00:00:00'),
        h('div', { class: 'aw-routine' }, routine ? routine.name : 'Entrenamiento libre'),
      ),
      h('div', { class: 'aw-top-actions' },
        h('button', { class: 'aw-cancel', type: 'button',
          onClick: () => cancelFromPlayer() }, 'Cancelar'),
        h('button', { class: 'aw-finish', type: 'button',
          onClick: () => finishFromPlayer() }, 'Terminar'),
      ),
    ),
    h('div', { class: 'aw-progress' },
      h('div', { class: 'aw-pos-chip', id: 'awPos' }, ''),
      h('div', { class: 'aw-dots', id: 'awDots' },
        ...pages.map((p, i) => h('button', {
          class: 'aw-dot', type: 'button', 'aria-label': `Ejercicio ${i + 1}`,
          onClick: () => goTo(i),
        })),
      ),
      h('div', { class: 'aw-counter', id: 'awCounter' }, ''),
    ),
    h('div', { class: 'aw-stage', id: 'awStage' }, track),
    buildRest(),
    h('div', { class: 'aw-foot' },
      h('button', { class: 'aw-prev', id: 'awPrev', type: 'button',
        'aria-label': 'Anterior ejercicio pendiente',
        // Smart skip atrás: salta a la primera página PENDIENTE en sentido
        // descendente. Si no hay ninguna, no-op (el botón está oculto vía
        // updateChrome). Esto evita pasar por done exercises camino atrás.
        onClick: () => {
          const target = findPendingIdx(-1, idx - 1);
          if (target !== -1) goTo(target);
        } }, '‹'),
      h('button', { class: 'aw-change', id: 'awChange', type: 'button',
        onClick: () => openChangeSheet() }, '⇄ Cambiar ej.'),
      h('button', { class: 'aw-next', id: 'awNext', type: 'button',
        // El handler delega en nextNavTarget(), que mira el progreso GLOBAL
        // (no solo `idx`) y decide entre: salto al siguiente pendiente,
        // volver a un pendiente saltado, terminar entrenamiento, o no-op
        // (modo 'stay' cuando solo el current está pendiente).
        onClick: () => {
          const a = nextNavTarget();
          if (a.mode === 'finish') return finishFromPlayer();
          if (a.mode === 'stay')   return;
          return goTo(a.targetIdx);
        } }),
    ),
  ]);

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('aw-open');

  bindSwipe();
  goTo(idx);

  // Cronómetro de sesión
  const startMs = new Date(a.startAt).getTime();
  const tickElapsed = () => {
    const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const elEl = $('#awElapsed');
    if (elEl) elEl.textContent = fmtHMS(s);
  };
  tickElapsed();
  elapsedTimer = setInterval(tickElapsed, 1000);

  // Espejo del descanso
  restRenderer = renderRest;
  RestTimer.subscribe(restRenderer);

  onResize = () => goTo(idx);
  window.addEventListener('resize', onResize);
}

export function closeActiveWorkout() {
  const overlay = $('#activeWorkout');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '';
  }
  document.body.classList.remove('aw-open');
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  if (restRenderer) { RestTimer.unsubscribe(restRenderer); restRenderer = null; }
  if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
  pages = [];
  idx = 0;
}
