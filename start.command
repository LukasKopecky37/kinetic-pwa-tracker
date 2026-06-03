#!/bin/bash
# Arranque rápido de la app en local.
#
# Intenta varios servidores HTTP en orden, usando lo que tu Mac ya tenga.
# Funciona sin instalar nada porque Ruby viene preinstalado en macOS.

cd "$(dirname "$0")"
PORT=8080
URL="http://localhost:${PORT}/index.html"

echo "▶ Sirviendo $(pwd)"
echo "▶ URL:       $URL"
echo "▶ Para salir: Ctrl+C"
echo

# Abre Safari en cuanto haya servidor (segundo plano)
(sleep 1.2 && open "$URL") &

# 1) Ruby con webrick — preinstalado en macOS 14 y anteriores
if command -v ruby >/dev/null && ruby -rwebrick -e 'WEBrick' >/dev/null 2>&1; then
  echo "(usando Ruby/webrick)"
  exec ruby -run -e httpd . -p "$PORT"

# 2) Python 3 — si lo tienes instalado por tu cuenta (brew, python.org…)
elif command -v python3 >/dev/null && python3 --version >/dev/null 2>&1; then
  echo "(usando python3)"
  exec python3 -m http.server "$PORT"

# 3) Fallback Node si por casualidad lo tienes
elif command -v npx >/dev/null; then
  echo "(usando npx http-server)"
  exec npx --yes http-server -p "$PORT" -c-1

else
  echo
  echo "❌ No encontré ningún servidor HTTP en tu Mac."
  echo
  echo "Tienes dos opciones igual de fáciles:"
  echo
  echo "  A) Sube la app gratis a Netlify Drop (la mejor opción si quieres"
  echo "     usarla desde el iPhone o compartirla):"
  echo "       → https://app.netlify.com/drop"
  echo "       Arrastra la carpeta GYM y te dará una URL pública."
  echo
  echo "  B) Instala Python 3 sin Xcode con un solo comando en Terminal:"
  echo "       /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  echo "       brew install python"
  echo
  echo "Pulsa Enter para cerrar esta ventana."
  read
fi
