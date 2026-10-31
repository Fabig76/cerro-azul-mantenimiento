/**
 * Codigo.gs — arranque controlado del sistema.
 *
 * El Router vive en Router.gs. Aquí solo queda la puerta de arranque: permite ejecutar
 * setup() mientras el libro no exista o durante las primeras verificaciones, y se cierra sola.
 */

function arranqueProtegido(clave, fn) {
  const esperada = prop('BOOTSTRAP_KEY');
  const sinInicializar = !prop('SHEET_ID');
  if (esperada) {
    if (!clave || String(clave) !== String(esperada)) fallar_('PROHIBIDO', 'Clave de arranque inválida.');
  } else if (!sinInicializar) {
    const corridas = Number(prop('SETUP_RUNS') || 0);
    if (corridas >= 3) fallar_('PROHIBIDO', 'El arranque ya está cerrado. El sistema está operando.');
    prop('SETUP_RUNS', corridas + 1);
  }
  return fn();
}

/** Se ejecuta desde el editor de Apps Script para el primer arranque. */
function bootstrapManual() {
  const r = setup();
  console.log(JSON.stringify(r, null, 2));
  return r;
}
