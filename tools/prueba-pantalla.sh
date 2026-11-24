#!/bin/bash
# Abre el detalle de una actividad en cada estado y comprueba que se dibuje lo que debe.
# No necesita sesión: usa dobles de las dependencias.
set -e
cd "$(dirname "$0")/.."
# Antes de probar pantallas, el servidor debe estar sano: una función llamada y no definida
# tumba una acción entera (pasó con recortar_ y «Crear actividad»).
node tools/revisar-funciones.mjs > /dev/null || { echo "El servidor no pasa revisar-funciones.mjs:"; node tools/revisar-funciones.mjs; exit 1; }
node tools/revisar-columnas.mjs > /dev/null || { echo "El esquema no pasa revisar-columnas.mjs:"; node tools/revisar-columnas.mjs; exit 1; }

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "No se encontró Chrome"; exit 1; }

correr() {
  # $2 = milisegundos de reloj virtual (por defecto 8000). Las pruebas con esperas
  # largas necesitan más; si no, el título queda en «cargando» y la prueba se pierde.
  "$CHROME" --headless=new --disable-gpu --virtual-time-budget=${2:-8000} \
    --dump-dom "file://$(pwd)/tools/pantalla/$1" 2>/dev/null \
    | grep -o "<title>[^<]*</title>" | sed 's/<[^>]*>//g' | tr '|' '\n' || true
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
$(correr consejo.html)
$(correr consejo-inicio.html)
$(correr reporte-publico.html)
$(correr residentes-panel.html)
$(correr propuestas-v17.html)
$(correr lento.html 24000)
$(correr novedad-reparacion.html)
$(correr sistema-estado.html 24000)
$(correr ficha-vence.html)
$(correr plan-ultima.html)
$(correr volver-lista.html)
$(correr editor-checklist.html)
$(correr solo-lectura.html)
$(correr quitar-foto.html)
$(correr empresa-eliminar.html)
$(correr usuarios-seleccion.html)
$(correr resumen-v111.html 12000)
$(correr ultimo-resultado.html)
$(correr contratista-completo.html)"

echo "$SALIDA"
echo "$SALIDA" | grep -q FALLA && exit 1
exit 0
