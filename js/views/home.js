/**
 * Vista Home — dashboard Rutina → Días.
 *
 * Jerarquía (decidida con el usuario): 1 nivel de contenedor visible.
 *   - "RUTINA" (lo que el usuario ve y crea) = `data.mesos[]` en el código.
 *     Es el contenedor: nombre + subtítulo/descripción.
 *   - "DÍA" (Push, Pull, …) = lo que el código llama `routine`
 *     (`data.routines[]`, con `mesoId`, `name`, `days[]`, `items[]`).
 *   NO hay migración: solo reencuadre de terminología + UX. El modelo v6
 *   sigue intacto (mesos/routines).
 *
 * Layout visual:
 *
 *   ┌─────────────────────────────────────┐
 *   │ Banner racha (si streak ≥ 3 días)   │
 *   │ Banner "Hoy es {día}" (slim)        │
 *   │ ┌── Rutina (cabecera-identidad) ──┐ │
 *   │ │  Tu rutina · «Hipertrofia»  4d  │ │
 *   │ ├── Días ────────────────────────┤ │
 *   │ │ [Día 1: Push] [Día 2: Pull] …   │ │
 *   │ │ + Nuevo día                     │ │
 *   │ └─────────────────────────────────┘ │
 *   │ Cambiar de rutina (secundario)      │
 *   │ [otra rutina]  + Nueva rutina       │
 *   └─────────────────────────────────────┘
 *
 * Botones:
 *   - "+ Nuevo día"    → añade un Día a la Rutina activa (Store.addRoutine)
 *   - "+ Nueva rutina" → crea otra Rutina/plan (Store.addMeso)
 */

import { $, $$, h, mount } from '../utils/dom.js';
import { todayISO, daysSince } from '../utils/date.js';
import { DAY_NAMES, DAY_SHORT } from '../constants.js';
import { Store } from '../store/store.js';
import { openModal, closeModal } from '../services/modal.js';
import { toast } from '../services/toast.js';
import { RoutineButton } from '../components/RoutineButton.js';
import { streakDays }   from '../analytics/streak.js';
import { App } from '../app.js';

/* Estado de navegación del dashboard:
 *   openMesoId === null  → grid de tarjetas de Rutina (nivel 1)
 *   openMesoId === id    → detalle: los Días de esa Rutina (nivel 2)
 * Vive en el módulo a propósito: App.showHome()/refreshAll() vuelven a
 * renderizar conservando el nivel donde estaba el usuario (volver desde un
 * Día devuelve a la lista de Días de su Rutina, no al grid). */
let openMesoId = null;

/** Ir al grid de Rutinas (nivel 1). */
export function homeShowRutinas() {
  openMesoId = null;
  renderHome();
}

/** Entrar al detalle de una Rutina (nivel 2). La marca como activa para que
 * "+ Nuevo día", la selección de Día y el registro de sesiones apunten a
 * ella (filtrado por mesoId = el "rutinaId" del modelo). */
export function homeOpenRutina(mesoId) {
  // Guard: si la Rutina ya no existe (borrada en otra pantalla) no fijes un
  // currentMesoId fantasma (dejaría toda la app sin rutinas) → vuelve al grid.
  if (!Store.mesos().some(m => m.id === mesoId)) { homeShowRutinas(); return; }
  openMesoId = mesoId;
  if (Store.data.currentMesoId !== mesoId) Store.setCurrentMeso(mesoId);
  renderHome();
}

export function renderHome() {
  renderStreakBanner();
  const grid = $('#routineGrid');
  if (openMesoId && !Store.mesos().some(m => m.id === openMesoId)) {
    openMesoId = null; // la Rutina abierta se borró
  }
  mount(grid, openMesoId ? renderRutinaDetail(openMesoId) : renderRutinasGrid());
}

/* ============================================================================
   NIVEL 1 — Grid de Rutinas (+ banner "Hoy" inteligente)
   ============================================================================ */
function suggestionFor(days, todayDow) {
  const todayDay = days.find(d => (d.days || []).includes(todayDow));
  const lastId = Store.getLastRoutine();
  let suggestedId = null;
  if (!todayDay && lastId && days.some(d => d.id === lastId)) {
    suggestedId = lastId;
  } else if (!todayDay) {
    const ranked = days.map(d => {
      const last = Store.lastSessionForRoutine(d.id);
      return { id: d.id, since: last ? daysSince(last.date) : 9999 };
    }).sort((a, b) => b.since - a.since);
    if (ranked[0]) suggestedId = ranked[0].id;
  }
  return { todayDay, lastId, targetId: todayDay ? todayDay.id : suggestedId };
}

function renderRutinasGrid() {
  const todayDow = new Date(todayISO() + 'T00:00').getDay();
  const meso = Store.currentMeso();
  const activeDays = meso ? Store.routines(meso.id) : [];
  const { todayDay, lastId, targetId } = suggestionFor(activeDays, todayDow);
  const hoyTarget = targetId ? Store.routineById(targetId) : null;

  const out = [];

  // ─ Banner "HOY" — CTA al día que toca del plan activo ─
  out.push(
    h('button', {
      class: 'home-today' + (hoyTarget ? '' : ' is-empty'),
      onClick: () => {
        if (hoyTarget) App.showRoutine(hoyTarget.id);
        else if (meso) homeOpenRutina(meso.id);
      },
    },
      h('div', { class: 'ht-eyebrow' }, `Hoy es ${DAY_NAMES[todayDow].toLowerCase()}`),
      h('div', { class: 'ht-line' },
        hoyTarget
          ? h('span', { class: 'ht-name' }, hoyTarget.name)
          : h('span', { class: 'ht-name muted' }, '¿qué entrenas? · crea tu rutina'),
        hoyTarget
          ? h('span', { class: 'ht-sub' },
              `${meso ? meso.name + ' · ' : ''}` + (
                !todayDay
                  ? (lastId === hoyTarget.id ? 'última usada' : 'siguiente sugerido')
                  : 'toca para entrenar'))
          : null,
      ),
      hoyTarget ? h('span', { class: 'ht-go' }, 'entrenar ›') : null,
    ),
  );

  // ─ Tarjetas de Rutina (nivel contenedor) ─
  const cards = Store.mesos().map(m => {
    const nDays = Store.routines(m.id).length;
    const nSess = Store.data.sessions.filter(s => s.mesoId === m.id).length;
    const isActive = m.id === Store.data.currentMesoId;
    return h('button', {
      class: 'rutina-card' + (isActive ? ' is-active' : ''),
      onClick: () => homeOpenRutina(m.id),
    },
      h('div', { class: 'rc-main' },
        h('div', { class: 'rc-eyebrow' },
          'Rutina',
          isActive ? h('span', { class: 'rc-badge' }, 'activa') : null,
        ),
        h('div', { class: 'rc-name' }, m.name),
        m.subtitle ? h('div', { class: 'rc-sub' }, m.subtitle) : null,
        h('div', { class: 'rc-stats' },
          `${nDays} ${nDays === 1 ? 'día' : 'días'} · ${nSess} ${nSess === 1 ? 'sesión' : 'sesiones'}`),
      ),
      h('div', { class: 'rc-arrow' }, '›'),
    );
  });

  cards.push(
    h('button', { class: 'rutina-card add', onClick: () => promptNewMeso() },
      h('div', { class: 'rc-main' },
        h('div', { class: 'rc-name add' }, '+ Nueva rutina'),
        h('div', { class: 'rc-sub' }, 'crea un plan nuevo (le pones nombre)'),
      ),
    ),
  );

  out.push(
    h('div', { class: 'home-section' },
      h('div', { class: 'home-sec-title' }, h('span', null, 'Tus rutinas')),
      h('div', { class: 'home-grid routine-grid' }, ...cards),
    ),
  );
  return out;
}

/* ============================================================================
   NIVEL 2 — Detalle de una Rutina: sus Días
   ============================================================================ */
function renderRutinaDetail(mesoId) {
  const meso = Store.mesos().find(m => m.id === mesoId);
  if (!meso) { openMesoId = null; return renderRutinasGrid(); }

  const todayDow = new Date(todayISO() + 'T00:00').getDay();
  const days = Store.routines(mesoId);
  const { todayDay, lastId, targetId } = suggestionFor(days, todayDow);

  const goToDay = (dayId) => {
    if (Store.data.currentMesoId !== mesoId) Store.setCurrentMeso(mesoId);
    App.showRoutine(dayId);
  };
  const addDay = () => {
    if (Store.data.currentMesoId !== mesoId) Store.setCurrentMeso(mesoId);
    promptNewDay();
  };

  const head = h('div', { class: 'rutina-detail-head' },
    h('button', {
      class: 'rdh-back', 'aria-label': 'Volver a Rutinas',
      onClick: () => homeShowRutinas(),
    }, '‹'),
    h('div', { class: 'rdh-titles' },
      h('div', { class: 'rdh-eyebrow' }, 'Rutina'),
      h('div', { class: 'rdh-name' }, meso.name),
      meso.subtitle ? h('div', { class: 'rdh-sub' }, meso.subtitle) : null,
    ),
    h('button', {
      class: 'rdh-edit', 'aria-label': 'Editar rutina',
      onClick: () => import('./settings.js').then(m => m.openSettings('mesos')),
    }, '✎'),
  );

  const out = [head];

  if (days.length === 0) {
    out.push(
      h('div', { class: 'empty empty-soft' },
        'Esta rutina todavía no tiene días.',
        h('br'),
        h('button', { class: 'btn small', style: { marginTop: '12px' },
          onClick: addDay }, '+ Crear primer día'),
      ),
    );
    return out;
  }

  const dayCards = days.map((d, i) => {
    const last = Store.lastSessionForRoutine(d.id);
    const since = last ? daysSince(last.date) : null;
    const sinceTxt =
      since == null ? 'sin registro' :
      since === 0   ? 'hoy' :
      since === 1   ? 'ayer' : `hace ${since} días`;
    const isSug = (d.id === targetId);
    const dayLabel = (d.days || []).map(dw => DAY_SHORT[dw]).join('·');
    const exCount = d.items.length + (d.items.length === 1 ? ' ejercicio' : ' ejercicios');
    return RoutineButton({
      suggested: isSug,
      day:       `Día ${i + 1}${dayLabel ? ' · ' + dayLabel : ''}`,
      name:      d.name,
      group:     (d.group ? d.group + ' · ' : '') + exCount,
      metaLabel: isSug ? (todayDay ? 'hoy' : 'sugerido') : 'última',
      meta:      sinceTxt,
      onTap:     () => goToDay(d.id),
    });
  });
  dayCards.push(RoutineButton({
    add: true,
    name: '+ Nuevo día',
    group: 'añade un día a esta rutina',
    onTap: addDay,
  }));

  out.push(
    h('div', { class: 'home-section' },
      h('div', { class: 'home-sec-title' },
        h('span', null, `Días · ${days.length}`),
        h('a', { class: 'home-sec-action', onClick: () => {
          import('./settings.js').then(m => m.openSettings('routines'));
        }}, 'gestionar'),
      ),
      h('div', { class: 'home-grid routine-grid' }, ...dayCards),
    ),
  );

  // ─ Pendientes esta semana: ejercicios de la rutina activa que NO se han
  // entrenado ni una vez en los últimos 7 días. Tap → al día que los contiene.
  const pending = pendingThisWeek(mesoId, days);
  if (pending.length) {
    out.push(
      h('div', { class: 'home-section' },
        h('div', { class: 'home-sec-title' },
          h('span', null, `Pendientes esta semana · ${pending.length}`),
        ),
        h('div', { class: 'pend-list' },
          ...pending.map(p => h('button', {
            class: 'pend-row', type: 'button',
            onClick: () => {
              const dia = days.find(d => d.items.some(it => it.exerciseId === p.id));
              if (dia) goToDay(dia.id);
            },
          },
            h('div', { class: 'pend-main' },
              h('div', { class: 'pend-name' }, p.name),
              h('div', { class: 'pend-sub' },
                p.dayNames.join(' · '),
                ' · ',
                p.lastDate ? `última hace ${daysSince(p.lastDate)} días` : 'sin registro',
              ),
            ),
            h('span', { class: 'pend-arrow' }, '›'),
          )),
        ),
      ),
    );
  }

  return out;
}

/* ============================================================================
   Pendientes de la semana — ejercicios de la rutina activa no entrenados en
   los últimos 7 días. Comparamos exerciseIds de los Días con sessions reales.
   ============================================================================ */
function pendingThisWeek(mesoId, days, daysBack = 7) {
  // Set de ids de ejercicios + en qué Día(s) aparece cada uno
  const inRoutine = new Map();          // exId → [día.name, …]
  for (const d of days) {
    for (const it of (d.items || [])) {
      if (!inRoutine.has(it.exerciseId)) inRoutine.set(it.exerciseId, []);
      inRoutine.get(it.exerciseId).push(d.name);
    }
  }
  if (!inRoutine.size) return [];

  const cut = new Date(); cut.setDate(cut.getDate() - daysBack);
  const cutISO = cut.toISOString().slice(0, 10);

  const sessions = Store.data.sessions;
  const recently = new Set(
    sessions.filter(s => s.date >= cutISO && s.mesoId === mesoId)
            .map(s => s.exerciseId),
  );

  const out = [];
  for (const [exId, dayNames] of inRoutine) {
    if (recently.has(exId)) continue;
    const ex = Store.exerciseById(exId);
    if (!ex) continue;
    // Última fecha que se entrenó (cualquier momento) → "hace N días"
    let lastDate = null;
    for (const s of sessions) {
      if (s.exerciseId !== exId) continue;
      if (!lastDate || s.date > lastDate) lastDate = s.date;
    }
    out.push({
      id: exId, name: ex.name, group: ex.group,
      dayNames: [...new Set(dayNames)], lastDate,
    });
  }
  // Los nunca-hechos primero; el resto por fecha ascendente (los más viejos arriba)
  out.sort((a, b) => {
    if (!a.lastDate && !b.lastDate) return 0;
    if (!a.lastDate) return -1;
    if (!b.lastDate) return 1;
    return a.lastDate.localeCompare(b.lastDate);
  });
  return out;
}

/* ============================================================================
   "+ Nuevo día" — añade un día (sub-rutina) a la rutina actual
   ============================================================================ */
function promptNewDay() {
  // Store.addRoutine cuelga el Día de currentMesoId; sin Rutina activa
  // acabaría huérfano. Guard explícito (entrada desde Ajustes → Días).
  if (!Store.currentMeso()) {
    toast('Crea o selecciona una rutina primero', 'bad');
    return;
  }
  openModal(`
    <div class="modal-head">
      <h3>Nuevo día de entrenamiento</h3>
      <button class="x" id="nrClose">×</button>
    </div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:10px">
        <label>Nombre del día</label>
        <input type="text" id="newRName" placeholder="ej. Lunes - Pecho · Tríceps" autofocus>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Grupos musculares</label>
        <input type="text" id="newRGroup" placeholder="ej. Pecho · Tríceps">
      </div>
      <h4>¿Qué día(s) de la semana?</h4>
      <div class="day-chips" id="newRDays">
        ${[1,2,3,4,5,6,0].map(d => `<button class="day-chip" data-d="${d}">${DAY_SHORT[d]}</button>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn secondary" id="nrCancel">Cancelar</button>
      <button class="btn" id="bNRSave">Crear y editar</button>
    </div>
  `);

  setTimeout(() => $('#newRName').focus(), 50);
  $('#nrClose').addEventListener('click', closeModal);
  $('#nrCancel').addEventListener('click', closeModal);

  $$('#newRDays .day-chip').forEach(c => {
    c.addEventListener('click', () => c.classList.toggle('on'));
  });

  $('#bNRSave').addEventListener('click', () => {
    const name = $('#newRName').value.trim();
    if (!name) { toast('Necesitas un nombre', 'bad'); return; }
    const dayNums = [...$$('#newRDays .day-chip.on')].map(c => parseInt(c.dataset.d, 10));
    const group   = $('#newRGroup').value.trim();
    const r = Store.addRoutine({ name, days: dayNums, group });
    App.refreshAll();
    import('./settings.js').then(m => m.openRoutineEditor(r.id));
  });
}

/* Compat: el botón "+ Nueva rutina" del editor antiguo apuntaba aquí.
   Lo mantengo exportado con el nombre original. */
export const promptNewRoutine = promptNewDay;

/* ============================================================================
   "+ Nueva rutina" — crea un nuevo mesociclo (programa completo)
   ============================================================================ */
function promptNewMeso() {
  openModal(`
    <div class="modal-head">
      <h3>Nueva rutina (programa)</h3>
      <button class="x" id="nmClose">×</button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--muted);margin-top:0">
        Una rutina es un programa completo, como "Rutina II — 24 semanas".
        Dentro tendrá los días que tú configures.
      </p>
      <div class="field" style="margin-bottom:10px">
        <label>Nombre de la rutina</label>
        <input type="text" id="newMName" placeholder="ej. Rutina III — Hipertrofia" autofocus>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Subtítulo (opcional)</label>
        <input type="text" id="newMSub" placeholder="ej. 12 semanas">
      </div>
      <div class="field">
        <label>
          <input type="checkbox" id="newMClone" style="width:auto;margin-right:6px">
          Duplicar los días de la rutina actual como base
        </label>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn secondary" id="nmCancel">Cancelar</button>
      <button class="btn" id="bNMSave">Crear</button>
    </div>
  `);

  setTimeout(() => $('#newMName').focus(), 50);
  $('#nmClose').addEventListener('click', closeModal);
  $('#nmCancel').addEventListener('click', closeModal);

  $('#bNMSave').addEventListener('click', () => {
    const name = $('#newMName').value.trim();
    if (!name) { toast('Necesitas un nombre', 'bad'); return; }
    const subtitle = $('#newMSub').value.trim();
    const clone    = $('#newMClone').checked;
    const m = Store.addMeso({
      name, subtitle,
      cloneFrom: clone ? Store.data.currentMesoId : undefined,
    });
    closeModal();
    toast(`Rutina «${name}» creada`);
    App.refreshAll();
    // Entra directo a la nueva Rutina: el siguiente paso (añadir días) ahí.
    homeOpenRutina(m.id);
  });
}

/* ============================================================================
   Banner motivacional (racha)
   ============================================================================ */
function renderStreakBanner() {
  const host = $('#streakBanner');
  if (!host) return;
  const streak = streakDays(Store.data.sessions);
  if (streak < 3) {
    host.innerHTML = '';
    return;
  }
  const banner = h('div', {
    class: 'streak-banner',
    onClick: () => App.switchTab('analisis'),
  },
    h('span', { class: 'sb-icon' }, '🔥'),
    h('span', { class: 'sb-text' },
      'Llevas ',
      h('b', null, `${streak} días`),
      ' entrenando seguidos',
    ),
    h('span', { class: 'sb-arrow' }, '›'),
  );
  host.replaceChildren(banner);
}
