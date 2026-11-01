/**
 * Codigo.gs — arranque del sistema.
 *
 * El arranque NO tiene camino público. `setup()` se ejecuta desde el editor de Apps Script
 * (función `bootstrapManual`) o con la clave de arranque definida a mano en las propiedades.
 * Cualquier intento desde el portal responde PROHIBIDO (hallazgo 1.3 de la auditoría).
 */

function arranqueProtegido(clave, fn) {
  const esperada = prop('BOOTSTRAP_KEY');
  if (!esperada) {
    fallar_('PROHIBIDO', 'El arranque solo se ejecuta desde el editor de Apps Script.');
  }
  if (!clave || String(clave) !== String(esperada)) {
    fallar_('PROHIBIDO', 'Clave de arranque inválida.');
  }
  return fn();
}

/** Se ejecuta desde el editor de Apps Script para el primer arranque o una reinstalación. */
function bootstrapManual() {
  const r = setup();
  console.log(JSON.stringify(r, null, 2));
  return r;
}
