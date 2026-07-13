/**
 * health.js — servicio de datos biométricos (Apple HealthKit vía Capacitor).
 *
 * SEPARACIÓN LIMPIA: aquí vive TODA la lógica de HealthKit; la UI solo llama
 * a `captureWorkoutEnergy()` / `isNativeHealthAvailable()`. No hay ningún
 * `import` del plugin (no hay bundler en la web) — accedemos al plugin por el
 * global que Capacitor inyecta en runtime dentro del contenedor nativo:
 *   window.Capacitor.Plugins.CapacitorHealthkit
 *
 * En la PWA web (sin contenedor nativo) todo degrada a null sin romper nada,
 * y la UI ofrece entrada manual como respaldo.
 *
 * Plugin usado: @perfood/capacitor-healthkit
 *   - requestAuthorization({ all, read, write })
 *   - queryHKitSampleType({ sampleName, startDate, endDate, limit })
 *       → { countReturn, resultData: [{ value, unitName, startDate, endDate }] }
 *
 * Requisitos nativos (ver NATIVE-HEALTHKIT-SETUP.md):
 *   - Info.plist: NSHealthShareUsageDescription
 *   - Capability "HealthKit" en el target de Xcode
 *   - Probar SIEMPRE en iPhone real (HealthKit no da datos en el simulador)
 */

const READ_TYPES = ['activeEnergyBurned'];

/** Devuelve el plugin de HealthKit si corremos DENTRO del contenedor nativo. */
function nativePlugin() {
  const cap = (typeof window !== 'undefined') ? window.Capacitor : null;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
    return null;
  }
  return (cap.Plugins && cap.Plugins.CapacitorHealthkit) || null;
}

/** ¿Hay HealthKit nativo disponible (app envuelta en Capacitor en iOS)? */
export function isNativeHealthAvailable() {
  return !!nativePlugin();
}

let _authOk = null; // null=sin pedir · true/false=resultado cacheado

/**
 * Pide permiso de LECTURA de energía activa. Debe llamarse desde un gesto de
 * usuario la primera vez (iOS muestra la hoja de permisos de Salud).
 * @returns {Promise<boolean>}
 */
export async function requestHealthPermission() {
  const hk = nativePlugin();
  if (!hk) return false;
  if (_authOk === true) return true;
  try {
    await hk.requestAuthorization({ all: [], read: READ_TYPES, write: [] });
    _authOk = true;
    return true;
  } catch (err) {
    console.warn('[health] requestAuthorization falló:', err);
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
    const res = await hk.queryHKitSampleType({
      sampleName: 'activeEnergyBurned',
      startDate: startISO,
      endDate: endISO,
      limit: 0,                 // 0 = sin límite → todas las muestras del rango
    });
    const rows = (res && res.resultData) || [];
    let kcal = 0;
    for (const s of rows) kcal += (+s.value || 0);
    if (!(kcal > 0)) return null;
    return Math.round(kcal);
  } catch (err) {
    console.warn('[health] queryHKitSampleType falló:', err);
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
