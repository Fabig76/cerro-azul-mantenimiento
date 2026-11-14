#!/bin/bash
# Abre el detalle de una actividad en cada estado y comprueba que se dibuje lo que debe.
# No necesita sesión: usa dobles de las dependencias.
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "No se encontró Chrome"; exit 1; }

correr() {
  "$CHROME" --headless=new --disable-gpu --virtual-time-budget=8000 \
    --dump-dom "file://$(pwd)/tools/pantalla/$1" 2>/dev/null \
    | grep -o "<title>[^<]*</title>" | sed 's/<[^>]*>//g' | tr '|' '\n'
}

SALIDA="$(correr prueba.html)
$(correr propuestas.html)
$(correr etapas.html)
$(correr editar.html)
$(correr lista.html)
$(correr borrador.html)
$(correr abrir.html)
$(correr lista-contratista.html)
$(correr novedades-mias.html)
$(correr tarjetas-vacias.html)
$(correr fichas-empresa.html)
$(correr usuarios-empresa.html)
$(correr cotizacion.html)
$(correr consejo.html)"

echo "$SALIDA"
echo "$SALIDA" | grep -q FALLA && exit 1
exit 0
