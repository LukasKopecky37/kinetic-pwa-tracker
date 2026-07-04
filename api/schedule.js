/**
 * POST /api/schedule
 * Programa una notificación push de "descanso terminado" para dentro de
 * `delaySeconds` segundos, usando QStash como cola de retardo de nivel-SO.
 *
 * Body: { subscription, delaySeconds, exName }
 *   subscription — el PushSubscription serializado del cliente
 *   delaySeconds — cuánto falta para el fin del descanso (1..3600)
 *   exName       — nombre del ejercicio (para el cuerpo de la notif)
 *
 * QStash recibe el mensaje con un `Upstash-Delay` y, cuando expira, hace un
 * POST a /api/fire con el body → esa función manda el Web Push real. Esto
 * funciona con el iPhone bloqueado porque APNs entrega el push aunque el JS
 * de la PWA esté suspendido.
 *
 * Responde { messageId } → el cliente lo guarda para poder CANCELAR/RE-
 * PROGRAMAR al pulsar Saltar o ±15.
 *
 * Env vars requeridas: QSTASH_TOKEN, PUSH_SECRET.
 */
const { applyCors } = require('./_cors');

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!process.env.QSTASH_TOKEN || !process.env.PUSH_SECRET) {
    return res.status(500).json({ error: 'server not configured (QSTASH_TOKEN / PUSH_SECRET)' });
  }

  try {
    const { subscription, delaySeconds, exName } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'missing subscription' });
    }
    const delay = Math.max(1, Math.min(3600, Math.round(Number(delaySeconds) || 0)));

    // URL pública absoluta de /api/fire (QStash necesita un destino http).
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const fireUrl = `${proto}://${host}/api/fire`;

    const r = await fetch(
      `https://qstash.upstash.io/v2/publish/${encodeURIComponent(fireUrl)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
          'Upstash-Delay': `${delay}s`,
        },
        body: JSON.stringify({
          subscription,
          exName: exName || '',
          secret: process.env.PUSH_SECRET,
        }),
      },
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: 'qstash publish failed', detail });
    }
    const data = await r.json();
    return res.status(200).json({ messageId: data.messageId || null });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
