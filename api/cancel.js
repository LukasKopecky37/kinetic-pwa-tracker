/**
 * POST /api/cancel  { messageId }
 * Cancela una notificación programada en QStash que aún NO se ha entregado
 * (el usuario pulsó "Saltar" o ajustó ±15 → reprogramamos). Si el mensaje ya
 * se entregó/expiró (404), lo tratamos como éxito idempotente.
 *
 * Env vars: QSTASH_TOKEN.
 */
const { applyCors } = require('./_cors');

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.QSTASH_TOKEN) {
    return res.status(500).json({ error: 'server not configured (QSTASH_TOKEN)' });
  }

  try {
    const { messageId } = req.body || {};
    if (!messageId) return res.status(400).json({ error: 'missing messageId' });

    const r = await fetch(
      `https://qstash.upstash.io/v2/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` } },
    );
    // 404 → ya no existe (entregado o cancelado antes) → idempotente OK.
    return res.status(200).json({ ok: r.ok || r.status === 404 });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
