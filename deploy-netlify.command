#!/usr/bin/env bash
# ============================================================================
# Deploy a Netlify (drag-and-drop)
# ----------------------------------------------------------------------------
# Doble-click este archivo en Finder y:
#   1. Abre Netlify Drop en el navegador
#   2. Abre una ventana de Finder mostrando la carpeta `app/` ya seleccionada
#   3. Tú arrastras la carpeta `app/` al recuadro de Netlify Drop
#
# La carpeta `app/` es 100% self-contained (manifest, sw.js, icon.svg,
# styles/, js/, index.html). Netlify la sirve en raíz del nuevo site →
# la app vive en https://<random-name>.netlify.app/ directamente.
#
# Si ya tienes un site de Netlify (eloquent-swan-d412d4 u otro) y quieres
# REUTILIZAR la misma URL, ve a Netlify dashboard → site → Deploys →
# arrastra la carpeta al recuadro al final de la página.
# ============================================================================

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$DIR/app"

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: no existe $APP_DIR"
  exit 1
fi

echo "→ Abriendo Netlify Drop en el navegador…"
open "https://app.netlify.com/drop"

echo "→ Abriendo Finder en la carpeta de la app…"
sleep 0.6
open "$APP_DIR"

echo ""
echo "Arrastra la CARPETA 'app' completa al recuadro grande de Netlify Drop."
echo "(NO los ficheros sueltos — la carpeta entera.)"
echo ""
