/**
 * POST /api/test-push  { subscription }
 * Envía un push INMEDIATO para verificar de punta a punta que VAPID + la
 * suscripción funcionan (sin QStash de por medio). Lo usa el botón
 * "Enviar prueba" de Ajustes.
 *
 * Env vars: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.
 */
const webpush = require('web-push');
const { applyCors } = require('./_cors');

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.VAPID_PUBLIC || !process.env.VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID not configured' });
  }

  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'missing subscription' });
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:kinetic@example.com',
      process.env.VAPID_PUBLIC,
      process.env.VAPID_PRIVATE,
    );
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: '✅ Notificaciones activas', body: 'Todo listo. Recibirás el aviso al terminar el descanso.' }),
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: String((e && e.message) || e),
      statusCode: e && e.statusCode,
    });
  }
};
