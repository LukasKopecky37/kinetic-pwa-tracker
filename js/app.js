/**
 * App — orquestador.
 *
 * Mantiene el estado de navegación (rutina activa, fecha) y conecta vistas
 * entre sí. Cada vista importa `App` para llamar a `refreshAll()`,
 * `showHome()` o `showRoutine()`.
 *
 * Si en el futuro queremos un router de verdad o un store reactivo
 * (`Store.on('session:added', ...)`) esto es el sitio donde sustituirlo
 * sin tocar las vistas.
 */

import { $, $$ } from './utils/dom.js';
import { todayISO } from './utils/date.js';
import { Store } from './store/store.js';
import { RestTimer } from './services/rest-timer.js';
import { bindModalDismiss } from './services/modal.js';

import { renderHome, homeShowRutinas } from './views/home.js';
import { renderRoutine }  from './views/routine.js';
import { renderHistory }  from './views/history.js';
import { renderProgress } from './views/progress.js';
import { renderAnalysis } from './views/analysis.js';
import { openSettings }   from './views/settings.js';

export const App = {
  state: {
    currentRoutineId: null,
    currentDate: todayISO(),
  },

  async init() {
    await Store.load();         // ahora async: IDB → localStorage → seed
    this.bindTabs();
    this.bindHeader();
    this.bindBack();
    bindModalDismiss();
    RestTimer.bind();
    this.showHome();            // SIEMPRE empezar en home
    this.refreshAll();
    $('#todayPill').textContent = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

    // Si había un entrenamiento en curso (p.ej. se bloqueó el móvil a mitad),
    // reabrimos el player encima de home para retomarlo donde quedó.
    if (Store.activeWorkout()) this.showActiveWorkout();

    // Modo demo público: si la URL trae ?demo y el navegador está limpio,
    // sembramos las 11 semanas de demo para que el visitante (LinkedIn etc.)
    // no aterrice en una app vacía. Sus datos quedan en su navegador.
    if (/[?&]demo\b/.test(location.search) && Store.data.sessions.length === 0) {
      Store.loadDemoData();
      this.refreshAll();
    }
  },

  /** Abre el player de entrenamiento activo (carga perezosa para romper el
   * ciclo app ↔ active-workout). */
  showActiveWorkout() {
    import('./views/active-workout.js').then(m => m.openActiveWorkout());
  },

  refreshAll() {
    this.renderHeader();
    renderHome();
    renderHistory();
    renderProgress();
    renderAnalysis();
  },

  renderHeader() {
    const m = Store.currentMeso();
    $('#appTitle').textContent = m ? m.name : 'Rutina';
    $('#mesoPill').textContent = m && m.subtitle ? m.subtitle : 'tu rutina';

    // Chip "entrenando" si hay workout activo
    const left = document.querySelector('.brand-left');
    const old = document.getElementById('activeChip');
    const w = Store.activeWorkout();
    if (w) {
      if (!old) {
        const chip = document.createElement('span');
        chip.id = 'activeChip';
        chip.className = 'active-chip';
        chip.innerHTML = '<span class="dot"></span><span>entrenando</span>';
        chip.addEventListener('click', () => this.showActiveWorkout());
        left.appendChild(chip);
      }
    } else if (old) {
      old.remove();
    }
  },

  bindHeader() {
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#mesoPill').addEventListener('click',   () => openSettings('mesos'));
    $('#quickEdit').addEventListener('click', (e) => {
      e.preventDefault();
      // Flujo jerárquico: empezar SIEMPRE en el nivel Rutina (el grid tiene
      // "+ Nueva rutina" como primer paso; dentro de cada Rutina se añaden
      // los días). Ya no salta al editor plano de días.
      this.switchTab('inicio');
      this.showHome();
      homeShowRutinas();
    });
  },

  bindTabs() {
    $$('.tabs button').forEach(b => {
      b.addEventListener('click', () => {
        $$('.tabs button').forEach(x => x.classList.remove('active'));
        $$('.tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const target = $('#tab-' + b.dataset.tab);
        target.classList.add('active');
        // Reaplica la animación de entrada
        target.classList.remove('tab-fade-in');
        void target.offsetWidth;
        target.classList.add('tab-fade-in');
        if (b.dataset.tab === 'inicio') this.showHome();
      });
    });
  },

  switchTab(name) {
    const btn = document.querySelector(`.tabs button[data-tab="${name}"]`);
    if (btn) btn.click();
  },

  bindBack() {
    $('#btnBack').addEventListener('click', () => this.showHome());
    $('#dateInput').addEventListener('change', (e) => {
      this.state.currentDate = e.target.value;
      renderRoutine();
    });
  },

  /* ===== Navegación entre Home ↔ Routine =====
   * Las dos subvistas son .subview. La activa lleva además .active.
   * La animación de entrada va por CSS (keyframes subviewIn / subviewBack).
   * Llamamos a `void el.offsetWidth` para forzar reflow y que la animación
   * se reproduzca aunque el elemento ya tuviera la clase. */
  showHome() {
    const home = $('#view-home');
    const rout = $('#view-routine');
    rout.classList.remove('active');
    home.classList.remove('active', 'from-back');
    void home.offsetWidth;
    home.classList.add('active', 'from-back');
    renderHome();
  },

  showRoutine(routineId, date) {
    const r = Store.routineById(routineId);
    if (!r) { this.showHome(); return; }
    Store.setLastRoutine(routineId);
    this.state.currentRoutineId = routineId;
    this.state.currentDate = date || todayISO();
    $('#dateInput').value = this.state.currentDate;
    $('#routeName').textContent = r.name;
    $('#routeSub').textContent  = r.group || (r.items.length + ' ejercicios');

    // Asegurar enlace "Editar rutina" en el .r-sub
    const sub = $('#routeSub');
    if (sub && !sub.querySelector('.r-edit')) {
      const a = document.createElement('a');
      a.className = 'r-edit';
      a.textContent = '✎ editar';
      a.addEventListener('click', e => {
        e.preventDefault();
        import('./views/settings.js').then(m => m.openRoutineEditor(routineId));
      });
      sub.appendChild(document.createTextNode(' · '));
      sub.appendChild(a);
    } else if (sub) {
      // Actualiza el routineId al que apunta el editor cuando la rutina cambia
      const a = sub.querySelector('.r-edit');
      a.onclick = e => {
        e.preventDefault();
        import('./views/settings.js').then(m => m.openRoutineEditor(routineId));
      };
    }

    const home = $('#view-home');
    const rout = $('#view-routine');
    home.classList.remove('active', 'from-back');
    rout.classList.remove('active', 'from-back');
    void rout.offsetWidth;
    rout.classList.add('active');
    renderRoutine();
  },
};
