/**
 * health.js — datos biométricos (Apple HealthKit) vía el plugin nativo
 * `capacitor-health` (compatible con Capacitor 8). Toda la lógica de salud
 * vive aquí; la UI solo llama a `captureWorkoutEnergy()` /
 * `isNativeHealthAvailable()`.
 *
 * Sin bundler: accedemos al plugin por el global que Capacitor inyecta en
 * runtime dentro del contenedor nativo. OJO: `capacitor-health` registra el
 * plugin con el nombre 'HealthPlugin' (aunque su export JS se llame `Health`),
 * así que en runtime es window.Capacitor.Plugins.HealthPlugin.
 * En la PWA web (sin contenedor) todo degrada a null sin romper nada; la UI
 * ofrece entrada manual como respaldo.
 *
 * API de `capacitor-health` usada:
 *   - requestHealthPermissions({ permissions: ['READ_ACTIVE_CALORIES'] })
 *   - queryAggregated({ startDate, endDate, dataType:'active-calories', bucket:'day' })
 *       → { aggregatedData: [{ startDate, endDate, value }] }
 *   (value en kcal)
 *
 * Requisitos nativos (ver NATIVE-HEALTHKIT-SETUP.md):
 *   - Info.plist: NSHealthShareUsageDescription
 *   - Capability "HealthKit" en el target de Xcode
 *   - Probar SIEMPRE en iPhone real (HealthKit no da datos en el simulador)
 */

const READ_PERMS = ['READ_ACTIVE_CALORIES'];

/** Devuelve el plugin Health si corremos DENTRO del contenedor nativo. */
function nativePlugin() {
  const cap = (typeof window !== 'undefined') ? window.Capacitor : null;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
    return null;
  }
  // `capacitor-health` se registra como 'HealthPlugin' (su export JS `Health`
  // es solo un alias del proxy). En runtime, por tanto, el global correcto es
  // cap.Plugins.HealthPlugin. Dejamos `.Health` como respaldo por si un día
  // renombran el registro.
  return (cap.Plugins && (cap.Plugins.HealthPlugin || cap.Plugins.Health)) || null;
}

/** ¿Hay HealthKit nativo disponible (app envuelta en Capacitor en iOS)? */
export function isNativeHealthAvailable() {
  return !!nativePlugin();
}

let _authOk = null; // null=sin pedir · true/false=resultado cacheado

/**
 * Pide permiso de LECTURA de calorías activas. Debe llamarse desde un gesto
 * de usuario la primera vez (iOS muestra la hoja de permisos de Salud).
 * @returns {Promise<boolean>}
 */
export async function requestHealthPermission() {
  const hk = nativePlugin();
  if (!hk) return false;
  if (_authOk === true) return true;
  try {
    await hk.requestHealthPermissions({ permissions: READ_PERMS });
    _authOk = true;
    return true;
  } catch (err) {
    console.warn('[health] requestHealthPermissions falló:', err);
    _authOk = false;
    return false;
  }
}

/**
 * Suma las kilocalorías de energía ACTIVA quemadas en la ventana [startISO,
 * endISO]. Devuelve un entero, o null si no hay nativo / permiso / datos.
 * @param {string} startISO  ISO datetime
 * @param {string} endISO    ISO datetime
 * @returns {Promise<number|null>}
 */
export async function activeEnergyBetween(startISO, endISO) {
  const hk = nativePlugin();
  if (!hk || !startISO || !endISO) return null;
  try {
    if (_authOk !== true) {
      const ok = await requestHealthPermission();
      if (!ok) return null;
    }
    const res = await hk.queryAggregated({
      startDate: startISO,
      endDate: endISO,
      dataType: 'active-calories',
      bucket: 'day',            // el rango cae en un día → una sola cubeta = suma del rango
    });
    const rows = (res && res.aggregatedData) || [];
    let kcal = 0;
    for (const r of rows) kcal += (+r.value || 0);
    if (!(kcal > 0)) return null;
    return Math.round(kcal);
  } catch (err) {
    console.warn('[health] queryAggregated falló:', err);
    return null;
  }
}

/**
 * Facade para el CIERRE de rutina: toma la ventana del workout (startAt–endAt)
 * y devuelve las kcal activas reales del Apple Watch, o null.
 * @param {{startAt?:string, endAt?:string}} workout
 * @returns {Promise<number|null>}
 */
export async function captureWorkoutEnergy(workout) {
  if (!workout || !workout.startAt) return null;
  const endISO = workout.endAt || new Date().toISOString();
  return activeEnergyBetween(workout.startAt, endISO);
}
