/**
 * Store — fachada única de datos.
 *
 * Responsabilidades:
 *   - CRUD del estado (mesos, rutinas, items, sesiones, biblioteca)
 *   - persistencia (localStorage sync + IndexedDB async vía Dexie)
 *   - event bus: notifica mutaciones a quien se suscriba
 *
 * Lo que NO es responsabilidad del Store:
 *   - cálculo (1RM, sugerencias, estancamiento, volumen, PR, mapa muscular)
 *     todo eso vive en /js/analytics como funciones puras.
 *
 * API pública mantenida para retro-compatibilidad con las vistas:
 *   - `Store.routines()`, `Store.exerciseById(...)`, `Store.addSession(...)` …
 *   - delegates analíticos `Store.isPR()`, `Store.estimate1RM()` …
 *
 * Nuevo en Fase D:
 *   - `Store.load()` es async (lee IDB primero, fallback localStorage).
 *   - `Store.save()` sigue siendo síncrono desde fuera, pero internamente
 *     escribe en localStorage (mirror) y dispara una escritura async a IDB.
 *   - `Store.on(event, fn)` / `Store.off(event, fn)` / lista de eventos
 *     documentada en /js/store/events.js.
 */

import { seedData, generateDemoSessions, DEMO_LIBRARY } from './seed.js';
import { EXERCISE_CATALOG, catalogToExercise } from './exercise-catalog.js';
import { loadStateAsync, saveToStorage, ensureFields, clearAllStorage, KEY } from './migrations.js';
import { saveState as saveStateIDB } from './db.js';
import { on, off, emit } from './events.js';

import { estimate1RM, bestEstimated1RM }         from '../analytics/one-rm.js';
import { suggestNextWeight, averagePosition }    from '../analytics/progression.js';
import { isStalled, findStalledExercises }       from '../analytics/stagnation.js';
import { weeklySetsByGroup, adherenceMatrix }    from '../analytics/volume.js';
import { isPR }                                  from '../analytics/prs.js';
import { activeMuscles }                         from '../analytics/muscles.js';

// Contador monótono para ids de sesión: evita la colisión de
// `Date.now()+Math.random()` cuando se guardan dos series en el mismo ms.
let _sessionSeq = 0;

export const Store = {
  /** @type {object|null} */
  data: null,

  /* === Event bus (re-exports) === */
  on, off,

  async load() {
    const { data, safeToSave } = await loadStateAsync();
    this.data = data;
    // Solo persistimos si es carga real o primer arranque genuino. Si una
    // lectura falló y caímos a seed vacío, NO escribimos: evitaría pisar el
    // histórico real que no se pudo leer este arranque.
    if (safeToSave) this.save();
    emit('data:replaced', this.data);
  },

  ensureFields() {
    if (this.data) ensureFields(this.data);
  },

  /**
   * Persiste el estado.
   * - localStorage sync: mirror inmediato por si se cierra la pestaña.
   * - IndexedDB async: durabilidad real, fire-and-forget.
   */
  save() {
    saveToStorage(this.data);
    saveStateIDB(this.data);    // no se espera; se reintenta en próximas escrituras si falla
  },

  /** Reset total: borra localStorage + IDB y siembra datos de prueba. */
  async resetToSeed(oldSessions) {
    await clearAllStorage();
    this.data = seedData(oldSessions);
    this.save();
    emit('data:replaced', this.data);
  },

  /**
   * Vacía solo el historial (sesiones + workouts) manteniendo rutinas,
   * biblioteca y mesociclos. Útil para "empezar limpio".
   */
  clearHistory() {
    this.data.sessions = [];
    this.data.workouts = [];
    this.data.activeWorkoutId = null;
    this.save();
    emit('data:replaced', this.data);
  },

  /**
   * Inyecta sesiones de demostración en el mesociclo actual (para que el
   * usuario pueda ver cómo se ven los gráficos sin tener que entrenar
   * 11 semanas primero).
   */
  loadDemoData() {
    // El arranque va sin biblioteca, así que el demo trae la suya: añadimos
    // los ejercicios de DEMO_LIBRARY que falten (dedupe por id) para que el
    // histórico de demo no apunte a ejercicios inexistentes.
    const have = new Set(this.data.exercises.map(e => e.id));
    DEMO_LIBRARY.forEach(e => {
      if (!have.has(e.id)) this.data.exercises.push({ ...e });
    });
    const demo = generateDemoSessions(this.data.currentMesoId);
    // No pisamos el historial real: las añadimos.
    this.data.sessions = this.data.sessions.concat(demo);
    this.save();
    emit('data:replaced', this.data);
  },

  /** Reemplaza el estado (usado por el importador JSON). */
  replaceData(data) {
    this.data = data;
    if (this.data) ensureFields(this.data);
    this.save();
    emit('data:replaced', this.data);
  },

  /* === Mesociclos === */
  mesos()        { return this.data.mesos; },
  currentMeso()  { return this.data.mesos.find(m => m.id === this.data.currentMesoId); },
  setCurrentMeso(id) {
    this.data.currentMesoId = id;
    this.save();
    emit('meso:active-changed', id);
  },

  addMeso({ name, subtitle, cloneFrom }) {
    const id = 'meso-' + Date.now();
    const meso = {
      id, name, subtitle: subtitle || '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
    };
    this.data.mesos.push(meso);
    if (cloneFrom) {
      const src = this.data.routines.filter(r => r.mesoId === cloneFrom);
      src.forEach(r => {
        this.data.routines.push({
          ...JSON.parse(JSON.stringify(r)),
          id: 'r-' + Date.now() + Math.random().toString(36).slice(2, 6),
          mesoId: id,
        });
      });
    }
    this.data.currentMesoId = id;
    this.save();
    emit('meso:added', meso);
    emit('meso:active-changed', id);
    return meso;
  },

  deleteMeso(id) {
    if (this.data.mesos.length <= 1) return false;
    this.data.mesos    = this.data.mesos.filter(m => m.id !== id);
    this.data.routines = this.data.routines.filter(r => r.mesoId !== id);
    if (this.data.currentMesoId === id) this.data.currentMesoId = this.data.mesos[0].id;
    this.save();
    emit('meso:removed', id);
    return true;
  },

  renameMeso(id, name, subtitle) {
    const m = this.data.mesos.find(x => x.id === id);
    if (m) {
      m.name = name;
      if (subtitle != null) m.subtitle = subtitle;
      this.save();
      emit('meso:updated', m);
    }
  },

  /* === Biblioteca de ejercicios === */
  exercises()        { return this.data.exercises; },
  exerciseById(id)   { return this.data.exercises.find(e => e.id === id); },

  addExercise({ name, group, compound }) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
             + '-' + Math.random().toString(36).slice(2, 5);
    const ex = { id, name, group: group || 'Otro', compound: !!compound };
    this.data.exercises.push(ex);
    this.save();
    emit('exercise:added', ex);
    return ex;
  },

  /**
   * Materializa un ejercicio del catálogo en la biblioteca del usuario.
   * Dedupe por el id estable del catálogo: si ya existe, devuelve el que hay
   * (no duplica al añadirlo a otra rutina). Conserva id + campos extra
   * (muscle/equipment) y normaliza `group` a la taxonomía canónica.
   *
   * @param {string} catId  id de EXERCISE_CATALOG
   * @returns {object|null} el ejercicio de la biblioteca
   */
  addExerciseFromCatalog(catId) {
    const cat = EXERCISE_CATALOG.find(c => c.id === catId);
    if (!cat) return null;
    const existing = this.exerciseById(catId);
    if (existing) return existing;
    const e = catalogToExercise(cat);
    const ex = {
      id: e.id, name: e.name, group: e.group, compound: e.compound,
      muscle: e.muscle, equipment: e.equipment,
    };
    this.data.exercises.push(ex);
    this.save();
    emit('exercise:added', ex);
    return ex;
  },

  updateExercise(id, patch) {
    const ex = this.exerciseById(id);
    if (ex) { Object.assign(ex, patch); this.save(); emit('exercise:updated', ex); }
  },

  deleteExercise(id) {
    const used = this.data.sessions.some(s => s.exerciseId === id)
              || this.data.routines.some(r => r.items.some(i => i.exerciseId === id));
    if (used) return false;
    this.data.exercises = this.data.exercises.filter(e => e.id !== id);
    this.save();
    emit('exercise:removed', id);
    return true;
  },

  /* === Rutinas === */
  routines(mesoId) {
    const mid = mesoId || this.data.currentMesoId;
    return this.data.routines.filter(r => r.mesoId === mid);
  },
  routineById(id) { return this.data.routines.find(r => r.id === id); },

  addRoutine({ name, days, group }) {
    const id = 'r-' + Date.now() + Math.random().toString(36).slice(2, 5);
    const r = {
      id, mesoId: this.data.currentMesoId,
      name: name || 'Nueva rutina',
      days: days || [], group: group || '',
      items: [],
    };
    this.data.routines.push(r);
    this.save();
    emit('routine:added', r);
    return r;
  },

  updateRoutine(id, patch) {
    const r = this.routineById(id);
    if (r) { Object.assign(r, patch); this.save(); emit('routine:updated', r); }
  },

  deleteRoutine(id) {
    this.data.routines = this.data.routines.filter(r => r.id !== id);
    this.save();
    emit('routine:removed', id);
  },

  addItemToRoutine(routineId, item) {
    const r = this.routineById(routineId);
    if (!r) return;
    if (item.rest == null) item.rest = this.data.settings.defaultRest || 120;
    // Default UX: si la rutina tiene varios días, el ejercicio nace asignado
    // al primero (no a "todos"). Eso fuerza al usuario a elegir explícito el
    // multi-día solo cuando lo necesita. Caso anterior (todos) generaba ruido.
    if (!item.days || item.days.length === 0) {
      item.days = (r.days && r.days.length) ? [r.days[0]] : [];
    }
    r.items.push(item);
    this.save();
    emit('routine:updated', r);
  },

  removeItemFromRoutine(routineId, idx) {
    const r = this.routineById(routineId);
    if (r) { r.items.splice(idx, 1); this.save(); emit('routine:updated', r); }
  },

  moveItemInRoutine(routineId, idx, dir) {
    const r = this.routineById(routineId);
    if (!r) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= r.items.length) return;
    [r.items[idx], r.items[ni]] = [r.items[ni], r.items[idx]];
    this.save();
    emit('routine:updated', r);
  },

  updateItemInRoutine(routineId, idx, patch) {
    const r = this.routineById(routineId);
    if (r && r.items[idx]) { Object.assign(r.items[idx], patch); this.save(); emit('routine:updated', r); }
  },

  /**
   * Ejercicios a mostrar al abrir una rutina en una fecha dada.
   *
   * - Si la fecha cae en uno de los días asignados a la rutina, se respeta
   *   la asignación por ejercicio (soporte multi-día: cada `item` puede
   *   limitarse a un subconjunto de los días de la rutina; `days: []` = todos).
   * - Si la fecha NO es uno de los días de la rutina (p.ej. abres "Lunes"
   *   un domingo porque vas a entrenar igual), el filtrado por sub-día deja
   *   de tener sentido: devolvemos TODOS los ejercicios de la rutina para
   *   que puedas hacer ese día de la rutina cuando quieras.
   */
  itemsForDate(routineId, date) {
    const r = this.routineById(routineId);
    if (!r) return [];
    const dow = new Date(date + 'T00:00').getDay();
    if (!(r.days || []).includes(dow)) return r.items;
    return r.items.filter(it => !it.days || it.days.length === 0 || it.days.includes(dow));
  },

  /* === Sesiones === */
  sessions(mesoId) {
    if (mesoId === false) return this.data.sessions;
    const mid = mesoId || this.data.currentMesoId;
    return this.data.sessions.filter(s => s.mesoId === mid);
  },

  sessionsByExercise(exId, allMesos) {
    return (allMesos ? this.data.sessions : this.sessions())
      .filter(s => s.exerciseId === exId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  sessionsByDate(date) {
    return this.data.sessions.filter(s => s.date === date);
  },

  lastSession(exId, beforeDate) {
    return this.sessionsByExercise(exId, true)
      .filter(s => !beforeDate || s.date < beforeDate)
      .slice(-1)[0];
  },

  lastSessionForRoutine(routineId) {
    const r = this.routineById(routineId);
    if (!r) return null;
    const ids = r.items.map(i => i.exerciseId);
    return this.data.sessions
      .filter(s => ids.includes(s.exerciseId))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  },

  addSession(s) {
    s.id = 's' + Date.now() + '-' + (++_sessionSeq);
    s.mesoId = s.mesoId || this.data.currentMesoId;
    // Auto-enlace al workout activo si lo hay
    if (!s.workoutId && this.data.activeWorkoutId) {
      s.workoutId = this.data.activeWorkoutId;
    }
    this.data.sessions.push(s);
    this.save();
    emit('session:added', s);
    return s;
  },

  updateSession(id, patch) {
    const s = this.data.sessions.find(x => String(x.id) === String(id));
    if (s) { Object.assign(s, patch); this.save(); emit('session:updated', s); }
  },

  removeSessionFor(date, exerciseId) {
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(
      s => !(s.date === date && s.exerciseId === exerciseId)
    );
    if (this.data.sessions.length !== before) {
      this.save();
      emit('session:removed', { date, exerciseId });
    }
  },

  removeSessionById(id) {
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(s => String(s.id) !== String(id));
    if (this.data.sessions.length !== before) {
      this.save();
      emit('session:removed', { id });
    }
  },

  /* === Workouts (Fase E) ============================================ *
   * Un workout es la "sesión de entrenamiento" completa de un día:     *
   * fecha, hora de inicio y fin, readiness opcional y las sesiones     *
   * individuales (vía session.workoutId) que se registraron dentro.    *
   *                                                                    *
   * Mientras `data.activeWorkoutId` apunta a uno, cada `addSession()`  *
   * lo enlaza automáticamente.                                         *
   * =================================================================== */

  workouts(mesoId) {
    const mid = mesoId || this.data.currentMesoId;
    return this.data.workouts.filter(w => w.mesoId === mid);
  },
  workoutById(id) { return this.data.workouts.find(w => w.id === id); },
  workoutsByDate(date) { return this.data.workouts.filter(w => w.date === date); },
  activeWorkout() {
    return this.data.activeWorkoutId
      ? this.workoutById(this.data.activeWorkoutId)
      : null;
  },
  sessionsOfWorkout(workoutId) {
    return this.data.sessions
      .filter(s => s.workoutId === workoutId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  /**
   * Inicia un workout y lo marca como activo. Si ya hay uno activo, lo
   * dejamos como está (el caller debe terminar el anterior antes).
   */
  startWorkout({ routineId, date, readiness }) {
    if (this.data.activeWorkoutId) {
      return this.activeWorkout(); // ya hay uno; no creamos otro
    }
    const w = {
      id: 'w-' + Date.now() + Math.random().toString(36).slice(2, 5),
      mesoId: this.data.currentMesoId,
      routineId: routineId || null,
      date: date || new Date().toISOString().slice(0, 10),
      startAt: new Date().toISOString(),
      endAt: null,
      readiness: readiness || null,
    };
    this.data.workouts.push(w);
    this.data.activeWorkoutId = w.id;
    this.save();
    emit('workout:started', w);
    return w;
  },

  /** Termina un workout (sello de hora fin) y lo desactiva. */
  finishWorkout(id) {
    const w = this.workoutById(id || this.data.activeWorkoutId);
    if (!w) return null;
    w.endAt = new Date().toISOString();
    if (this.data.activeWorkoutId === w.id) this.data.activeWorkoutId = null;
    this.save();
    emit('workout:finished', w);
    return w;
  },

  /** Cancela un workout: lo borra y desenlaza las sesiones que apuntaban a él. */
  cancelWorkout(id) {
    const wid = id || this.data.activeWorkoutId;
    if (!wid) return false;
    // Desenlace de sesiones (las dejamos huérfanas, no las borramos)
    this.data.sessions.forEach(s => {
      if (s.workoutId === wid) delete s.workoutId;
    });
    this.data.workouts = this.data.workouts.filter(w => w.id !== wid);
    if (this.data.activeWorkoutId === wid) this.data.activeWorkoutId = null;
    this.save();
    emit('workout:cancelled', wid);
    return true;
  },

  setWorkoutReadiness(id, readiness) {
    const w = this.workoutById(id);
    if (!w) return;
    w.readiness = readiness;
    this.save();
    emit('workout:updated', w);
  },

  /* === Settings === */
  setLastRoutine(id)  { this.data.settings.lastRoutineId = id; this.save(); },
  getLastRoutine()    { return this.data.settings.lastRoutineId; },
  setDefaultRest(s)   { this.data.settings.defaultRest = s; this.save(); },
  getDefaultRest()    { return this.data.settings.defaultRest || 120; },

  /* === Analítica (delegates a /js/analytics) ============================ *
   * Mantienen la API que ya usan las vistas. Cada método aquí es un       *
   * one-liner que pasa los datos a la función pura correspondiente.       *
   * Cuando una vista nueva no necesite paso por el Store, puede importar  *
   * directamente desde /js/analytics.                                     *
   * ===================================================================== */

  estimate1RM(weight, reps) {
    return estimate1RM(weight, reps);
  },

  best1RMForExercise(exId) {
    return bestEstimated1RM(this.sessionsByExercise(exId, true));
  },

  avgPosition(exId, n) {
    return averagePosition(this.sessionsByExercise(exId, true), n);
  },

  suggestWeight(exId, repRange, targetSets) {
    return suggestNextWeight(
      this.sessionsByExercise(exId, true),
      repRange, targetSets, this.exerciseById(exId),
    );
  },

  isStalled(exId) {
    return isStalled(this.sessionsByExercise(exId, true));
  },

  stalledExercises() {
    return findStalledExercises(
      this.sessions(),
      this.data.sessions,
      (id) => this.exerciseById(id),
    );
  },

  weeklySetsByGroup() {
    return weeklySetsByGroup(this.data.sessions, (id) => this.exerciseById(id), 7);
  },

  adherenceMatrix(weeks) {
    return adherenceMatrix(this.data.sessions, weeks || 12);
  },

  isPR(s) {
    return isPR(s, this.sessionsByExercise(s.exerciseId, true));
  },

  activeMusclesForDay(routineId, date) {
    return activeMuscles(
      this.itemsForDate(routineId, date),
      (id) => this.exerciseById(id),
    );
  },
};

// Re-export por conveniencia para el código que importe la constante.
export { KEY };
