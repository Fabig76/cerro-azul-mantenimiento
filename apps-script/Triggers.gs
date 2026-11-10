/**
 * Triggers.gs — tareas programadas (SPEC v1.2, sec. 2.1 y 13).
 * El snapshot se regenera cada hora y la salud se recalcula de madrugada.
 */

function instalarDisparadores() {
  const existentes = ScriptApp.getProjectTriggers();
  existentes.forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'regenerarSnapshot' || fn === 'recalcularTodoDiario') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('regenerarSnapshot').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('recalcularTodoDiario').timeBased().atHour(3).everyDays(1).create();

  return {
    disparadores: ScriptApp.getProjectTriggers().map(function (t) {
      return t.getHandlerFunction();
    }),
  };
}

/** Envuelve el recálculo para el disparador diario. */
function recalcularTodoDiario() {
  recalcularTodo('disparador');

  // Purga de fotos de propuestas viejas: si falla, el resto del disparador sigue.
  try {
    const purga = purgarPropuestas_();
    if (purga && purga.purgadas) console.log('Propuestas purgadas: ' + purga.purgadas);
  } catch (e) {
    console.error('purga de propuestas: ' + e.message);
  }
  regenerarSnapshot();
}
