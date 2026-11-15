/**
 * Triggers.gs — tareas programadas (SPEC v1.2, sec. 2.1 y 13).
 * El snapshot se regenera cada hora y la salud se recalcula de madrugada.
 */

const DISPARADORES = [
  'regenerarSnapshot',
  'recalcularTodoDiario',
  'despacharCorreos',
  'avisosDiariosDisparador',
];

/**
 * Deja exactamente los disparadores de la lista, sin duplicar.
 * Se puede ejecutar cuantas veces haga falta.
 */
function instalarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (DISPARADORES.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('regenerarSnapshot').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('recalcularTodoDiario').timeBased().atHour(3).everyDays(1).create();
  // La cola de correos se vacía aunque nadie entre al portal.
  ScriptApp.newTrigger('despacharCorreos').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('avisosDiariosDisparador').timeBased().atHour(6).everyDays(1).create();

  return {
    disparadores: ScriptApp.getProjectTriggers().map(function (t) {
      return t.getHandlerFunction();
    }),
  };
}

/** Disparador diario de los avisos. */
function avisosDiariosDisparador() {
  // Primero se genera lo que ya toca por el plan (RN-06); así el aviso de «hoy empieza»
  // sale con los trabajos de hoy y el mantenimiento obligatorio no depende de un botón.
  try {
    const g = generarActividadesPendientes('disparador');
    console.log('plan: ' + JSON.stringify(g));
  } catch (e) {
    console.error('plan: ' + e.message);
  }
  try {
    const r = avisosDiarios_();
    console.log('avisos diarios: ' + JSON.stringify(r));
  } catch (e) {
    console.error('avisos diarios: ' + e.message);
  }
}

/** Envuelve el recálculo para el disparador diario. */
function recalcularTodoDiario() {
  const t0 = Date.now();
  cachePut('recalculo:ultimo', 'empezó ' + ahoraIso());
  try {
    recalcularTodo('disparador');
    cachePut('recalculo:ultimo', 'terminó ' + ahoraIso() +
      ' en ' + Math.round((Date.now() - t0) / 1000) + ' s');
  } catch (e) {
    cachePut('recalculo:ultimo', 'se cortó ' + ahoraIso() + ': ' + String(e && e.message));
    throw e;
  }

  // Purga de fotos de propuestas viejas: si falla, el resto del disparador sigue.
  try {
    const purga = purgarPropuestas_();
    purgarReportesResidentes_();
    if (purga && purga.purgadas) console.log('Propuestas purgadas: ' + purga.purgadas);
  } catch (e) {
    console.error('purga de propuestas: ' + e.message);
  }
  regenerarSnapshot();
}
