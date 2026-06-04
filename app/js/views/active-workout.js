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
import { vibrate } from '../services/haptics.js';
import { fireConfetti } from '../services/confetti.js';
import { confirmFinishWorkout } from './workout.js';
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

/** Items del workout activo = los del día + los transitorios (sin duplicar). */
function activeItems(routine) {
  const base = routine ? Store.itemsForDate(routine.id, date) : [];
  const seen = new Set(base.map(it => it.exerciseId));
  return [...base, ...extraItems.filter(it => !seen.has(it.exerciseId))];
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
    .map(r => ({
      weight: numify(r.weight),
      reps: intify(r.reps),
      ...(r.rpe != null && r.rpe !== '' && !isNaN(parseFloat(r.rpe))
        ? { rpe: parseFloat(r.rpe) } : {}),
    }))
    .filter(s => s.weight > 0 && s.reps > 0);

  Store.removeSessionFor(date, state.ex.id);
  if (doneSets.length === 0) return null;

  return Store.addSession({
    date,
    exerciseId: state.ex.id,
    sets: doneSets,
    order: computeOrder(state.ex.id),
    notes: (state.notes || '').trim(),
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
  const suggestedW = Store.suggestWeight(ex.id, item.repRange, item.sets);
  const baseW      = suggestedW || (lastTop ? lastTop.weight : '');
  const targetReps = parseTargetReps(item.repRange)
    || (lastTop ? lastTop.reps : '');
  const restSec    = item.rest || Store.getDefaultRest();
  const todayDone  = Store.sessionsByDate(date).find(s => s.exerciseId === ex.id);
  const plannedN   = item.sets || 3;

  // Filas iniciales
  let rows;
  if (todayDone && (todayDone.sets || []).length) {
    rows = todayDone.sets.map(s => ({
      weight: s.weight, reps: s.reps, rpe: s.rpe ?? '', done: true,
    }));
    for (let i = rows.length; i < plannedN; i++) {
      rows.push({ weight: baseW, reps: targetReps, rpe: '', done: false });
    }
  } else {
    rows = Array.from({ length: plannedN }, () => ({
      weight: baseW, reps: targetReps, rpe: '', done: false,
    }));
  }

  const state = {
    ex, item, restSec, rows,
    notes: todayDone?.notes || '',
    prCelebrated: false,
  };

  // ---- Cabecera del ejercicio ----
  const head = h('div', { class: 'aw-ex-head' },
    h('div', { class: 'aw-ex-titles' },
      h('div', { class: 'aw-ex-name' }, ex.name),
      h('div', { class: 'aw-ex-meta' },
        `${escapeH(ex.group)} · ${item.sets}×${item.repRange} · descanso ${fmtMMSS(restSec)}`),
    ),
    h('div', { class: 'aw-ex-last' },
      last
        ? h('div', null,
            h('span', { class: 'aw-last-cap' }, 'última'),
            h('b', null, fmtTopSet(lastTop)))
        : h('span', { class: 'aw-last-cap' }, 'sin registros'),
    ),
  );

  // ---- Lista de series (Módulo 2: fila limpia + check circular) ----
  const setsHost = h('div', { class: 'aw-sets' });

  // Cabecera de columnas (una sola vez, alineada con la grid de la fila)
  const headRow = () => h('div', { class: 'aw-set-head' },
    h('span', null, ''),
    h('span', null, 'KG'),
    h('span', null, 'REPS'),
    h('span', null, 'RPE'),
    h('span', null, ''),
    h('span', null, ''),
  );

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
    const inp = h('input', {
      class: 'aw-in ' + cls,
      type: 'number', inputmode: mode,
      step: key === 'reps' ? '1' : '0.5',
      value: row[key] === '' || row[key] == null ? '' : row[key],
      placeholder: key === 'weight'
        ? (baseW || '') : key === 'reps' ? (targetReps || '') : '',
      disabled: row.done || undefined,    // bloqueado al completar la serie
    });
    inp.addEventListener('input', () => {
      const v = inp.value;
      row[key] = v === '' ? '' : (key === 'reps' ? parseInt(v, 10) : parseFloat(v));
      if (key === 'weight') {
        row.userW = true;                 // esta fila fue editada a mano
        if (!last) propagateWeight(i);    // solo si no hay registro previo
      }
      if (row.done) schedulePersist();
    });
    return inp;
  }

  /* Stepper [- N +] para reps: sin teclado nativo en el gym. Smart default:
   * si la celda no tiene valor y se pulsa por primera vez, salta al límite
   * inferior del rango objetivo (12-15 → 12); después ±1. Además marca la
   * fila como `is-under` si el valor queda por debajo del mínimo (aviso). */
  function repsStepper(row) {
    const display = () =>
      row.reps === '' || row.reps == null ? '—' : String(row.reps);
    const val = h('div', { class: 'aw-step-val' }, display());
    const wrap = h('div', { class: 'aw-stepper' });

    const refreshUnder = () => {
      const cur = parseInt(row.reps, 10);
      const under = !!(targetReps && cur > 0 && cur < targetReps);
      const setRow = wrap.closest('.aw-set');
      if (setRow) setRow.classList.toggle('is-under', under);
    };

    const bump = (delta) => {
      if (row.done) return;
      const cur = parseInt(row.reps, 10);
      if (!Number.isFinite(cur)) row.reps = targetReps || 1;     // 1ª pulsación → al target
      else                       row.reps = Math.max(1, cur + delta);
      val.textContent = display();
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
    return h('div', {
      class: 'aw-set'
        + (row.done ? ' is-completed' : '')
        + (isNext ? ' next' : '')
        + (under ? ' is-under' : ''),
      dataset: { i: String(i) },
    },
      h('div', { class: 'aw-set-n' }, String(i + 1)),
      field('aw-w', 'weight', row, i, 'decimal'),
      repsStepper(row),
      field('aw-rpe', 'rpe', row, i, 'decimal'),
      h('button', {
        class: 'aw-check', type: 'button',
        'aria-label': row.done ? 'Reabrir serie' : 'Marcar serie completada',
        onClick: (e) => toggleDone(i, e.currentTarget),
      }, row.done ? '✓' : ''),
      h('button', {
        class: 'aw-set-del', type: 'button', 'aria-label': 'Quitar serie',
        onClick: () => removeRow(i),
      }, '×'),
    );
  }

  function renderSets() {
    mount(setsHost, [headRow(), ...state.rows.map(rowEl)]);
  }

  function toggleDone(i, btn) {
    const row = state.rows[i];
    clearTimeout(persistT);   // cancela un persist debounced en vuelo
    if (!row.done) {
      const w = numify(row.weight), reps = intify(row.reps);
      if (!(w > 0) || !(reps > 0)) {
        toast('Pon peso y reps en la serie', 'bad');
        return;
      }
      row.done = true;
      const sess = persist(state);
      renderSets();
      refreshProgress();
      const isPR = sess && Store.isPR(sess);
      if (isPR && !state.prCelebrated) {
        state.prCelebrated = true;
        toast(`¡Nuevo PR en ${ex.name}!`, 'pr');
        vibrate([30, 50, 30, 50, 90]);
        const rect = btn.getBoundingClientRect();
        fireConfetti(rect.left + rect.width / 2, rect.top);
      } else {
        vibrate(15);
      }
      RestTimer.start(restSec, ex.name);
    } else {
      row.done = false;
      persist(state);
      renderSets();
      refreshProgress();
    }
  }

  function removeRow(i) {
    clearTimeout(persistT);
    const wasDone = state.rows[i].done;
    state.rows.splice(i, 1);
    if (state.rows.length === 0) {
      state.rows.push({ weight: baseW, reps: targetReps, rpe: '', done: false });
    }
    if (wasDone) { persist(state); refreshProgress(); }
    renderSets();
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

  el.append(
    head,
    setsHost,
    addBtn,
    h('div', { class: 'aw-notes-wrap' }, notes),
  );

  return {
    el, ex, item, state,
    refresh() { renderSets(); },
  };
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

/** Calcula a dónde debe ir el botón inferior según el progreso GLOBAL. */
function nextNavTarget() {
  const n = pages.length;
  if (n === 0) return { mode: 'finish' };

  // Estamos en el warmup → modo "Empezar entrenamiento" (CTA propia).
  // Salto al primer ejercicio real (con ex válido).
  if (pages[idx] && pages[idx].warmup) {
    const firstExIdx = pages.findIndex((p, i) => i > 0 && p.ex);
    if (firstExIdx === -1) return { mode: 'finish' };
    return { mode: 'start', targetIdx: firstExIdx };
  }

  const allDone = pages.every(isPageDone);
  if (allDone) return { mode: 'finish' };

  // Linear: ¿hay un siguiente directo? (mantiene la UX habitual sin saltos)
  if (idx < n - 1) {
    return { mode: 'next', targetIdx: idx + 1, ex: pages[idx + 1].ex };
  }

  // Estamos en la ÚLTIMA pero algo está pendiente → vuelta al primer saltado.
  const skipIdx = pages.findIndex((p, i) => i !== idx && !isPageDone(p));
  if (skipIdx === -1) {
    return { mode: 'finish' };
  }
  return { mode: 'back', targetIdx: skipIdx, ex: pages[skipIdx].ex };
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
  prevBtn.style.visibility   = idx > 0 ? 'visible' : 'hidden';
  // "Cambiar ej." no aplica al warmup (no hay ejercicio que cambiar).
  if (changeBtn) changeBtn.style.visibility = (cur && cur.warmup) ? 'hidden' : 'visible';

  const action = nextNavTarget();
  foot.classList.remove('finish', 'return', 'start');
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
  } else {
    // mode === 'next'
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
  if (!extraItems.some(it => it.exerciseId === catId)) {
    extraItems.push({
      exerciseId: catId, sets: e.defaultSets, repRange: e.defaultRepRange,
      rest: Store.getDefaultRest(), days: [],
    });
  }
  closeSheet();
  rebuildPages(catId);
  toast(`Añadido (solo hoy): ${e.name}`);
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
        h('div', { class: 'aw-sheet-cap' }, 'Añadir de la base de datos'),
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
          onClick: () => RestTimer.stop() }, 'Saltar'),
      ),
    ),
  );
}

function renderRest(s) {
  const host = $('#awRest');
  if (!host) return;
  if (!s.running || s.remaining <= 0) {
    host.hidden = true;
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
        'aria-label': 'Anterior', onClick: () => goTo(idx - 1) }, '‹'),
      h('button', { class: 'aw-change', id: 'awChange', type: 'button',
        onClick: () => openChangeSheet() }, '⇄ Cambiar ej.'),
      h('button', { class: 'aw-next', id: 'awNext', type: 'button',
        // El handler delega en nextNavTarget(), que mira el progreso GLOBAL
        // (no solo `idx`) y decide entre: ir al siguiente lineal, volver al
        // primer pendiente saltado, o disparar finishFromPlayer.
        onClick: () => {
          const a = nextNavTarget();
          if (a.mode === 'finish') return finishFromPlayer();
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
