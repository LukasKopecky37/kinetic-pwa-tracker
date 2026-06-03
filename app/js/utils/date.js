/**
 * Helpers de fecha.
 * Todo el código trabaja con strings ISO ('YYYY-MM-DD') para evitar problemas
 * de zona horaria. Solo aquí ocurren las conversiones a `Date`.
 */

export const todayISO = () =>
  new Date().toISOString().slice(0, 10);

/**
 * Convierte 'YYYY-MM-DD' en 'd.m' para mostrar en chips/tarjetas.
 * @param {string} d
 */
export const fmtDate = (d) => {
  const [, m, day] = d.split('-');
  return `${parseInt(day, 10)}.${parseInt(m, 10)}`;
};

/**
 * Días transcurridos entre `dateStr` y hoy. `null` si no hay fecha.
 * @param {string|null} dateStr
 */
export const daysSince = (dateStr) => {
  if (!dateStr) return null;
  return Math.floor((new Date(todayISO()) - new Date(dateStr)) / 86400000);
};
