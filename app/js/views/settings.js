/**
 * Vista Ajustes — punto de entrada de toda la configuración:
 *   - Rutina/plan activa (CRUD + cambiar activa)
 *   - Rutinas (lista + entrar al editor)
 *   - Biblioteca de ejercicios (lista + editor)
 *   - Descanso por defecto
 *   - Datos (export/import/reset)
 *
 * Plus: editor de rutina, picker de ejercicios y editor de ejercicio.
 *
 * Las secciones se renderizan en el mismo #settingsBody y se navegan entre
 * sí llamando a `openSettings(section)`.
 */

import { $, $$ } from '../utils/dom.js';
import { fmtDate } from '../utils/date.js';
import { fmtMMSS, escapeH } from '../utils/format.js';
import { GROUPS, DAY_SHORT } from '../constants.js';
import { Store } from '../store/store.js';
import {
  EXERCISE_CATALOG, catalogToExercise,
  CATALOG_MUSCLES, CATALOG_EQUIPMENT,
} from '../store/exercise-catalog.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { exportJSON, importJSON } from '../services/backup.js';
import { seedHistoricalData } from '../store/import-history.js';
import { App } from '../app.js';

/* ============================================================================
   MENÚ DE AJUSTES
   ============================================================================ */
export function openSettings(section) {
  section = section || 'menu';
  const meso = Store.currentMeso();
  let body = '';

  if (section === 'menu') {
    body = `
      <div class="menu-row" data-go="mesos">
        <div><div class="mr-title">Rutina (plan)</div><div class="mr-sub">${escapeH(meso ? meso.name : '—')}</div></div>
        <div class="mr-arrow">›</div>
      </div>
      <div class="menu-row" data-go="routines">
        <div><div class="mr-title">Días</div><div class="mr-sub">crear y editar los días de tu rutina</div></div>
        <div class="mr-arrow">›</div>
      </div>
      <div class="menu-row" data-go="library">
        <div><div class="mr-title">Biblioteca de ejercicios</div><div class="mr-sub">${Store.exercises().length} ejercicios</div></div>
        <div class="mr-arrow">›</div>
      </div>
      <div class="menu-row" data-go="rest">
        <div><div class="mr-title">Descanso por defecto</div><div class="mr-sub">${fmtMMSS(Store.getDefaultRest())}</div></div>
        <div class="mr-arrow">›</div>
      </div>
      <div class="menu-row" data-go="data">
        <div><div class="mr-title">Datos</div><div class="mr-sub">exportar, importar, restablecer</div></div>
        <div class="mr-arrow">›</div>
      </div>
    `;
  }

  openModal(`
    <div class="modal-head"><h3>Ajustes</h3><button class="x" id="stClose">×</button></div>
    <div class="modal-body" id="settingsBody">${body}</div>
  `);
  $('#stClose').addEventListener('click', closeModal);

  if (section === 'menu') {
    $$('#settingsBody .menu-row').forEach(r => {
      r.addEventListener('click', () => openSettings(r.dataset.go));
    });
  }
  if (section === 'mesos')    renderMesoSection();
  if (section === 'routines') renderRoutinesSection();
  if (section === 'library')  renderLibrarySection();
  if (section === 'rest')     renderRestSection();
  if (section === 'data')     renderDataSection();
}

/* ============================================================================
   MESOCICLOS
   ============================================================================ */
function renderMesoSection() {
  const cur = Store.currentMeso();
  const multi = Store.mesos().length > 1;

  // La lista "Todas tus rutinas" SOLO se muestra si hay varias (si no, solo
  // duplicaría la rutina que ya estás editando arriba). Igual el borrar.
  const list = multi ? Store.mesos().map(m => `
    <div class="menu-row" style="${m.id === cur.id ? 'border-color:var(--accent)' : ''}" data-id="${m.id}">
      <div>
        <div class="mr-title">${escapeH(m.name)} ${m.id === cur.id ? '<span class="badge">activa</span>' : ''}</div>
        <div class="mr-sub">${escapeH(m.subtitle || '')}${m.startDate ? ' · desde ' + fmtDate(m.startDate) : ''}</div>
      </div>
      <div class="mr-arrow">›</div>
    </div>
  `).join('') : '';

  $('#settingsBody').innerHTML = `
    <h4>Rutina activa</h4>
    <div class="field" style="margin-bottom:8px"><label>Nombre</label><input type="text" id="mName" value="${escapeH(cur.name)}" placeholder="ej. Hipertrofia 4 días"></div>
    <div class="field" style="margin-bottom:14px"><label>Descripción</label><input type="text" id="mSub" value="${escapeH(cur.subtitle || '')}" placeholder="ej. Torso/Pierna · 12 semanas"></div>
    <div class="actions"><button class="btn small secondary" id="bSaveMeso">Guardar</button></div>
    ${multi ? `<h4>Cambiar de rutina</h4>${list}` : ''}
    <h4>Acciones</h4>
    <div class="actions">
      <button class="btn small secondary" id="bNewMeso">+ Nuevo en blanco</button>
      <button class="btn small secondary" id="bCloneMeso">+ Duplicar actual</button>
    </div>
    ${multi ? '<div class="actions" style="margin-top:8px"><button class="btn small danger" id="bDelMeso">Eliminar actual</button></div>' : ''}
    <div class="actions" style="margin-top:16px"><button class="btn secondary" id="mBack">‹ Volver</button></div>
  `;

  $('#mBack').addEventListener('click', () => openSettings('menu'));

  $('#bSaveMeso').addEventListener('click', () => {
    Store.renameMeso(cur.id, $('#mName').value.trim() || cur.name, $('#mSub').value.trim());
    App.refreshAll(); toast('Rutina actualizada'); openSettings('mesos');
  });
  $('#bNewMeso').addEventListener('click', () => {
    const name = prompt('Nombre de la nueva rutina:', 'Rutina ' + (Store.mesos().length + 1));
    if (!name) return;
    Store.addMeso({ name });
    App.refreshAll(); toast('Rutina creada'); openSettings('mesos');
  });
  $('#bCloneMeso').addEventListener('click', () => {
    const name = prompt('Nombre de la nueva rutina (copia):', cur.name + ' (copia)');
    if (!name) return;
    Store.addMeso({ name, cloneFrom: cur.id });
    App.refreshAll(); toast('Rutina duplicada'); openSettings('mesos');
  });
  const dm = $('#bDelMeso');
  if (dm) dm.addEventListener('click', () => {
    if (!confirm('¿Eliminar esta rutina y todos sus días? Las sesiones registradas se conservan')) return;
    Store.deleteMeso(cur.id);
    App.refreshAll(); toast('Rutina eliminada'); openSettings('mesos');
  });

  $$('#settingsBody [data-id]').forEach(el => {
    el.addEventListener('click', () => {
      Store.setCurrentMeso(el.dataset.id);
      App.refreshAll(); toast('Rutina cambiada'); openSettings('mesos');
    });
  });
}

/* ============================================================================
   LISTA DE RUTINAS + EDITOR
   ============================================================================ */
function renderRoutinesSection() {
  const list = Store.routines().map(r => `
    <div class="menu-row" data-id="${r.id}">
      <div>
        <div class="mr-title">${escapeH(r.name)}</div>
        <div class="mr-sub">${(r.days || []).map(d => DAY_SHORT[d]).join('·') || 'sin día'} · ${r.items.length} ejercicios</div>
      </div>
      <div class="mr-arrow">›</div>
    </div>
  `).join('');

  $('#settingsBody').innerHTML = `
    <h4>Días de tu rutina</h4>
    ${list || '<div class="empty">Sin días todavía.</div>'}
    <div class="actions" style="margin-top:14px">
      <button class="btn small" id="bNewRoutine">+ Nuevo día</button>
      <button class="btn small secondary" id="rsBack">‹ Volver</button>
    </div>
  `;

  $('#rsBack').addEventListener('click', () => openSettings('menu'));
  $('#bNewRoutine').addEventListener('click', () => {
    import('./home.js').then(m => m.promptNewRoutine());
  });
  $$('#settingsBody [data-id]').forEach(el => {
    el.addEventListener('click', () => openRoutineEditor(el.dataset.id));
  });
}

/* Editor de un Día en 2 pasos. `_reMetaOpen` colapsa los metadatos
 * (Nombre/Grupos/Días) una vez fijados, para que la pantalla se centre solo
 * en la gestión de ejercicios. Persiste entre re-renders del mismo Día
 * (añadir/mover/borrar ítems re-llama a openRoutineEditor con el mismo id). */
let _reRoutineId = null;
let _reMetaOpen  = false;

/** Editor de un Día: paso 1 metadatos (colapsable) · paso 2 ejercicios. */
export function openRoutineEditor(routineId) {
  const r = Store.routineById(routineId);
  if (!r) { openSettings('routines'); return; }

  // Al abrir un Día distinto: empezar colapsado (foco en ejercicios; el
  // nombre ya se puso al crearlo). El "✎ Editar datos" lo despliega.
  if (_reRoutineId !== routineId) { _reRoutineId = routineId; _reMetaOpen = false; }

  const dayChips = [1,2,3,4,5,6,0]
    .map(d => `<button class="day-chip" data-d="${d}">${DAY_SHORT[d]}</button>`).join('');
  const dayList = (r.days || []).map(d => DAY_SHORT[d]).join(' · ') || 'sin días';

  // Render alternando tarjetas y conectores de bi-serie.
  //
  // UX: el botón de "unir como bi-serie" vive ENTRE dos tarjetas
  // consecutivas, no dentro de una tarjeta. Visualmente eso comunica
  // mucho mejor el concepto de "emparejar A con B" — el usuario ve un
  // eslabón flotante que une las dos tarjetas, y al pulsarlo las
  // tarjetas se fusionan en un bloque compacto.
  //
  // Cuando un par YA está enlazado, el conector se vuelve naranja sólido
  // con texto "🔗 Bi-serie · pulsa para romper" y las dos tarjetas
  // adyacentes pierden esquinas redondeadas para fundirse en un bloque.

  const renderCard = (it, idx) => {
    const ex = Store.exerciseById(it.exerciseId);
    const itDays = it.days || [];
    const next = r.items[idx + 1];
    const prev = r.items[idx - 1];
    const linkedNext = !!(it.supersetGroupId && next && next.supersetGroupId === it.supersetGroupId);
    const linkedPrev = !!(it.supersetGroupId && prev && prev.supersetGroupId === it.supersetGroupId);
    const ssClass = linkedNext ? ' is-ss-first' : (linkedPrev ? ' is-ss-second' : '');
    const ssBadge = linkedPrev
      ? '<span class="ed-ss-badge">↳ bi-serie</span>'
      : '';

    const dayOptions = (r.days || []).length > 1
      ? `<div class="ed-days">
           <span style="font-size:10px;color:var(--muted)">Día:</span>
           ${(r.days || []).map(d => `<button class="day-chip mini ${itDays.includes(d) ? 'on' : ''}" data-day="${d}" data-itidx="${idx}">${DAY_SHORT[d]}</button>`).join('')}
           ${itDays.length === 0 ? '<span style="font-size:10px;color:var(--accent-2)">todos</span>' : ''}
         </div>`
      : '';
    return `
      <div class="ed-item${ssClass}" data-idx="${idx}">
        <div class="ed-handle">
          <button class="b-up" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="b-dn" ${idx === r.items.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div class="ed-body">
          <div class="ed-name">
            ${ex ? escapeH(ex.name) : '⚠ borrado'}
            ${ex ? `<span class="ed-group">${escapeH(ex.group)}</span>` : ''}
            ${ssBadge}
          </div>
          <div class="ed-fields">
            <label class="ed-f"><span class="ed-lab">Series</span>
              <input class="i-sets" type="number" inputmode="numeric" min="1" max="10" value="${it.sets}"></label>
            <label class="ed-f"><span class="ed-lab">Reps</span>
              <input class="i-rep" type="text" value="${escapeH(it.repRange || '')}" placeholder="8-12"></label>
            <label class="ed-f"><span class="ed-lab">Desc.</span>
              <input class="i-rest" type="number" inputmode="numeric" min="10" step="15" value="${it.rest || 120}"></label>
          </div>
          ${dayOptions}
        </div>
        <button class="ed-del" title="Quitar">×</button>
      </div>
    `;
  };

  const renderConnector = (idx) => {
    const it = r.items[idx];
    const next = r.items[idx + 1];
    const linked = !!(it.supersetGroupId && next && next.supersetGroupId === it.supersetGroupId);
    const label = linked
      ? '🔗 Bi-serie activa · pulsa para romper'
      : '🔗 Unir como bi-serie';
    return `
      <div class="ed-ss-connector${linked ? ' linked' : ''}" data-itidx="${idx}">
        <div class="ssc-line"></div>
        <button class="ssc-btn" type="button" data-itidx="${idx}">${label}</button>
        <div class="ssc-line"></div>
      </div>
    `;
  };

  const itemsAndConnectors = [];
  r.items.forEach((it, idx) => {
    itemsAndConnectors.push(renderCard(it, idx));
    if (idx < r.items.length - 1) itemsAndConnectors.push(renderConnector(idx));
  });
  const items = itemsAndConnectors.join('');

  const metaBlock = _reMetaOpen ? `
      <div class="field" style="margin-bottom:10px"><label>Nombre del día</label>
        <input type="text" id="rName" value="${escapeH(r.name)}" placeholder="ej. Día 1 · Pecho/Tríceps"></div>
      <div class="field" style="margin-bottom:10px"><label>Grupos musculares</label>
        <input type="text" id="rGroup" value="${escapeH(r.group || '')}" placeholder="ej. Pecho · Tríceps"></div>
      <h4>Días de la semana</h4>
      <div class="day-chips" id="dayChips">${dayChips}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">
        ${(r.days || []).length > 1
          ? 'Con varios días, cada ejercicio puede asignarse a días concretos (vacío = todos).'
          : 'Selecciona varios días para poder asignar ejercicios a días concretos.'}
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn" id="bMetaNext">Guardar y continuar →</button>
      </div>
  ` : `
      <button class="re-summary" id="bEditMeta" type="button">
        <div>
          <div class="rs-name">${escapeH(r.name)}</div>
          <div class="rs-sub">${escapeH(r.group || 'sin grupos')} · ${dayList}</div>
        </div>
        <span class="rs-edit">✎ Editar datos</span>
      </button>
  `;

  openModal(`
    <div class="modal-head"><h3>Editar día</h3><button class="x" id="reClose">×</button></div>
    <div class="modal-body">
      ${metaBlock}
      <h4>Ejercicios${_reMetaOpen ? '' : ' (en orden)'}</h4>
      <div class="ed-list" id="edList">${items || '<div class="empty">Sin ejercicios. Añade uno abajo.</div>'}</div>
      <div class="actions" style="margin-top:10px"><button class="btn small" id="bAddEx">+ Añadir ejercicio</button></div>
    </div>
    <div class="modal-foot">
      <button class="btn secondary" id="reBack">‹ Volver</button>
      <button class="btn danger small" id="bDelRoute">Eliminar</button>
      <button class="btn" id="bDone">Hecho</button>
    </div>
  `);

  // Persiste los metadatos solo si el paso 1 está desplegado. Devuelve
  // false (y avisa) si falta el nombre, para no perder el dato al salir.
  function commitMetaIfOpen() {
    if (!_reMetaOpen) return true;
    const nameEl = $('#rName');
    if (!nameEl) return true;
    const name = nameEl.value.trim();
    if (!name) { toast('Necesitas un nombre', 'bad'); return false; }
    const days = [...$$('#dayChips .day-chip.on')].map(c => parseInt(c.dataset.d, 10));
    Store.updateRoutine(routineId, { name, group: $('#rGroup').value.trim(), days });
    return true;
  }
  const leave = () => {
    if (commitMetaIfOpen()) { App.refreshAll(); openSettings('routines'); }
  };

  $('#reClose').addEventListener('click', leave);
  $('#reBack').addEventListener('click',  leave);
  $('#bDone').addEventListener('click',   leave);

  if (_reMetaOpen) {
    $$('#dayChips .day-chip').forEach(c => {
      if ((r.days || []).includes(parseInt(c.dataset.d, 10))) c.classList.add('on');
      c.addEventListener('click', () => c.classList.toggle('on'));
    });
    $('#bMetaNext').addEventListener('click', () => {
      if (!commitMetaIfOpen()) return;
      _reMetaOpen = false;
      App.refreshAll();
      toast('Datos guardados');
      openRoutineEditor(routineId);   // re-render colapsado, foco en ejercicios
    });
  } else {
    $('#bEditMeta').addEventListener('click', () => {
      _reMetaOpen = true;
      openRoutineEditor(routineId);
    });
  }

  $('#bAddEx').addEventListener('click', () => {
    if (!commitMetaIfOpen()) return;
    openLibraryPicker(routineId);
  });

  /* Live-save debounced: persiste mientras escribes (no hace falta salir del
   * input). 350 ms ≈ 1-2 escrituras/s a IDB, imperceptible. */
  const liveSave = (() => {
    const timers = new Map();
    return (key, fn) => {
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(fn, 350));
    };
  })();

  $$('#edList .ed-item').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    el.querySelector('.b-up').addEventListener('click', () => { Store.moveItemInRoutine(routineId, idx, -1); openRoutineEditor(routineId); });
    el.querySelector('.b-dn').addEventListener('click', () => { Store.moveItemInRoutine(routineId, idx,  1); openRoutineEditor(routineId); });
    el.querySelector('.ed-del').addEventListener('click', () => { Store.removeItemFromRoutine(routineId, idx); openRoutineEditor(routineId); });

    const sSets = el.querySelector('.i-sets');
    const sRep  = el.querySelector('.i-rep');
    const sRst  = el.querySelector('.i-rest');
    const saveSets = () => Store.updateItemInRoutine(routineId, idx, { sets: parseInt(sSets.value, 10) || 3 });
    const saveRep  = () => Store.updateItemInRoutine(routineId, idx, { repRange: sRep.value.trim() });
    const saveRest = () => Store.updateItemInRoutine(routineId, idx, { rest: parseInt(sRst.value, 10) || 120 });
    sSets.addEventListener('input',  () => liveSave(`s${idx}`, saveSets));
    sSets.addEventListener('change', saveSets);
    sRep .addEventListener('input',  () => liveSave(`r${idx}`, saveRep));
    sRep .addEventListener('change', saveRep);
    sRst .addEventListener('input',  () => liveSave(`d${idx}`, saveRest));
    sRst .addEventListener('change', saveRest);

    el.querySelectorAll('.day-chip.mini').forEach(dc => {
      dc.addEventListener('click', () => {
        const d = parseInt(dc.dataset.day, 10);
        const item = r.items[idx];
        const cur = new Set(item.days || []);
        if (cur.has(d)) cur.delete(d); else cur.add(d);
        Store.updateItemInRoutine(routineId, idx, { days: [...cur] });
        openRoutineEditor(routineId);
      });
    });

  });

  // Conectores entre tarjetas (bi-serie). Viven FUERA del bucle de ed-items
  // porque son hermanos suyos, no hijos.
  $$('#edList .ed-ss-connector .ssc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.itidx, 10);
      if (!Number.isFinite(idx)) return;
      const wasLinked = !!(r.items[idx]?.supersetGroupId
        && r.items[idx].supersetGroupId === r.items[idx + 1]?.supersetGroupId);
      Store.toggleSupersetWithNext(routineId, idx);
      toast(wasLinked ? 'Bi-serie deshecha' : 'Bi-serie creada');
      openRoutineEditor(routineId);
    });
  });

  $('#bDelRoute').addEventListener('click', () => {
    if (!confirm('¿Eliminar este día? Las sesiones registradas se conservan')) return;
    Store.deleteRoutine(routineId); toast('Día eliminado'); App.refreshAll(); openSettings('routines');
  });
}

/* ============================================================================
   PICKER DE EJERCICIOS — catálogo con búsqueda + filtros
   ----------------------------------------------------------------------------
   Une el catálogo estático (exercise-catalog.js) con la biblioteca del
   usuario (ejercicios personalizados que no están en el catálogo). Permite:
     1. Buscar por nombre (sin distinguir mayúsculas ni acentos).
     2. Filtrar por grupo_muscular y por equipamiento (un chip por dimensión).
     3. Tocar un ejercicio → se materializa en la biblioteca (si hace falta)
        y se añade a la rutina con las series/reps recomendadas.
   ============================================================================ */

/** minúsculas + sin acentos, para que "biceps" encuentre "Bíceps". */
const fold = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function openLibraryPicker(routineId) {
  // --- Entradas unificadas ---
  const catIds = new Set(EXERCISE_CATALOG.map(c => c.id));
  const entries = EXERCISE_CATALOG.map(c => {
    const e = catalogToExercise(c);
    return {
      id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment,
      sets: e.defaultSets, repRange: e.defaultRepRange,
      inLib: !!Store.exerciseById(e.id), custom: false,
    };
  });
  // Ejercicios personalizados del usuario que no están en el catálogo
  Store.exercises().forEach(ex => {
    if (catIds.has(ex.id)) return;
    entries.push({
      id: ex.id, name: ex.name, muscle: ex.group, equipment: '—',
      sets: 3, repRange: '8-12', inLib: true, custom: true,
    });
  });

  /* === Rediseño UX/UI (Bento + multi-select + sticky CTA) ===================
   * State:
   *   - q:        query de búsqueda; si != '' renderizamos flat list, si '' bento
   *   - expanded: Set<groupName> de cards desplegadas (acordeón multi-abierto)
   *   - selected: Set<exerciseId> seleccionados → CTA inferior los añade en lote
   * Antes: la lista plana forzaba 1 picker abierto por ejercicio añadido.
   * Ahora: marca todos los que quieras → "Añadir N" → vuelve al editor del día. */
  const state = {
    q: '',
    expanded: new Set(),
    selected: new Set(),
  };

  openModal(`
    <div class="modal-head">
      <h3>Añadir ejercicios</h3>
      <button class="x" id="picBack" aria-label="Cerrar">×</button>
    </div>
    <div class="modal-body pick-body">
      <button class="btn small pick-new" id="bNewLib" type="button">
        + Crear ejercicio personalizado
      </button>
      <input type="text" class="pick-search" id="pickSearch"
             placeholder="Buscar por nombre…"
             autocomplete="off" autocorrect="off" spellcheck="false"
             aria-label="Buscar ejercicio por nombre">
      <div id="pickContent"></div>
    </div>
    <div class="modal-foot pick-foot">
      <button class="pick-cta off" id="picCTA" type="button">‹ Volver</button>
    </div>
  `);

  const back = () => openRoutineEditor(routineId);
  $('#picBack').addEventListener('click', back);

  // Req 3: al crear un ejercicio propio se inserta SOLO en el día activo
  // (cero clics extra) y volvemos al editor del día. Cancelar → al picker.
  $('#bNewLib').addEventListener('click', () =>
    openExerciseEditor(
      null,
      () => openLibraryPicker(routineId),
      (newEx) => {
        Store.addItemToRoutine(routineId, {
          exerciseId: newEx.id, sets: 3, repRange: '8-12',
          rest: Store.getDefaultRest(), days: [],
        });
        toast(`Añadido: ${newEx.name}`);
        openRoutineEditor(routineId);
      },
    ));

  $('#pickSearch').addEventListener('input', (e) => {
    state.q = e.target.value;
    renderContent();
  });

  $('#picCTA').addEventListener('click', () => {
    if (state.selected.size === 0) back();
    else commitBatch();
  });

  function rowHTML(e) {
    const sel = state.selected.has(e.id);
    return `
      <div class="pick-row ${sel ? 'on' : ''}" data-id="${escapeH(e.id)}">
        <div class="pr-info">
          <div class="pr-name">${escapeH(e.name)}${e.inLib ? ' <span class="badge">en biblioteca</span>' : ''}</div>
          <div class="pr-meta">${escapeH(e.muscle)} · ${escapeH(e.equipment)} · ${e.sets}×${escapeH(e.repRange)}</div>
        </div>
        <button class="pr-toggle ${sel ? 'on' : ''}" type="button"
                aria-label="${sel ? 'Quitar de la selección' : 'Añadir a la selección'}">${sel ? '✓' : '+'}</button>
      </div>`;
  }

  function cardHTML(group, items) {
    const expanded = state.expanded.has(group);
    const selectedInGroup = items.reduce((n, e) => n + (state.selected.has(e.id) ? 1 : 0), 0);
    return `
      <div class="pg-card ${expanded ? 'open' : ''} ${selectedInGroup ? 'has-sel' : ''}" data-group="${escapeH(group)}">
        <button class="pg-head" type="button" aria-expanded="${expanded}">
          <div class="pg-name">${escapeH(group)}</div>
          <div class="pg-meta">
            <span>${items.length} ${items.length === 1 ? 'ejercicio' : 'ejercicios'}</span>
            ${selectedInGroup ? `<span class="pg-badge">${selectedInGroup}</span>` : ''}
          </div>
          <span class="pg-chev" aria-hidden="true">›</span>
        </button>
        <div class="pg-body">
          ${items.map(rowHTML).join('')}
        </div>
      </div>`;
  }

  function renderContent() {
    const q = fold(state.q.trim());
    const host = $('#pickContent');

    if (q) {
      // === Modo búsqueda: flat list cross-grupo ===
      const filtered = entries.filter(e => fold(e.name).includes(q));
      host.innerHTML = filtered.length
        ? `<div class="pick-count">${filtered.length} resultado${filtered.length === 1 ? '' : 's'}</div>
           <div class="pick-flat">${filtered.map(rowHTML).join('')}</div>`
        : '<div class="pick-empty">Ningún ejercicio coincide.</div>';
    } else {
      // === Modo bento: grupos como tarjetas, acordeón ===
      const byGroup = new Map();
      for (const e of entries) {
        const g = e.muscle || 'Otro';
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(e);
      }
      // Orden: respeta CATALOG_MUSCLES; los grupos custom (no presentes en el
      // catálogo, por ejercicios personalizados) van al final, alfabético.
      const ordered = [
        ...CATALOG_MUSCLES.filter(m => byGroup.has(m)),
        ...[...byGroup.keys()].filter(m => !CATALOG_MUSCLES.includes(m)).sort(),
      ];

      host.innerHTML = ordered.length
        ? `<div class="pick-bento">${ordered.map(g => cardHTML(g, byGroup.get(g))).join('')}</div>`
        : '<div class="pick-empty">Sin ejercicios disponibles.</div>';
    }

    bindContent();
    renderCTA();
  }

  function bindContent() {
    // Tap en una card de grupo → toggle expand/collapse
    $$('#pickContent .pg-head').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.closest('.pg-card').dataset.group;
        if (state.expanded.has(g)) state.expanded.delete(g);
        else state.expanded.add(g);
        renderContent();
      });
    });
    // Tap en una row de ejercicio (o en su toggle [+/✓]) → toggle selección
    $$('#pickContent .pick-row').forEach(row => {
      row.addEventListener('click', () => toggleSelect(row.dataset.id));
    });
  }

  function toggleSelect(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    renderContent();
  }

  function renderCTA() {
    const cta = $('#picCTA');
    const n = state.selected.size;
    if (n === 0) {
      cta.className = 'pick-cta off';
      cta.textContent = '‹ Volver';
    } else {
      cta.className = 'pick-cta on';
      cta.textContent = `Añadir ${n} ejercicio${n === 1 ? '' : 's'}`;
    }
  }

  function commitBatch() {
    let added = 0;
    for (const id of state.selected) {
      const entry = entries.find(e => e.id === id);
      if (!entry) continue;
      if (!entry.custom && !Store.exerciseById(entry.id)) {
        Store.addExerciseFromCatalog(entry.id);
      }
      Store.addItemToRoutine(routineId, {
        exerciseId: entry.id, sets: entry.sets, repRange: entry.repRange,
        rest: Store.getDefaultRest(), days: [],
      });
      added++;
    }
    toast(`Añadido${added === 1 ? '' : 's'}: ${added} ejercicio${added === 1 ? '' : 's'}`);
    openRoutineEditor(routineId);
  }

  renderContent();
}

/* ============================================================================
   BIBLIOTECA + EDITOR DE EJERCICIO
   ============================================================================ */
function renderLibrarySection() {
  const exs = Store.exercises();
  const list = exs.map(e => `
    <div class="lib-row" data-id="${e.id}">
      <div><div class="lr-name">${escapeH(e.name)}</div><div class="lr-group">${escapeH(e.group)}${e.compound ? ' · compuesto' : ''}</div></div>
      <div class="lr-actions"><button class="b-edit" title="Editar">✎</button><button class="b-del" title="Eliminar">×</button></div>
    </div>
  `).join('');

  $('#settingsBody').innerHTML = `
    <h4>Biblioteca de ejercicios</h4>
    ${list || '<div class="empty">Sin ejercicios.</div>'}
    <div class="actions" style="margin-top:14px">
      <button class="btn small" id="bNewLib">+ Nuevo ejercicio</button>
      <button class="btn small secondary" id="lsBack">‹ Volver</button>
    </div>
  `;

  $('#lsBack').addEventListener('click', () => openSettings('menu'));
  $('#bNewLib').addEventListener('click', () => openExerciseEditor(null, () => openSettings('library')));

  $$('#settingsBody .lib-row').forEach(r => {
    r.querySelector('.b-edit').addEventListener('click', () => openExerciseEditor(r.dataset.id, () => openSettings('library')));
    r.querySelector('.b-del').addEventListener('click', () => {
      if (!confirm('¿Eliminar este ejercicio?')) return;
      const ok = Store.deleteExercise(r.dataset.id);
      if (!ok) { toast('No se puede: tiene historial o está en una rutina', 'bad'); return; }
      App.refreshAll(); openSettings('library');
    });
  });
}

/**
 * @param {string|null} exId   id a editar, o null para crear nuevo
 * @param {()=>void} [onClose]  al cancelar/cerrar (o tras guardar si no hay onCreate)
 * @param {(ex:object)=>void} [onCreate]  SOLO al crear uno nuevo con éxito:
 *        recibe el ejercicio creado para insertarlo donde haga falta.
 */
function openExerciseEditor(exId, onClose, onCreate) {
  const ex = exId ? Store.exerciseById(exId) : { name: '', group: 'Otro', compound: false };
  openModal(`
    <div class="modal-head"><h3>${exId ? 'Editar' : 'Nuevo'} ejercicio</h3><button class="x" id="xClose">×</button></div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:10px"><label>Nombre</label><input type="text" id="exName" value="${escapeH(ex.name)}" autofocus></div>
      <div class="field" style="margin-bottom:10px"><label>Grupo</label>
        <select id="exGroup">${GROUPS.map(g => `<option ${ex.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin-bottom:10px"><label>
        <input type="checkbox" id="exCompound" ${ex.compound ? 'checked' : ''} style="width:auto;margin-right:6px"> Compuesto (multi-articular)
      </label></div>
    </div>
    <div class="modal-foot">
      <button class="btn secondary" id="bCancel">Cancelar</button>
      <button class="btn" id="bSave">Guardar</button>
    </div>
  `);

  const close = () => { if (onClose) onClose(); else closeModal(); };
  $('#xClose').addEventListener('click', close);
  $('#bCancel').addEventListener('click', close);
  $('#bSave').addEventListener('click', () => {
    const name = $('#exName').value.trim();
    if (!name) { toast('Falta el nombre', 'bad'); return; }
    const patch = { name, group: $('#exGroup').value, compound: $('#exCompound').checked };
    if (exId) {
      Store.updateExercise(exId, patch);
      App.refreshAll(); toast('Guardado'); close();
      return;
    }
    const newEx = Store.addExercise(patch);
    App.refreshAll();
    if (onCreate) onCreate(newEx);          // inserción automática (cero clics)
    else { toast('Guardado'); close(); }
  });
}

/* ============================================================================
   DESCANSO POR DEFECTO
   ============================================================================ */
function renderRestSection() {
  $('#settingsBody').innerHTML = `
    <h4>Descanso por defecto</h4>
    <div class="field" style="margin-bottom:14px">
      <label>Tiempo aplicado a ejercicios sin descanso configurado</label>
      <div class="stepper">
        <button id="drM">−15</button>
        <input type="number" id="drVal" value="${Store.getDefaultRest()}" inputmode="numeric" min="10" step="15">
        <button id="drP">+15</button>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${[60,90,120,150,180].map(v => `<button class="day-chip" data-v="${v}">${fmtMMSS(v)}</button>`).join('')}
    </div>
    <div class="actions" style="margin-top:16px">
      <button class="btn secondary" id="drBack">‹ Volver</button>
      <button class="btn" id="drSave">Guardar</button>
    </div>
  `;
  $('#drBack').addEventListener('click', () => openSettings('menu'));
  $('#drM').addEventListener('click', () => { const v = parseInt($('#drVal').value, 10); $('#drVal').value = Math.max(10, v - 15); });
  $('#drP').addEventListener('click', () => { const v = parseInt($('#drVal').value, 10); $('#drVal').value = v + 15; });
  $$('#settingsBody [data-v]').forEach(c => c.addEventListener('click', () => { $('#drVal').value = c.dataset.v; }));
  $('#drSave').addEventListener('click', () => {
    Store.setDefaultRest(parseInt($('#drVal').value, 10));
    toast('Guardado'); openSettings('menu');
  });
}

/* ============================================================================
   DATOS — EXPORT / IMPORT / RESET
   ============================================================================ */
function renderDataSection() {
  const sessCount = Store.data.sessions.length;
  $('#settingsBody').innerHTML = `
    <h4>Backup</h4>
    <div class="actions" style="flex-direction:column;gap:8px">
      <button class="btn small secondary" id="bExport">Exportar JSON</button>
      <button class="btn small secondary" id="bImport">Importar JSON</button>
      <input type="file" id="impFile" accept=".json,application/json" style="display:none">
    </div>

    <h4>Importar histórico (CSV)</h4>
    <div class="actions" style="flex-direction:column;gap:8px">
      <button class="btn small secondary" id="bImpCsv">Elegir archivo CSV…</button>
      <input type="file" id="impCsvFile"
             accept=".csv,text/csv,text/plain,application/vnd.ms-excel,.txt"
             style="display:none">
    </div>
    <div class="mr-sub" style="margin:8px 0 6px;font-size:11px">
      Si el selector de archivos no abre (panel de preview / iPhone), pega
      aquí el contenido del CSV y pulsa Importar:
    </div>
    <textarea id="impCsvText" placeholder="Pega aquí el texto del CSV…"
      style="width:100%;min-height:90px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px;font-size:12px;font-family:monospace;-webkit-appearance:none"></textarea>
    <div class="actions" style="margin-top:8px">
      <button class="btn small" id="bImpCsvText">Importar texto pegado</button>
    </div>
    <div class="mr-sub" style="margin-top:8px;font-size:11px">
      Idempotente: reimportar no duplica. Recomendado: "Exportar JSON" antes.
    </div>

    <h4>Historial</h4>
    <div class="mr-sub" style="margin-bottom:8px">${sessCount} sesiones registradas en total.</div>
    <div class="actions" style="flex-direction:column;gap:8px">
      <button class="btn small secondary" id="bDemo">Cargar datos de demo</button>
      <button class="btn small danger" id="bClearHist">Vaciar historial</button>
    </div>
    <div class="mr-sub" style="margin-top:8px;font-size:11px">
      "Vaciar historial" borra sesiones y workouts pero conserva tus rutinas y la biblioteca.
      "Cargar datos de demo" añade 11 semanas de sesiones de prueba para que veas la app con datos.
    </div>

    <h4>Reseteo total</h4>
    <div class="actions"><button class="btn small danger" id="bReset">Restablecer todo a estado inicial</button></div>
    <div class="mr-sub" style="margin-top:6px;font-size:11px">
      Borra TODO: rutinas, días, biblioteca personalizada y sesiones.
    </div>

    <div class="actions" style="margin-top:16px"><button class="btn secondary" id="dsBack">‹ Volver</button></div>
  `;
  $('#dsBack').addEventListener('click', () => openSettings('menu'));
  $('#bExport').addEventListener('click', () => exportJSON());
  $('#bImport').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    importJSON(f, () => { App.refreshAll(); closeModal(); });
  });

  // Importación compartida por el selector de archivo Y el pegado de texto
  // (el pegado funciona aunque el sandbox/preview bloquee el file picker).
  const runCsvImport = (text) => {
    if (!text || !text.trim()) { toast('No hay CSV que importar', 'bad'); return; }
    if (!confirm('Se añadirá tu histórico del CSV a las sesiones (no duplica lo ya importado). Recomendado exportar un backup JSON antes. ¿Continuar?')) return;
    try {
      const r = seedHistoricalData(text);
      App.refreshAll();
      const rng = r.range ? ` (${r.range[0]} → ${r.range[1]})` : '';
      let msg = `Importado:\n· ${r.sessions} sesiones · ${r.sets} series · ${r.workouts} entrenamientos${rng}\n`
              + `· Ejercicios: ${r.exercisesCreated} creados, ${r.exercisesReused} reutilizados`;
      if (r.skipped.length) {
        msg += `\n\n${r.skipped.length} celdas NO parseadas (revísalas a mano):\n`
             + r.skipped.slice(0, 12).map(s => `· ${s.name}: "${s.raw}" — ${s.reason}`).join('\n')
             + (r.skipped.length > 12 ? `\n… y ${r.skipped.length - 12} más` : '');
      }
      alert(msg);
      toast(`Histórico: ${r.sessions} sesiones importadas`, 'pr');
      openSettings('data');
    } catch (err) {
      alert('Error al importar el CSV: ' + ((err && err.message) || err));
    }
  };

  $('#bImpCsv').addEventListener('click', () => $('#impCsvFile').click());
  $('#impCsvFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => runCsvImport(String(reader.result));
    reader.onerror = () => alert('No se pudo leer el archivo. Prueba a pegar el texto.');
    reader.readAsText(f);
  });
  $('#bImpCsvText').addEventListener('click',
    () => runCsvImport($('#impCsvText').value));

  $('#bDemo').addEventListener('click', () => {
    if (!confirm('Esto añadirá 11 semanas de sesiones de demostración a tu historial actual. ¿Continuar?')) return;
    Store.loadDemoData();
    App.refreshAll();
    toast('Datos de demo cargados');
    openSettings('data');   // refresca el contador
  });

  $('#bClearHist').addEventListener('click', () => {
    if (!confirm('¿Vaciar TODO el historial? Tus rutinas se mantienen pero perderás todas las sesiones registradas. Esta acción no se puede deshacer.')) return;
    Store.clearHistory();
    App.refreshAll();
    toast('Historial vaciado');
    openSettings('data');
  });

  $('#bReset').addEventListener('click', async () => {
    if (!confirm('¿Restablecer TODO (rutinas, días, biblioteca)? Esta acción no se puede deshacer.')) return;
    await Store.resetToSeed();
    App.refreshAll();
    toast('App restablecida'); closeModal();
  });
}
