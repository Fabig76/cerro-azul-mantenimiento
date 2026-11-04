#!/bin/bash
# Abre el detalle de una actividad en cada estado y comprueba que se dibuje lo que debe.
# No necesita sesión: usa dobles de las dependencias.
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "No se encontró Chrome"; exit 1; }

SALIDA=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=6000 \
  --dump-dom "file://$(pwd)/tools/pantalla/prueba.html" 2>/dev/null \
  | grep -o "<title>[^<]*</title>" | sed 's/<[^>]*>//g' | tr '|' '\n')

echo "$SALIDA"
echo "$SALIDA" | grep -q FALLA && exit 1
exit 0
