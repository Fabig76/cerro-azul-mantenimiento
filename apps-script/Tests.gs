/**
 * Tests.gs — pruebas de las funciones puras y de la superficie pública.
 * Se ejecutan desde el editor de Apps Script: función `runAllTests`.
 * No tocan el libro de producción.
 */

const RESULTADOS = { pasadas: 0, fallidas: 0, detalle: [] };

function igual_(esperado, obtenido, nombre) {
  const ok = JSON.stringify(esperado) === JSON.stringify(obtenido);
  RESULTADOS.detalle.push((ok ? 'OK   ' : 'FALLA') + ' · ' + nombre +
    (ok ? '' : ' · esperado ' + JSON.stringify(esperado) + ' · obtenido ' + JSON.stringify(obtenido)));
  if (ok) RESULTADOS.pasadas++; else RESULTADOS.fallidas++;
}

function verdadero_(valor, nombre) {
  igual_(true, !!valor, nombre);
}

function lanza_(codigo, fn, nombre) {
  try {
    fn();
    RESULTADOS.detalle.push('FALLA · ' + nombre + ' · no lanzó ' + codigo);
    RESULTADOS.fallidas++;
  } catch (e) {
    const texto = String(e && e.message ? e.message : e);
    const ok = texto.indexOf(codigo + ':') === 0;
    RESULTADOS.detalle.push((ok ? 'OK   ' : 'FALLA') + ' · ' + nombre + (ok ? '' : ' · ' + texto));
    if (ok) RESULTADOS.pasadas++; else RESULTADOS.fallidas++;
  }
}

/** Punto de entrada. */
function runAllTests() {
  RESULTADOS.pasadas = 0;
  RESULTADOS.fallidas = 0;
  RESULTADOS.detalle = [];

  pruebasFechas_();
  pruebasSalud_();
  pruebasChecklist_();
  pruebasRitmo_();
  pruebasSuperficiePublica_();

  console.log('PASADAS: ' + RESULTADOS.pasadas + ' · FALLIDAS: ' + RESULTADOS.fallidas);
  console.log(RESULTADOS.detalle.join('\n'));
  return RESULTADOS;
}

function pruebasFechas_() {
  igual_('2026-11-02', sumarDias('2026-10-31', 2), 'sumarDias cruza el mes');
  igual_('2027-01-05', sumarDias('2026-12-31', 5), 'sumarDias cruza el año');
  igual_(7, diasEntre('2026-10-01', '2026-10-08'), 'diasEntre en días completos');
  igual_(0, diasEntre('2026-10-08', '2026-10-08'), 'diasEntre el mismo día');
}

function pruebasSalud_() {
  igual_(100, cumplimientoPlan(0, 30), 'plan al día');
  igual_(100, cumplimientoPlan(30, 30), 'plan justo en el intervalo');
  igual_(50, cumplimientoPlan(45, 30), 'plan con 15 días de retraso sobre 30');
  igual_(0, cumplimientoPlan(90, 30), 'plan con el triple del intervalo');

  igual_(100, puntajeSalud(100, 100, 100, null), 'puntaje con las tres señales');
  igual_(100, puntajeSalud(null, 100, null, null), 'puntaje con una sola señal (reparte el peso)');
  igual_(null, puntajeSalud(null, null, null, null), 'sin señales no hay puntaje');
  igual_(76, puntajeSalud(100, 60, 40, null), 'puntaje ponderado 0,5/0,3/0,2');

  igual_('CRITICO', semaforo({ condicionFalla: true }), 'falla es crítico');
  igual_('CRITICO', semaforo({ novedadGrave: true }), 'novedad grave es crítico');
  igual_('CRITICO', semaforo({ legalVencido: true }), 'obligación legal vencida es crítico');
  igual_('ATENCION', semaforo({ novedadMedia: true, algunaSenal: true }), 'novedad media es atención');
  igual_('AL_DIA', semaforo({ algunaSenal: true }), 'con señal y nada grave está al día');
  igual_('SIN_DATOS', semaforo({}), 'sin señales queda sin datos');
}

function pruebasChecklist_() {
  const siNo = { tipo_respuesta: 'SI_NO' };
  igual_(true, evaluarItem_(siNo, 'SI'), 'SI_NO con Sí cumple');
  igual_(false, evaluarItem_(siNo, 'no'), 'SI_NO con No no cumple');
  igual_(null, evaluarItem_(siNo, ''), 'SI_NO sin respuesta no evalúa');

  const rango = { tipo_respuesta: 'NUMERO', valor_min: 7.2, valor_max: 7.8 };
  igual_(true, evaluarItem_(rango, '7.5'), 'número dentro del rango');
  igual_(false, evaluarItem_(rango, '6.9'), 'número bajo el rango');
  igual_(false, evaluarItem_(rango, '8.1'), 'número sobre el rango');
  igual_(true, evaluarItem_(rango, '7,5'), 'acepta coma decimal');

  const sinRango = { tipo_respuesta: 'NUMERO', valor_min: '', valor_max: '' };
  igual_(null, evaluarItem_(sinRango, '42'), 'sin rango no penaliza (RN-17)');
  igual_(null, evaluarItem_({ tipo_respuesta: 'TEXTO' }, 'lo que sea'), 'texto no evalúa');
}

function pruebasRitmo_() {
  const base = {
    fecha_inicio_plan: sumarDias(hoyIso(), -3),
    fecha_fin_plan: sumarDias(hoyIso(), 7),
    dias_plan: 10,
    avance_aprobado_pct: 10,
    estado: 'EN_EJECUCION',
  };
  const r = calcularRitmo_(base);
  verdadero_(r.dias_plan === 10, 'ritmo: días del plan');
  verdadero_(r.esperado >= 30 && r.esperado <= 50, 'ritmo: esperado entre 30 y 50 %');
  verdadero_(r.en_riesgo, 'ritmo: va con retraso');

  const alDia = Object.assign({}, base, { avance_aprobado_pct: 40 });
  verdadero_(!calcularRitmo_(alDia).en_riesgo, 'ritmo: al día no marca riesgo');

  const cerrada = Object.assign({}, base, { estado: 'CERRADA' });
  verdadero_(!calcularRitmo_(cerrada).en_riesgo, 'ritmo: cerrada nunca queda en riesgo');
}

function pruebasSuperficiePublica_() {
  // Las acciones de arranque y diagnóstico ya no se atienden por GET anónimo.
  const retiradas = ['setup.run', 'demo.crear', 'empresa.inicial', 'empresa.datos', 'usuario.inicial',
    'diag.asignacion', 'salud.recalcular', 'snapshot.refrescar', 'disparadores.instalar',
    'ajustes.aplicar', 'snapshot.ver'];
  retiradas.forEach(function (accion) {
    const json = doGet({ parameter: { action: accion } }).getContent();
    const r = JSON.parse(json);
    igual_('NO_ENCONTRADO', r.code, 'GET ' + accion + ' rechazada');
  });

  // Una acción privada tampoco se atiende por GET.
  const privada = JSON.parse(doGet({ parameter: { action: 'nodos.arbol' } }).getContent());
  igual_('NO_ENCONTRADO', privada.code, 'GET nodos.arbol rechazada');

  // El arranque está cerrado: con libro creado y sin clave, siempre PROHIBIDO.
  lanza_('PROHIBIDO', function () { arranqueProtegido('', function () { return 'no debería'; }); },
    'arranque protegido con el sistema ya inicializado');

  // El público sí responde.
  const snap = doGet({ parameter: { action: 'public.snapshot' } }).getContent();
  verdadero_(snap.indexOf('generado_en') > 0, 'public.snapshot responde');
}
