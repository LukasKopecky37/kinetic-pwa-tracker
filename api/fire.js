/**
 * POST /api/fire  (lo llama QStash cuando expira el retardo)
 * Envía el Web Push real de "descanso terminado" a la suscripción.
 *
 * Body (puesto por /api/schedule): { subscription, exName, secret }
 * Verificamos `secret` contra PUSH_SECRET para que nadie ajeno a QStash pueda
 * disparar pushes a un usuario (protección simple de shared-secret).
 *
 * Devolvemos SIEMPRE 2xx (incluso si el push falla) para que QStash no
 * reintente en bucle — p.ej. una suscripción caducada (410 Gone) es
 * definitiva, no un fallo transitorio.
 *
 * Env vars: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SECRET.
 */
const webpush = require('web-push');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { subscription, exName, secret } = req.body || {};

    if (!process.env.PUSH_SECRET || secret !== process.env.PUSH_SECRET) {
      return res.status(401).json({ error: 'bad secret' });
    }
    if (!subscription || !subscription.endpoint) {
      return res.status(200).json({ ok: false, error: 'no subscription' });
    }
    if (!process.env.VAPID_PUBLIC || !process.env.VAPID_PRIVATE) {
      return res.status(500).json({ error: 'VAPID not configured' });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:kinetic@example.com',
      process.env.VAPID_PUBLIC,
      process.env.VAPID_PRIVATE,
    );

    const payload = JSON.stringify({
      title: '¡Descanso terminado!',
      body: 'Es hora de tu siguiente serie. ¡A por ello!' + (exName ? ' · ' + exName : ''),
    });

    await webpush.sendNotification(subscription, payload);
    return res.status(200).json({ ok: true });
  } catch (e) {
    // No reintentar: devolvemos 200 con el detalle para diagnóstico.
    return res.status(200).json({
      ok: false,
      error: String((e && e.message) || e),
      statusCode: e && e.statusCode,
    });
  }
};
