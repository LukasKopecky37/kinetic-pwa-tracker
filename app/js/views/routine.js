/**
 * Vista Rutina — tarjetas de ejercicios para la fecha actual.
 *
 * v6 (Fase H): cada tarjeta tiene una lista vertical de SETS, cada uno con
 *   peso · reps · RPE · botón eliminar. "+ Añadir serie" al pie de la lista.
 *   El primer set se pre-rellena con el top set de la última sesión.
 *   Añadir un set hereda peso del set anterior.
 *
 * El orden de ejecución se autoasigna en función del orden de guardado del
 * día (primer ejercicio que guardas hoy = I, segundo = II…). No hay stepper
 * manual. Si quieres editar el orden de una sesión pasada, lo haces desde el
 * modal de edición del historial.
 */

import { $, $$ } from '../utils/dom.js';
import { fmtDate } from '../utils/date.js';
import { fmtMMSS, fmtRepsCompact, fmtTopSet, escapeH } from '../utils/format.js';
import { roman } from '../utils/roman.js';
import { Store } from '../store/store.js';
import { topSet } from '../analytics/prs.js';
import { muscleSVG } from '../components/muscle-map.js';
import { RestTimer } from '../services/rest-timer.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { compute as plateCompute, PLATE_CLASS } from '../services/plate-calc.js';
import { fireConfetti } from '../services/confetti.js';
import { vibrate } from '../services/haptics.js';
import { promptStartWorkout, confirmFinishWorkout } from './workout.js';
import { fmtDuration } from '../analytics/workout-summary.js';
import { App } from '../app.js';

export function renderRoutine() {
  const r = Store.routineById(App.state.currentRoutineId);
  if (!r) { App.showHome(); return; }

  const date = App.state.currentDate;
  const active     = Store.activeMusclesForDay(r.id, date);
  const items      = Store.itemsForDate(r.id, date);
  const usedGroups = [...new Set(items.map(it => Store.exerciseById(it.exerciseId)?.group).filter(Boolean))];

  renderWorkoutActions(r.id, date);

  $('#muscleMap').innerHTML = items.length === 0 ? '' : `
    <div class="muscle-wrap">
      <div class="muscle-svg">${muscleSVG(active)}</div>
      <div class="muscle-legend">
        <h4>Trabajas hoy</h4>
        <div class="muscle-tags">
          ${usedGroups.map(g => `<span class="m-tag">${escapeH(g)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;

  const list = $('#exerciseList');
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = `<div class="empty">
      Esta rutina todavía no tiene ejercicios.<br><br>
      <button class="btn small" id="btnEdRoute">Editar rutina</button>
    </div>`;
    $('#btnEdRoute')?.addEventListener('click', () => {
      import('./settings.js').then(m => m.openRoutineEditor(r.id));
    });
    return;
  }

  // Orden auto: el siguiente número disponible para ese día
  const todayOrders = Store.sessionsByDate(date).map(s => s.order).filter(o => o != null);
  const nextOrder = (todayOrders.length ? Math.max(...todayOrders) : 0) + 1;

  // Calentamiento al principio · check por fecha en localStorage
  // (no contamina el modelo Workout / Store; es solo estado de UI persistente).
  list.appendChild(buildWarmupCard(date));
  items.forEach((it) => list.appendChild(buildExerciseCard(r, it, nextOrder)));
}

/* ============================================================================
   Calentamiento — tarjeta fija al principio de la rutina activa.
   ----------------------------------------------------------------------------
   UX: bloque discreto con check circular. Al tocarlo:
     - on  → guarda `warmup-<date> = "1"` en localStorage
     - off → elimina la key (toggle reversible)
   Por qué localStorage y no el Store: un flag de UI no merece migraciones
   v6→v7 ni ser parte del modelo Workout. Se borra solo si el usuario limpia
   el storage del browser.
   ============================================================================ */
function buildWarmupCard(date) {
  const KEY = 'warmup-' + date;
  const isOn = () => localStorage.getItem(KEY) === '1';

  const card = document.createElement('div');
  card.className = 'warmup-card' + (isOn() ? ' done' : '');
  card.innerHTML = `
    <div class="wu-icon" aria-hidden="true">🔥</div>
    <div class="wu-info">
      <div class="wu-title">Calentamiento</div>
      <div class="wu-sub">5-10 min · prepara tu cuerpo antes del primer ejercicio</div>
    </div>
    <button class="wu-check ${isOn() ? 'on' : ''}" type="button"
            aria-label="${isOn() ? 'Calentamiento completado · tap para deshacer' : 'Marcar calentamiento como completado'}">${isOn() ? '✓' : ''}</button>
  `;

  card.querySelector('.wu-check').addEventListener('click', function(){
    const wasOn = isOn();
    if (wasOn) {
      localStorage.removeItem(KEY);
      this.classList.remove('on');
      this.innerHTML = '';
      this.setAttribute('aria-label', 'Marcar calentamiento como completado');
      card.classList.remove('done');
    } else {
      localStorage.setItem(KEY, '1');
      this.classList.add('on');
      this.innerHTML = '✓';
      this.setAttribute('aria-label', 'Calentamiento completado · tap para deshacer');
      card.classList.add('done');
    }
  });

  return card;
}

/* ============================================================================
   Exercise card (formulario set-by-set, v6)
   ============================================================================ */
function buildExerciseCard(routine, item, nextOrder) {
  const ex = Store.exerciseById(item.exerciseId);
  if (!ex) {
    const card = document.createElement('div');
    card.className = 'ex-card';
    card.innerHTML = `<div class="ex-head"><div class="ex-name">⚠ ejercicio borrado</div></div>`;
    return card;
  }

  const date = App.state.currentDate;
  const last      = Store.lastSession(ex.id, date);
  const todayDone = Store.sessionsByDate(date).find(s => s.exerciseId === ex.id);
  const restSec   = item.rest || Store.getDefaultRest();

  // Sets iniciales del formulario:
  //   - si ya hay sesión hoy → clona sus sets para editar
  //   - si hay sesión anterior → clona los sets como template (reps en blanco)
  //   - si nada → 1 fila vacía con sugerencia de peso
  const suggestedW = Store.suggestWeight(ex.id, item.repRange, item.sets);
  const startingSets = todayDone
    ? todayDone.sets.map(s => ({ ...s }))
    : last
      ? last.sets.map(s => ({ weight: s.weight, reps: null }))
      : Array.from({ length: item.sets || 3 }, () => ({ weight: suggestedW || '', reps: null }));

  const lastTop = last ? topSet(last) : null;
  const order   = todayDone ? todayDone.order : nextOrder;

  const lastTxt = last
    ? `<small style="display:block;font-size:10px;color:var(--muted)">Última (${fmtDate(last.date)})</small>
       <b>${fmtTopSet(lastTop)}</b>${last.order ? ' · pos.' + roman(last.order) : ''}`
    : '<span style="color:var(--muted)">sin registros</span>';

  const todayTxt = todayDone
    ? `<small style="display:block;font-size:10px;color:var(--good);text-transform:uppercase;letter-spacing:.5px">Hoy</small>
       <b>${fmtTopSet(topSet(todayDone))}</b>`
    : '';

  const card = document.createElement('div');
  card.className = 'ex-card';
  card.innerHTML = `
    <div class="ex-head">
      <div class="ex-pos ${todayDone ? 'set' : ''}">${roman(order)}</div>
      <div>
        <div class="ex-name">${escapeH(ex.name)}</div>
        <div class="ex-meta">${escapeH(ex.group)} · ${item.sets} × ${item.repRange} · descanso ${fmtMMSS(restSec)}</div>
      </div>
      <div class="ex-last">${todayTxt || lastTxt}</div>
      <div class="ex-status ${todayDone ? 'done' : ''}"></div>
    </div>
    <div class="ex-body">
      <div class="sets-list-head has-plate" aria-hidden="true">
        <span></span><span>kg</span><span></span><span>reps</span><span>rpe</span><span></span>
      </div>
      <div class="sets-list" data-sets></div>
      <button class="btn-add-set" type="button">+ Añadir serie</button>
      <div class="field" style="margin-top:12px">
        <label>Notas</label>
        <input type="text" class="f-notes" placeholder="opcional" value="${escapeH(todayDone?.notes || '')}">
      </div>
      <div class="row-with-rest">
        <div class="actions">
          <button class="btn b-save">${todayDone ? 'Actualizar' : 'Guardar'}</button>
          ${todayDone ? '<button class="btn danger b-del">Borrar</button>' : ''}
        </div>
        <button class="rest-btn b-rest" type="button" title="Iniciar descanso">
          <span>DESCANSO</span>
          <span class="rb-time">${fmtMMSS(restSec)}</span>
        </button>
      </div>
    </div>
  `;

  // ---- Sets state (escala local del componente) ----
  const setsState = startingSets;
  const setsHost = card.querySelector('[data-sets]');
  const renderSets = () => {
    setsHost.innerHTML = setsState.map((s, i) => `
      <div class="set-row has-plate" data-idx="${i}">
        <div class="set-num">${i + 1}</div>
        <div class="set-field">
          <input class="s-w" type="number" inputmode="decimal" step="0.5"
                 aria-label="Peso de la serie ${i + 1} en kilogramos"
                 value="${s.weight ?? ''}"
                 placeholder="${lastTop ? lastTop.weight : (suggestedW ?? '')}">
        </div>
        <button class="plate-icon b-plate" title="Calculadora de discos" type="button"
                aria-label="Calculadora de discos para la serie ${i + 1}">⚖</button>
        <div class="set-field">
          <input class="s-r" type="number" inputmode="numeric"
                 aria-label="Repeticiones de la serie ${i + 1}"
                 value="${s.reps ?? ''}"
                 placeholder="${lastTop ? lastTop.reps : '—'}">
        </div>
        <div class="set-field set-rpe">
          <input class="s-rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5"
                 aria-label="RPE de la serie ${i + 1}"
                 value="${s.rpe ?? ''}">
        </div>
        <button class="set-del" title="Quitar serie" type="button" aria-label="Quitar serie ${i + 1}">×</button>
      </div>
    `).join('');

    // Eventos por fila
    setsHost.querySelectorAll('.set-row').forEach(row => {
      const idx = parseInt(row.dataset.idx, 10);
      row.querySelector('.s-w').addEventListener('input', e => {
        setsState[idx].weight = e.target.value === '' ? null : parseFloat(e.target.value);
      });
      row.querySelector('.s-r').addEventListener('input', e => {
        setsState[idx].reps = e.target.value === '' ? null : parseInt(e.target.value, 10);
      });
      row.querySelector('.s-rpe').addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) delete setsState[idx].rpe;
        else setsState[idx].rpe = v;
      });
      row.querySelector('.b-plate').addEventListener('click', e => {
        e.stopPropagation();
        const w = parseFloat(row.querySelector('.s-w').value);
        openPlateCalc(w || lastTop?.weight || 60, ex.name);
      });
      row.querySelector('.set-del').addEventListener('click', e => {
        e.stopPropagation();
        setsState.splice(idx, 1);
        if (setsState.length === 0) setsState.push({ weight: lastTop?.weight ?? '', reps: null });
        renderSets();
      });
    });
  };
  renderSets();

  // ---- Toggle expand ----
  card.querySelector('.ex-head').addEventListener('click', () => {
    $$('#exerciseList .ex-card').forEach(c => { if (c !== card) c.classList.remove('open'); });
    card.classList.toggle('open');
  });

  // ---- Añadir set (hereda peso del anterior, reps vacío) ----
  card.querySelector('.btn-add-set').addEventListener('click', () => {
    const prev = setsState[setsState.length - 1];
    setsState.push({
      weight: prev?.weight ?? (lastTop?.weight ?? ''),
      reps: null,
    });
    renderSets();
  });

  // ---- Descanso (click corto inicia; long-press / right-click edita) ----
  card.querySelector('.b-rest').addEventListener('click', e => {
    e.stopPropagation();
    RestTimer.start(restSec, ex.name);
  });
  card.querySelector('.b-rest').addEventListener('contextmenu', e => {
    e.preventDefault();
    openEditRest(routine.id, item, ex);
  });

  // ---- Guardar ----
  card.querySelector('.b-save').addEventListener('click', () => {
    // Validamos y limpiamos los sets: descartar filas totalmente vacías
    const validSets = setsState
      .map(s => ({
        weight: typeof s.weight === 'number' ? s.weight : parseFloat(s.weight),
        reps:   typeof s.reps   === 'number' ? s.reps   : parseInt(s.reps, 10),
        ...(s.rpe != null ? { rpe: s.rpe } : {}),
        ...(s.warmup ? { warmup: true } : {}),
      }))
      .filter(s => !isNaN(s.weight) && !isNaN(s.reps) && s.weight > 0 && s.reps > 0);

    if (validSets.length === 0) {
      toast('Necesitas al menos una serie con peso y reps', 'bad');
      return;
    }

    Store.removeSessionFor(date, ex.id);
    const sess = Store.addSession({
      date,
      exerciseId: ex.id,
      sets: validSets,
      order,
      notes: card.querySelector('.f-notes').value.trim(),
    });
    const isPR = Store.isPR(sess);
    toast(isPR ? `¡Nuevo PR en ${ex.name}!` : 'Sesión guardada', isPR ? 'pr' : '');
    if (isPR) {
      vibrate([30, 50, 30, 50, 80]);
      const rect = card.querySelector('.b-save').getBoundingClientRect();
      fireConfetti(rect.left + rect.width / 2, rect.top);
    } else {
      vibrate(15);
    }
    RestTimer.start(restSec, ex.name);
    App.refreshAll();
  });

  const del = card.querySelector('.b-del');
  if (del) del.addEventListener('click', () => {
    Store.removeSessionFor(date, ex.id);
    toast('Sesión borrada');
    App.refreshAll();
  });

  return card;
}

/* ============================================================================
   Modales auxiliares (rest editor + plate calc)
   ============================================================================ */
function openEditRest(routineId, item, ex) {
  const current = item.rest || Store.getDefaultRest();
  openModal(`
    <div class="modal-head"><h3>Descanso de ${escapeH(ex.name)}</h3><button class="x" id="rstClose">×</button></div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:14px">
        <label>Tiempo de descanso (segundos)</label>
        <div class="stepper">
          <button id="rstM">−15</button>
          <input type="number" id="rstVal" value="${current}" inputmode="numeric" min="10" step="15">
          <button id="rstP">+15</button>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${[60,90,120,150,180,240].map(v => `<button class="day-chip" data-v="${v}">${fmtMMSS(v)}</button>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn secondary" id="rstCancel">Cancelar</button>
      <button class="btn" id="bSaveRest">Guardar</button>
    </div>
  `);

  $('#rstClose').addEventListener('click', closeModal);
  $('#rstCancel').addEventListener('click', closeModal);
  $('#rstM').addEventListener('click', () => {
    const v = parseInt($('#rstVal').value, 10); $('#rstVal').value = Math.max(10, v - 15);
  });
  $('#rstP').addEventListener('click', () => {
    const v = parseInt($('#rstVal').value, 10); $('#rstVal').value = v + 15;
  });
  $$('#modalBg .day-chip').forEach(c => {
    c.addEventListener('click', () => { $('#rstVal').value = c.dataset.v; });
  });
  $('#bSaveRest').addEventListener('click', () => {
    const v = parseInt($('#rstVal').value, 10);
    const r = Store.routineById(routineId);
    const idx = r.items.indexOf(item);
    Store.updateItemInRoutine(routineId, idx, { rest: v });
    toast('Descanso actualizado');
    closeModal();
    renderRoutine();
  });
}

export function openPlateCalc(weight, exName) {
  const sideHTML = (side) => `
    <div class="plate-side">
      ${side.map(p => `<div class="plate ${PLATE_CLASS[p]}">${p}</div>`).join('')}
    </div>
  `;
  const calc = plateCompute(weight, 20);

  openModal(`
    <div class="modal-head"><h3>Calculadora de discos</h3><button class="x" id="pcClose">×</button></div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:10px">
        <label>Peso total (kg) — barra de 20 kg</label>
        <input type="number" id="pcW" value="${weight || 60}" inputmode="decimal" step="2.5">
      </div>
      <div id="pcView">
        ${calc.over ? '<div class="empty">El peso es menor que la barra (20 kg)</div>' : `
          <div class="plate-bar">
            ${sideHTML([...calc.perSide].reverse())}
            <div class="bar"></div>
            ${sideHTML(calc.perSide)}
          </div>
          <div style="text-align:center;font-size:12px;color:var(--muted)">
            ${calc.perSide.length ? `Por lado: ${calc.perSide.join(' + ')} kg` : 'Solo la barra'}
            ${calc.leftover > 0 ? ` · sobra ${calc.leftover} kg` : ''}
          </div>
        `}
      </div>
      <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:14px">${escapeH(exName || '')}</div>
    </div>
    <div class="modal-foot">
      <button class="btn secondary" id="pcCancel">Cerrar</button>
    </div>
  `);

  $('#pcClose').addEventListener('click', closeModal);
  $('#pcCancel').addEventListener('click', closeModal);
  $('#pcW').addEventListener('input', (e) => {
    const w = parseFloat(e.target.value);
    const c = plateCompute(w, 20);
    $('#pcView').innerHTML = c.over ? '<div class="empty">El peso es menor que la barra (20 kg)</div>' : `
      <div class="plate-bar">${sideHTML([...c.perSide].reverse())}<div class="bar"></div>${sideHTML(c.perSide)}</div>
      <div style="text-align:center;font-size:12px;color:var(--muted)">
        ${c.perSide.length ? `Por lado: ${c.perSide.join(' + ')} kg` : 'Solo la barra'}
        ${c.leftover > 0 ? ` · sobra ${c.leftover} kg` : ''}
      </div>
    `;
  });
}

/* ============================================================================
   Workout actions (sin cambios respecto Fase E)
   ============================================================================ */
function renderWorkoutActions(routineId, date) {
  let host = document.getElementById('workoutActions');
  if (!host) {
    host = document.createElement('div');
    host.id = 'workoutActions';
    document.getElementById('muscleMap').before(host);
  }

  const active = Store.activeWorkout();

  if (!active) {
    host.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'workout-actions';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '▶ Iniciar entrenamiento';
    btn.addEventListener('click', () => promptStartWorkout(routineId));
    bar.appendChild(btn);
    host.appendChild(bar);
    return;
  }

  if (active.routineId !== routineId || active.date !== date) {
    host.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'workout-actions';
    const r = Store.routineById(active.routineId);
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<span class="dot"></span><span>Entrenando <b>${r ? escapeH(r.name) : '—'}</b> (${active.date})</span>`;
    bar.appendChild(info);
    const goBtn = document.createElement('button');
    goBtn.className = 'btn small';
    goBtn.textContent = 'Abrir';
    goBtn.addEventListener('click', () => App.showActiveWorkout());
    bar.appendChild(goBtn);
    host.appendChild(bar);
    return;
  }

  host.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'workout-actions';
  const info = document.createElement('div');
  info.className = 'info';
  const startedMs = new Date(active.startAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  info.innerHTML = `<span class="dot"></span><span>Entrenando · <b>${fmtDuration(elapsedSec)}</b></span>`;
  bar.appendChild(info);

  const open = document.createElement('button');
  open.className = 'btn small';
  open.textContent = 'Abrir';
  open.addEventListener('click', () => App.showActiveWorkout());
  bar.appendChild(open);

  const finish = document.createElement('button');
  finish.className = 'btn small secondary';
  finish.textContent = 'Terminar';
  finish.addEventListener('click', () => confirmFinishWorkout(active.id));
  bar.appendChild(finish);

  host.appendChild(bar);
}
