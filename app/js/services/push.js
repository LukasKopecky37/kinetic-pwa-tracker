/**
 * push.js — cliente de Web Push para las notificaciones de descanso.
 *
 * Flujo (fix definitivo del bug "no llega con el móvil bloqueado"):
 *   1. El usuario activa notificaciones una vez (botón en Ajustes → gesto de
 *      usuario) → nos suscribimos a `pushManager` con la VAPID pública.
 *   2. Al empezar un descanso, `scheduleRestPush(delay)` le pide al backend
 *      (/api/schedule) que, vía QStash, mande un push REAL dentro de `delay`
 *      segundos. Como lo entrega APNs, llega aunque la PWA esté suspendida.
 *   3. Saltar / ±15 → `cancelRestPush()` cancela o reprograma.
 *
 * Si el backend NO está configurado todavía (sin env vars en Vercel), todo
 * degrada con gracia: las llamadas fallan en silencio y el timer local sigue
 * funcionando igual que antes. La app nunca se rompe por esto.
 *
 * La VAPID pública es pública por diseño (va firmada por la privada, que vive
 * solo en el servidor). El endpoint /api es del mismo origen que /app.
 */

// Debe coincidir con VAPID_PRIVATE de las env vars del servidor.
const VAPID_PUBLIC =
  'BNp75Xx-XrEjU4_taJbfgwyG9dYqE2lR8m2VJAmXtbqNbaKj8642w03bbqIMyjKlb2EyYadRIjvQNSawM9OcAFY';

// id del mensaje QStash actualmente programado (para cancelar/reprogramar).
let currentMessageId = null;

/** ¿Soporta este navegador Web Push? (iOS 16.4+ como PWA instalada, sí). */
export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Convierte la clave VAPID base64url a Uint8Array (formato applicationServerKey). */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Obtiene (o crea) la suscripción push. Reutiliza la existente si la hay.
 * Si hace falta pedir permiso y NO estamos en un gesto de usuario, iOS puede
 * rechazar el prompt → por eso `enablePush()` (botón de Ajustes) es el punto
 * de entrada pensado para el gesto; durante el entreno solo reutilizamos.
 * @returns {Promise<PushSubscription|null>}
 */
async function getSubscription({ allowPrompt = false } = {}) {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg || !reg.pushManager) return null;

  let sub = await reg.pushManager.getSubscription().catch(() => null);
  if (sub) return sub;

  if (Notification.permission !== 'granted') {
    if (!allowPrompt) return null;
    const p = await Notification.requestPermission().catch(() => Notification.permission);
    if (p !== 'granted') return null;
  }
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
    return sub;
  } catch (err) {
    console.warn('[push] subscribe failed:', err);
    return null;
  }
}

/**
 * Botón "Activar notificaciones" (Ajustes). Pide permiso + suscribe en un
 * gesto de usuario. Devuelve true si quedó suscrito.
 */
export async function enablePush() {
  const sub = await getSubscription({ allowPrompt: true });
  return !!sub;
}

/** ¿Estamos ya suscritos? (para pintar el estado del botón). */
export async function isSubscribed() {
  const sub = await getSubscription({ allowPrompt: false });
  return !!sub;
}

/**
 * Programa el push de fin de descanso para dentro de `delaySeconds`.
 * Cancela cualquier programación previa. Devuelve true si el backend aceptó.
 * @returns {Promise<boolean>}
 */
export async function scheduleRestPush(delaySeconds, exName) {
  try {
    const sub = await getSubscription({ allowPrompt: false });
    if (!sub) return false;
    await cancelRestPush();               // reschedule limpio
    const r = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        delaySeconds,
        exName: exName || '',
      }),
    });
    if (!r.ok) return false;
    const data = await r.json().catch(() => ({}));
    currentMessageId = data.messageId || null;
    return !!currentMessageId;
  } catch (e) {
    console.warn('[push] schedule error:', e);
    return false;
  }
}

/** Cancela el push programado actual (si lo hay). Best-effort. */
export async function cancelRestPush() {
  const id = currentMessageId;
  currentMessageId = null;
  if (!id) return;
  try {
    await fetch('/api/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id }),
    });
  } catch (e) {
    /* best-effort: si falla, el push llegará igualmente (no es crítico) */
  }
}

/** Envía un push de prueba inmediato. Devuelve el JSON del backend. */
export async function sendTestPush() {
  const sub = await getSubscription({ allowPrompt: true });
  if (!sub) return { ok: false, error: 'sin permiso o sin soporte' };
  try {
    const r = await fetch('/api/test-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return await r.json().catch(() => ({ ok: false, error: 'respuesta inválida' }));
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}
