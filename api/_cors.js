/**
 * Helper CORS compartido por las funciones /api. La PWA se sirve en /app/ y
 * llama a /api/* en el mismo origen, así que técnicamente no haría falta CORS,
 * pero lo dejamos permisivo para poder probar los endpoints desde cualquier
 * herramienta (curl, un tab suelto) sin fricción.
 */
function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
module.exports = { applyCors };
