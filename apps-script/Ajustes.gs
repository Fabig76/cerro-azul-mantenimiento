/**
 * Ajustes.gs — cambios de configuración aplicados una sola vez.
 * Cada uno deja su marca para no repetirse.
 */

function aplicarAjustes() {
  const hechos = [];

  if (prop('AJUSTE_AVISO_1DIA') !== 'si') {
    configEscribir('dias_aviso_programado', '1', 'Días de anticipación de la actividad respecto a su fecha');
    prop('AJUSTE_AVISO_1DIA', 'si');
    hechos.push('dias_aviso_programado = 1');
  }

  limpiarCache('config');
  return { aplicados: hechos, aviso_programado: config('dias_aviso_programado') };
}
