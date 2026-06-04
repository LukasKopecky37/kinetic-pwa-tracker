#!/usr/bin/env bash
# ============================================================================
# Deploy a Netlify · doble-click desde Finder
# ----------------------------------------------------------------------------
# Cada vez que ejecutas este script:
#   1. SINCRONIZA la carpeta `app/` del proyecto → `~/Desktop/Kinetic-App-Netlify/`
#      → garantiza que la carpeta de Escritorio SIEMPRE refleja el último estado
#        del código, sin que tengas que pensar qué versión es.
#   2. Abre Netlify Drop en el navegador.
#   3. Abre Finder mostrando la carpeta de Escritorio ya lista.
#   4. Tú arrastras la CARPETA ENTERA "Kinetic-App-Netlify" al recuadro de
#      Netlify Drop (o al área "Need to update your site?" de tu site existente
#      si quieres conservar la misma URL).
#
# La carpeta `app/` interna es 100% self-contained (manifest, sw.js, icon,
# styles/, js/, index.html). Netlify la sirve en la raíz del site →
# https://<tu-site>.netlify.app/ es la app directamente.
# ============================================================================

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/app"
DEST="$HOME/Desktop/Kinetic-App-Netlify"

if [ ! -d "$SRC" ]; then
  echo "ERROR: no existe $SRC"
  echo "Asegúrate de que este script vive en la carpeta GYM al lado de app/"
  exit 1
fi

echo "→ Sincronizando carpeta de Escritorio con el código actual…"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
# Elimina basura de macOS que Netlify no necesita
find "$DEST" -name ".DS_Store" -delete 2>/dev/null || true

# Versión actual cacheada — útil como confirmación visual
VER=$(grep "^const CACHE_VERSION" "$DEST/sw.js" 2>/dev/null | sed -e "s/.*'\(.*\)'.*/\1/")
echo "✓ Sincronizado · versión: $VER"
echo ""

echo "→ Abriendo Netlify Drop en el navegador…"
open "https://app.netlify.com/drop"

echo "→ Abriendo Finder en la carpeta lista para arrastrar…"
sleep 0.5
open "$DEST"

echo ""
echo "============================================================"
echo "  Arrastra la CARPETA 'Kinetic-App-Netlify' completa"
echo "  al recuadro grande de Netlify Drop."
echo ""
echo "  Si quieres mantener tu URL actual (eloquent-swan-…):"
echo "    1) Login en https://app.netlify.com"
echo "    2) Site → pestaña 'Deploys' → baja al final"
echo "    3) Arrastra ahí 'Kinetic-App-Netlify' en vez de en Drop"
echo "============================================================"
