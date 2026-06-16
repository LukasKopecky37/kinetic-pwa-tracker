/**
 * Vista Historial — fila por ejercicio con chips horizontales de sesiones (v6).
 *
 * Cada chip muestra el top set. Tendencia/PR se calculan sobre `topWeight`.
 * Tap en un chip abre el editor de la sesión con su lista de sets editable.
 */

import { $, $$, h, mount } from '../utils/dom.js';
import { fmtDate } from '../utils/date.js';
import { fmtRepsCompact, escapeH } from '../utils/format.js';
import { roman } from '../utils/roman.js';
import { Store } from '../store/store.js';
import { topWeight, topSet, bestSetVolume, isPR as isSessionPR } from '../analytics/prs.js';
import { sessionVolume } from '../analytics/volume.js';
import { estimate1RM, bestEstimated1RM } from '../analytics/one-rm.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { HistoryChip } from '../components/HistoryChip.js';
import { App } from '../app.js';

export function renderHistory() {
  const groups = [...new Set(Store.exercises().map(e => e.group))];
  const sel = $('#filterGroup');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los grupos</option>'
                + groups.map(g => `<option value="${escapeH(g)}">${escapeH(g)}</option>`).join('');
  sel.value = cur;
  sel.onchange = () => renderHistory();

  // Tabs Bitácora / Por ejercicio — re-bind idempotente (`.onclick`)
  $$('.hist-tabs .ht-tab').forEach(t => {
    t.onclick = () => switchHistPane(t.dataset.pane);
  });

  renderBitacora(sel.value);
  renderChipsByExercise(sel.value);
}

/** Alterna entre los dos paneles del Historial: bitácora ↔ por ejercicio. */
function switchHistPane(name) {
  $$('.hist-tabs .ht-tab').forEach(t => {
    const on = t.dataset.pane === name;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#histPaneBit') .classList.toggle('hidden', name !== 'bit');
  $('#histPaneChip').classList.toggle('hidden', name !== 'chip');
}

/* ============================================================================
   Bitácora — lista cronológica (estilo Excel): un bloque por DÍA con todos
   los ejercicios de ese día, el objetivo de la rutina y las series reales.
   ============================================================================ */
const BITACORA_LIMIT = 60;     // primeros días que se pintan; el resto bajo "Mostrar más"

function renderBitacora(filterGroup) {
  const host = $('#bitacora');
  if (!host) return;

  const allowedIds = filterGroup
    ? new Set(Store.exercises().filter(e => e.group === filterGroup).map(e => e.id))
    : null;

  // Sesiones filtradas, ordenadas por fecha DESC (newest first)
  const sessions = Store.data.sessions
    .filter(s => !allowedIds || allowedIds.has(s.exerciseId))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!sessions.length) {
    mount(host, h('div', { class: 'empty', style: { padding: '20px' } },
      filterGroup ? 'Sin sesiones para este grupo.' : 'Aún no hay sesiones.'));
    return;
  }

  // Agrupar por fecha (Map preserva orden de inserción → ya queda desc)
  const byDate = new Map();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const dates = [...byDate.keys()];
  const head = dates.slice(0, BITACORA_LIMIT);
  const tail = dates.slice(BITACORA_LIMIT);

  const blocks = head.map(d => buildBitacoraDay(d, byDate.get(d)));

  if (tail.length) {
    blocks.push(h('button', {
      class: 'btn small secondary bit-more', type: 'button',
      onClick: (e) => {
        const btn = e.currentTarget;
        btn.remove();
        const rest = tail.map(d => buildBitacoraDay(d, byDate.get(d)));
        host.append(...rest);
      },
    }, `Mostrar más (${tail.length} días)`));
  }

  mount(host, blocks);
}

function buildBitacoraDay(date, sessions) {
  // Orden de ejecución en ese día (I, II, III…); fallback alfabético
  const sorted = sessions.slice().sort((a, b) => (a.order || 99) - (b.order || 99));
  const w = sorted[0].workoutId ? Store.workoutById(sorted[0].workoutId) : null;
  const routine = w?.routineId ? Store.routineById(w.routineId) : null;

  return h('div', { class: 'bit-card' },
    h('div', { class: 'bit-head' },
      h('div', { class: 'bit-date' }, fmtDateLong(date)),
      routine ? h('div', { class: 'bit-routine' }, routine.name) : null,
    ),
    h('div', { class: 'bit-rows' },
      ...sorted.map(s => buildBitacoraRow(s, routine)),
    ),
  );
}

function buildBitacoraRow(sess, routine) {
  const ex = Store.exerciseById(sess.exerciseId);
  const name = ex ? ex.name : '⚠ borrado';
  const item = routine?.items.find(it => it.exerciseId === sess.exerciseId);
  const target = item ? `${item.sets}×${item.repRange}` : '';
  return h('div', {
    class: 'bit-row',
    onClick: () => ex && openEditSession(ex, sess),
  },
    h('div', { class: 'bit-name' }, name),
    h('div', { class: 'bit-target' }, target),
    h('div', { class: 'bit-vals' }, fmtSetsBitacora(sess.sets)),
  );
}

/** "62 kg · 12 / 12 / 10 / 8" si todas las series comparten peso; si varían,
 *  "62×12 · 60×10 · 50×8". Sin warm-ups.
 *
 *  Nota tipográfica: usamos NBSP ( ) entre número y unidad para que el
 *  wrap CSS nunca separe "210" de "kg" en líneas distintas. Los separadores
 *  " · " y " / " quedan con espacios normales = puntos de ruptura preferidos. */
function fmtSetsBitacora(sets) {
  const valid = (sets || []).filter(s => !s.warmup && s.reps);
  if (!valid.length) return '—';
  const w0 = valid[0].weight;
  const same = valid.every(s => s.weight === w0);
  return same
    ? `${w0} kg · ${valid.map(s => s.reps).join(' / ')}`
    : valid.map(s => `${s.weight}×${s.reps}`).join(' · ');
}

function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  const s = d.toLocaleDateString('es-ES',
    { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================================================================
   Chips por ejercicio (la vista anterior — sigue útil para analítica rápida)
   ============================================================================ */
function renderChipsByExercise(filterGroup) {
  const list = $('#historyList');
  let exs = Store.exercises();
  if (filterGroup) exs = exs.filter(e => e.group === filterGroup);
  exs = exs.filter(e => Store.sessionsByExercise(e.id, true).length > 0);

  if (exs.length === 0) {
    mount(list, h('div', { class: 'empty' }, 'Sin chips para este filtro.'));
    return;
  }

  const rows = exs.map(ex => buildHistRow(ex));
  mount(list, rows);
  // NOTA: ya no hacemos scrollLeft = scrollWidth aquí. Antes hacía falta
  // porque las sesiones se mostraban ASC (más antigua a la izquierda) y
  // queríamos auto-scrollear al final para mostrar la más reciente. Ahora
  // `buildHistRow` reversa el array para que el chip de hoy esté en la
  // posición 0 (extremo izquierdo), que es el default natural del scroller.
}

function buildHistRow(ex) {
  const sessions = Store.sessionsByExercise(ex.id, true);

  // Tendencia: media de los topWeight de últimas 3 sesiones vs anteriores 3
  const last3 = sessions.slice(-3).map(topWeight);
  const prev3 = sessions.slice(-6, -3).map(topWeight);
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const diff = avg(last3) - avg(prev3);

  let trendClass = '', trendArrow = '·', trendText = '';
  if (prev3.length) {
    if (diff > 0.1)       { trendClass = 'up';   trendArrow = '↑'; trendText = `+${diff.toFixed(1)}kg`; }
    else if (diff < -0.1) { trendClass = 'down'; trendArrow = '↓'; trendText = `${diff.toFixed(1)}kg`; }
    else                  { trendArrow = '→'; trendText = 'estable'; }
  } else {
    trendArrow = '·'; trendText = `${sessions.length} ses.`;
  }

  // PR ÚNICO POR EJERCICIO (refactor v48+):
  // Bug previo (IMG_5514): el chip mostraba "PR" en TODAS las sesiones que
  // empataban el peso máximo histórico. Ahora el criterio es:
  //   - Métrica: bestSetVolume(s) = max(peso × reps) de los work-sets.
  //   - El badge sale en UNA sola sesión: la del récord histórico real.
  //   - En empate exacto gana la EARLIEST (la que estableció el récord);
  //     el array `sessions` viene ASC, así que el primer ocurrente del
  //     máximo es la pionera.
  // Si todas las sesiones tienen volumen 0 (ej. solo warm-ups), no hay PR.
  let prSessionId = null;
  let prVol = 0;
  for (const s of sessions) {
    const v = bestSetVolume(s);
    if (v > prVol) {           // ESTRICTAMENTE mayor → tie-break a la primera
      prVol = v;
      prSessionId = s.id;
    }
  }

  // IMPORTANTE: el array `sessions` viene ASC (más antigua → más reciente).
  // Calculamos el trend de cada chip COMPARANDO con la sesión anterior en
  // el tiempo (sessions[idx-1] = la inmediatamente previa cronológicamente),
  // que es la semántica correcta de "subió vs. mi entreno anterior".
  // Después de construir los chips, los REVERSAMOS para el DOM: el chip de
  // hoy queda primero (izquierda) — el usuario no tiene que scrollear a la
  // derecha para ver lo último que hizo.
  const chips = sessions.map((s, idx) => {
    const prevTop = idx > 0 ? topWeight(sessions[idx - 1]) : null;
    const thisTop = topWeight(s);
    let trend = '';
    if (prevTop != null) {
      if (thisTop > prevTop)      trend = 'up';
      else if (thisTop < prevTop) trend = 'down';
    }
    const isPRChip = prSessionId != null && s.id === prSessionId;
    return HistoryChip({
      session: s, trend, isPR: isPRChip,
      onTap: () => openEditSession(ex, s),
    });
  });
  chips.reverse();  // newest first (DOM order: izquierda → derecha)

  return h('div', { class: 'hist-row' },
    h('div', { class: 'hr-head' },
      h('div', null,
        h('div', { class: 'hr-name' }, ex.name),
        h('div', { class: 'hr-meta' }, `${ex.group} · ${sessions.length} sesiones`),
      ),
      h('div', { class: `hr-trend ${trendClass}` }, `${trendArrow} ${trendText}`),
    ),
    h('div', { class: 'chips-scroll' },
      h('div', { class: 'chips' }, ...chips),
    ),
  );
}

/* ============================================================================
   Modal de edición de sesión histórica (v6: editor de sets)
   ============================================================================ */
export function openEditSession(ex, sess) {
  const isPR = isSessionPR(sess, Store.sessionsByExercise(ex.id, true));

  // Estado local de sets (deep copy)
  const setsState = sess.sets.map(s => ({ ...s }));

  openModal('');
  const renderSetsList = () => setsState.map((s, i) => `
    <div class="set-row" data-idx="${i}">
      <div class="set-num">${i + 1}</div>
      <div class="set-field">
        <input class="es-w" type="number" step="0.5" inputmode="decimal"
               aria-label="Peso de la serie ${i + 1} en kilogramos"
               value="${s.weight ?? ''}">
      </div>
      <div class="set-field">
        <input class="es-r" type="number" inputmode="numeric"
               aria-label="Repeticiones de la serie ${i + 1}"
               value="${s.reps ?? ''}">
      </div>
      <div class="set-field set-rpe">
        <input class="es-rpe" type="number" min="1" max="10" step="0.5" inputmode="decimal"
               aria-label="RPE de la serie ${i + 1}"
               value="${s.rpe ?? ''}">
      </div>
      <button class="set-del" type="button" aria-label="Borrar serie ${i + 1}">×</button>
    </div>
  `).join('');

  $('#modal').innerHTML = `
    <div class="modal-head">
      <div>
        <h3>${escapeH(ex.name)} ${isPR ? '<span class="pr-flag">PR</span>' : ''}</h3>
        <div style="font-size:12px;color:var(--muted)">${escapeH(ex.group)} · ${sess.date}</div>
      </div>
      <button class="x" id="esClose">×</button>
    </div>
    <div class="modal-body">
      <h4>Series</h4>
      <div class="sets-list-head" aria-hidden="true">
        <span></span><span>kg</span><span>reps</span><span>rpe</span><span></span>
      </div>
      <div class="sets-list" id="esSets">${renderSetsList()}</div>
      <button class="btn-add-set" type="button" id="esAdd">+ Añadir serie</button>

      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Orden</label>
          <div class="stepper compact">
            <button type="button" id="esOM">−</button>
            <input type="text" id="esO" readonly value="${roman(sess.order || 0)}" data-num="${sess.order || 0}">
            <button type="button" id="esOP">+</button>
          </div>
        </div>
        <div class="field"><label>Fecha</label><input type="date" id="esDate" value="${sess.date}"></div>
      </div>
      <div class="field" style="margin-top:10px">
        <label>Notas</label>
        <input type="text" id="esNotes" value="${escapeH(sess.notes || '')}">
      </div>
      <div id="esSummary" style="margin-top:14px;font-size:12px;color:var(--muted)"></div>
    </div>
    <div class="modal-foot">
      <button class="btn danger small" id="esDel">Borrar</button>
      <button class="btn" id="esSave">Guardar</button>
    </div>
  `;
  $('#modalBg').classList.add('show');

  const wire = () => {
    $$('#esSets .set-row').forEach(row => {
      const idx = parseInt(row.dataset.idx, 10);
      row.querySelector('.es-w').addEventListener('input', e => {
        setsState[idx].weight = e.target.value === '' ? null : parseFloat(e.target.value);
        renderSummary();
      });
      row.querySelector('.es-r').addEventListener('input', e => {
        setsState[idx].reps = e.target.value === '' ? null : parseInt(e.target.value, 10);
        renderSummary();
      });
      row.querySelector('.es-rpe').addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) delete setsState[idx].rpe;
        else setsState[idx].rpe = v;
      });
      row.querySelector('.set-del').addEventListener('click', () => {
        setsState.splice(idx, 1);
        if (setsState.length === 0) setsState.push({ weight: null, reps: null });
        $('#esSets').innerHTML = renderSetsList();
        wire();
        renderSummary();
      });
    });
  };

  const renderSummary = () => {
    const valid = setsState.filter(s => s.weight > 0 && s.reps > 0);
    const fake = { sets: valid };
    const vol = sessionVolume(fake);
    const e1rm = bestEstimated1RM([fake]);
    $('#esSummary').textContent = `Vol: ${vol} kg·rep · 1RM est.: ${e1rm} kg · ${valid.length} series`;
  };

  wire();
  renderSummary();

  $('#esClose').addEventListener('click', closeModal);
  $('#esOM').addEventListener('click', () => {
    const n = Math.max(0, parseInt($('#esO').dataset.num, 10) - 1);
    $('#esO').dataset.num = n; $('#esO').value = roman(n || 0);
  });
  $('#esOP').addEventListener('click', () => {
    const n = Math.min(20, parseInt($('#esO').dataset.num, 10) + 1);
    $('#esO').dataset.num = n; $('#esO').value = roman(n);
  });
  $('#esAdd').addEventListener('click', () => {
    const prev = setsState[setsState.length - 1];
    setsState.push({ weight: prev?.weight ?? null, reps: null });
    $('#esSets').innerHTML = renderSetsList();
    wire();
    renderSummary();
  });
  $('#esSave').addEventListener('click', () => {
    const cleanSets = setsState
      .map(s => ({
        weight: typeof s.weight === 'number' ? s.weight : parseFloat(s.weight),
        reps:   typeof s.reps   === 'number' ? s.reps   : parseInt(s.reps, 10),
        ...(s.rpe != null ? { rpe: s.rpe } : {}),
        ...(s.warmup ? { warmup: true } : {}),
      }))
      .filter(s => !isNaN(s.weight) && !isNaN(s.reps) && s.weight > 0 && s.reps > 0);

    if (cleanSets.length === 0) {
      toast('Necesitas al menos una serie válida', 'bad'); return;
    }

    const order = parseInt($('#esO').dataset.num, 10) || null;
    const date  = $('#esDate').value;
    const notes = $('#esNotes').value.trim();
    Store.updateSession(sess.id, { sets: cleanSets, order, date, notes });
    closeModal(); toast('Sesión actualizada'); App.refreshAll();
  });
  $('#esDel').addEventListener('click', () => {
    if (!confirm('¿Borrar esta sesión?')) return;
    Store.removeSessionById(sess.id);
    closeModal(); toast('Sesión borrada'); App.refreshAll();
  });
}
