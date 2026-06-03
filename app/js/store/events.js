/**
 * Mini event bus para el Store.
 *
 * Permite que vistas, servicios o futuras capas (IA Coach, notificaciones,
 * sync cloud) reaccionen a mutaciones concretas sin que el Store sepa de
 * ellos.
 *
 * API:
 *   const off = on('session:added', s => { ... });
 *   off();                          // desuscribir
 *   on('change', ({event, payload}) => { ... });  // todos los eventos
 *   emit('session:added', sess);    // disparar
 *
 * Eventos que ya emite el Store en Fase D:
 *   session:added | session:updated | session:removed
 *   routine:added | routine:updated | routine:removed
 *   meso:added    | meso:updated    | meso:removed
 *   exercise:added| exercise:updated| exercise:removed
 *   meso:active-changed
 *   data:replaced     (al cargar / restaurar / resetear)
 *
 * Los listeners se invocan síncronamente. Si uno lanza, se atrapa y se
 * continúa con los demás.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const set = listeners.get(event);
  if (set) set.delete(fn);
}

export function emit(event, payload) {
  const direct = listeners.get(event);
  if (direct) {
    for (const fn of direct) {
      try { fn(payload); } catch (e) { console.error('[bus]', event, e); }
    }
  }
  const all = listeners.get('change');
  if (all) {
    for (const fn of all) {
      try { fn({ event, payload }); } catch (e) { console.error('[bus] change', e); }
    }
  }
}

/** Limpia todos los listeners. Útil en tests. */
export function _reset() {
  listeners.clear();
}
