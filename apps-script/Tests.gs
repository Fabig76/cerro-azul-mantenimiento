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

/**
 * Alias con nombre que ordena primero en la lista del editor.
 * El desplegable de Apps Script ordena alfabéticamente y no filtra al escribir,
 * así que esta queda arriba de todo: es la que hay que elegir para probar.
 */
function abProbarTodo() {
  return runAllTests();
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
  pruebasRechazoYReenvio_();

  // Las fallas van primero: son lo único que hay que leer.
  RESULTADOS.detalle.sort(function (a, b) {
    const fa = a.indexOf('FALLA') === 0 ? 0 : 1;
    const fb = b.indexOf('FALLA') === 0 ? 0 : 1;
    return fa - fb;
  });
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

/**
 * Ciclo de rechazo y reenvío (falla 3): el contratista tiene que poder corregir.
 * Se ejecuta sobre una actividad temporal que se retira al final.
 */
function pruebasRechazoYReenvio_() {
  const nodo = filtrar('nodos', function (n) { return bool(n.activo) && String(n.clase) === 'ELEMENTO'; })[0]
    || filtrar('nodos', function (n) { return bool(n.activo); })[0];
  if (!nodo) { RESULTADOS.detalle.push('OMITE · rechazo y reenvío · sin nodos'); return; }

  const hoy = hoyIso();
  const act = insertar('actividades', {
    id: newId('ACT'), titulo: 'PRUEBA rechazo y reenvío', descripcion: '',
    nodo_id: nodo.id, plantilla_id: '', plantilla_version: '', empresa_id: '', responsable_id: '',
    tipo: 'UNICA', origen: 'PRUEBA', novedad_id: '', recurrencia_id: '',
    fecha_inicio_plan: hoy, fecha_fin_plan: sumarDias(hoy, 2), dias_plan: 3,
    prioridad: 'MEDIA', estado: 'RECHAZADA', vencida: false, en_riesgo: false,
    avance_reportado_pct: 100, avance_aprobado_pct: 0,
    fecha_inicio_real: hoy, fecha_reporte_final: hoy, fecha_aprobacion: '',
    obligatoria_legal: false, afecta_uso: false, publicable: false, acta_file_id: '',
    inicio_sin_foto_motivo: '', activo: true,
  }, 'prueba');

  const rechazo = insertar('reportes', {
    id: newId('REP'), actividad_id: act.id, hito_id: '', usuario_id: '',
    fecha: hoy + 'T08:00:00-05:00', tipo: 'FINAL', pct_declarado: 100,
    descripcion: 'Primer envío', horas: 1, estado_revision: 'RECHAZADO',
    comentario_admin: 'Falta la foto del detalle', revisado_por: 'prueba@urbcerroazul.com',
    revisado_en: hoy + 'T09:00:00-05:00', activo: true,
  }, 'prueba');

  // Reporte anterior: la foto vieja no debe contar para el reenvío
  insertar('evidencias', {
    id: newId('EVI'), reporte_id: rechazo.id, actividad_id: act.id, nodo_id: nodo.id,
    momento: 'DESPUES', drive_file_id: 'x', mini_file_id: 'x', mime: 'image/jpeg', bytes: 1,
    sha256: 'x', fecha_captura: '', fecha_subida: hoy + 'T08:00:00-05:00', lat: '', lng: '',
    contiene_personas: false, publicable: false, public_file_id: '', activo: true,
  }, 'prueba');

  const ctx = { usuario: { id: 'PRUEBA', email: 'prueba@urbcerroazul.com' }, rol: 'ADMIN' };
  let codigo = '';
  try {
    reportesCrear(ctx, { actividad_id: act.id, tipo: 'FINAL', descripcion: 'Reenvío', condicion_operativa: 'Operativo' });
  } catch (e) {
    codigo = String(e.message);
  }
  verdadero_(codigo.indexOf('VALIDACION') === 0, 'reenvío sin foto nueva se rechaza');

  // Limpieza
  filtrar('reportes', function (r) { return String(r.actividad_id) === String(act.id); })
    .forEach(function (r) { actualizar('reportes', r.id, { activo: false }, 'prueba'); });
  filtrar('evidencias', function (e) { return String(e.actividad_id) === String(act.id); })
    .forEach(function (e) { actualizar('evidencias', e.id, { activo: false }, 'prueba'); });
  actualizar('actividades', act.id, { activo: false }, 'prueba');
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
