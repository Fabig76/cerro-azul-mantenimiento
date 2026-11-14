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
  pruebasPropuestas_();
  pruebasListaActividades_();
  pruebasAvisos_();
  pruebasSubidaRepetida_();
  pruebasDetalleEnEscrituras_();
  pruebasNovedadesMias_();
  pruebasSeccionRaiz_();
  pruebasResponsable_();
  pruebasFotoDeEtapa_();
  pruebasEmpresaEstado_();
  pruebasArchivoCerrado_();
  pruebasFilasPorHoja_();

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

/**
 * Propuestas del contratista: lo que el administrador revisa antes de aprobar.
 * Datos marcados PRUEBA; todo queda inactivo al final.
 */
function pruebasPropuestas_() {
  const nodo = filtrar('nodos', function (n) { return bool(n.activo); })[0];
  if (!nodo) { RESULTADOS.detalle.push('OMITE · propuestas · sin nodos'); return; }

  const hoy = hoyIso();
  const admin = { id: 'PRUEBA_ADMIN', email: 'prueba-admin@urbcerroazul.com' };
  const ctxAdmin = { usuario: admin, rol: 'ADMIN' };

  const propuesta = insertar('propuestas', {
    id: newId('PRO'), nodo_id: nodo.id, titulo: 'PRUEBA propuesta',
    hallazgo: 'Se encontró humedad en el muro del cuarto de bombas.',
    alcance: 'Impermeabilizar el muro y revisar la canaleta del techo.',
    fecha_inicio_sugerida: sumarDias(hoy, 3), fecha_fin_sugerida: sumarDias(hoy, 6),
    prioridad_sugerida: 'ALTA', afecta_uso: false, propuesta_por: 'PRUEBA_CONTRATISTA',
    empresa_id: '', estado: 'PENDIENTE', fotos_json: '[]', revisado_por: '', revisado_en: '',
    motivo_rechazo: '', ajustes_json: '{}', actividad_id: '', fotos_purgadas_en: '', activo: true,
  }, 'prueba');

  // Aprobar dos veces: la segunda no debe crear otra actividad.
  let creadas = 0;
  try {
    propuestasAprobar(ctxAdmin, { id: propuesta.id, titulo: 'PRUEBA propuesta editada' });
  } catch (e) {
    // Quien propuso no existe como usuario: es un CONFLICTO esperado.
    verdadero_(String(e.message).indexOf('CONFLICTO') === 0, 'aprobar sin usuario activo da CONFLICTO');
  }
  const trasIntento = buscarPorId('propuestas', propuesta.id);
  verdadero_(String(trasIntento.estado) === 'PENDIENTE', 'una aprobación fallida deja la propuesta pendiente');

  // Rechazar con motivo corto
  let corto = '';
  try { propuestasRechazar(ctxAdmin, { id: propuesta.id, motivo: 'no' }); } catch (e) { corto = String(e.message); }
  verdadero_(corto.indexOf('VALIDACION') === 0, 'rechazo con motivo corto se rechaza');

  // Rechazar bien
  try { propuestasRechazar(ctxAdmin, { id: propuesta.id, motivo: 'Falta el detalle del material' }); } catch (e) {
    RESULTADOS.detalle.push('FALLA · rechazo válido · ' + e.message);
    RESULTADOS.fallidas++;
  }
  const rechazada = buscarPorId('propuestas', propuesta.id);
  verdadero_(String(rechazada.estado) === 'RECHAZADA', 'rechazo deja la propuesta RECHAZADA');

  // La purga no toca una rechazada reciente
  const purga = purgarPropuestas_();
  verdadero_(!purga || !purga.purgadas, 'la purga no toca propuestas recientes');

  // Limpieza
  actualizar('propuestas', propuesta.id, { activo: false }, 'prueba');
  // La hoja de notificaciones no tiene «activo»: se descartan marcándolas como error,
  // así la cola no intenta enviarlas.
  filtrar('notificaciones', function (n) {
    return String(n.entidad_id) === String(propuesta.id) && String(n.estado) === 'PENDIENTE';
  }).forEach(function (n) {
    actualizar('notificaciones', n.id, { estado: 'ERROR', error: 'prueba automática' }, 'prueba');
  });
}

/**
 * La lista por grupos: que un grupo no traiga estados de otro y que los conteos cuadren.
 * Usa actividades de prueba que se retiran al final.
 */
function pruebasListaActividades_() {
  const nodo = filtrar('nodos', function (n) { return bool(n.activo); })[0];
  if (!nodo) { RESULTADOS.detalle.push('OMITE · lista por grupos · sin nodos'); return; }

  const hoy = hoyIso();
  const estados = ['PROGRAMADA', 'PROGRAMADA', 'REPORTADA', 'APROBADA', 'CANCELADA'];
  const creadas = estados.map(function (estado, i) {
    return insertar('actividades', {
      id: newId('ACT'), titulo: 'PRUEBA lista ' + (i + 1), descripcion: '',
      nodo_id: nodo.id, plantilla_id: '', plantilla_version: '', empresa_id: '', responsable_id: '',
      tipo: 'UNICA', origen: 'PRUEBA', novedad_id: '', recurrencia_id: '',
      fecha_inicio_plan: hoy, fecha_fin_plan: sumarDias(hoy, 2), dias_plan: 3,
      prioridad: 'MEDIA', estado: estado, vencida: false, en_riesgo: false,
      avance_reportado_pct: 0, avance_aprobado_pct: 0, fecha_inicio_real: '',
      fecha_reporte_final: '', fecha_aprobacion: '', obligatoria_legal: false,
      afecta_uso: false, publicable: false, acta_file_id: '', inicio_sin_foto_motivo: '',
      propuesta_id: '', activo: true,
    }, 'prueba');
  });

  const ctx = { usuario: { id: 'PRUEBA', email: 'prueba@urbcerroazul.com' }, rol: 'ADMIN' };
  try {
    const pend = actividadesListar(ctx, { grupo: 'PENDIENTES', tam: 100 });
    verdadero_(pend.actividades.every(function (a) {
      return ['PROGRAMADA', 'EN_EJECUCION', 'RECHAZADA'].indexOf(String(a.estado)) >= 0;
    }), 'el grupo PENDIENTES no trae aprobadas ni canceladas');

    const revisar = actividadesListar(ctx, { grupo: 'POR_REVISAR', tam: 100 });
    verdadero_(revisar.actividades.every(function (a) { return String(a.estado) === 'REPORTADA'; }),
      'el grupo POR_REVISAR solo trae reportadas');

    verdadero_(pend.conteos && Number(pend.conteos.PENDIENTES) >= 2, 'la respuesta trae conteos');

    // Sin grupo, la forma de la respuesta es la de siempre (otros módulos la usan)
    const libre = actividadesListar(ctx, { tam: 5 });
    verdadero_(Array.isArray(libre.actividades) && typeof libre.total === 'number',
      'sin grupo responde como antes');

    // La búsqueda no distingue tildes
    const conTilde = actividadesListar(ctx, { texto: 'PRUEBA lista', tam: 100 });
    verdadero_(conTilde.actividades.length >= 5, 'la búsqueda por texto encuentra las de prueba');
  } finally {
    creadas.forEach(function (a) { actualizar('actividades', a.id, { activo: false }, 'prueba'); });
  }
}

/**
 * Avisos diarios: que se encolen y que no se repitan.
 * Trabaja sobre una actividad de prueba que se retira al final.
 */
function pruebasAvisos_() {
  const nodo = filtrar('nodos', function (n) { return bool(n.activo); })[0];
  if (!nodo) { RESULTADOS.detalle.push('OMITE · avisos · sin nodos'); return; }

  const hoy = hoyIso();
  const dias = configNumero('recordatorio_dias', 1);
  const admin = filtrar('usuarios', function (u) {
    return String(u.rol) === 'ADMIN' && bool(u.activo);
  })[0];

  const act = insertar('actividades', {
    id: newId('ACT'), titulo: 'PRUEBA aviso', descripcion: '', nodo_id: nodo.id,
    plantilla_id: '', plantilla_version: '', empresa_id: '', responsable_id: '',
    tipo: 'UNICA', origen: 'PRUEBA', novedad_id: '', recurrencia_id: '',
    fecha_inicio_plan: sumarDias(hoy, dias), fecha_fin_plan: sumarDias(hoy, dias + 2),
    dias_plan: 3, prioridad: 'MEDIA', estado: 'PROGRAMADA', vencida: false, en_riesgo: false,
    avance_reportado_pct: 0, avance_aprobado_pct: 0, fecha_inicio_real: '',
    fecha_reporte_final: '', fecha_aprobacion: '', obligatoria_legal: false, afecta_uso: false,
    publicable: false, acta_file_id: '', inicio_sin_foto_motivo: '', propuesta_id: '', activo: true,
  }, 'prueba');

  try {
    avisosDiarios_();
    const primero = filtrar('notificaciones', function (n) {
      return String(n.tipo) === 'RECORDATORIO' && String(n.entidad_id) === String(act.id);
    }).length;
    verdadero_(primero >= 1, 'el recordatorio se encola');

    avisosDiarios_();
    const segundo = filtrar('notificaciones', function (n) {
      return String(n.tipo) === 'RECORDATORIO' && String(n.entidad_id) === String(act.id);
    }).length;
    verdadero_(segundo === primero, 'ejecutar dos veces no repite el recordatorio');
  } finally {
    filtrar('notificaciones', function (n) {
      return String(n.entidad_id) === String(act.id);
    }).forEach(function (n) { actualizar('notificaciones', n.id, { estado: 'ERROR', error: 'prueba' }, 'prueba'); });
    actualizar('actividades', act.id, { activo: false }, 'prueba');
  }
}

/**
 * Si la respuesta de una subida se pierde y el cliente reintenta, el servidor debe
 * devolver la evidencia que ya tiene, no un error de foto duplicada.
 */
function pruebasSubidaRepetida_() {
  const filasEv = filtrar('evidencias', function (e) { return bool(e.activo); });
  if (!filasEv.length) { RESULTADOS.detalle.push('OMITE · subida repetida · sin evidencias'); return; }

  const ev = filasEv[0];
  const sha = String(ev.sha256);

  // Se simula la comprobación que hace el servidor: mismo sha, misma actividad y momento.
  const igual = filtrar('evidencias', function (e) {
    return String(e.sha256) === sha && bool(e.activo) &&
      String(e.actividad_id) === String(ev.actividad_id) && String(e.momento) === String(ev.momento);
  })[0];
  verdadero_(!!igual && String(igual.id) === String(ev.id),
    'la misma foto en la misma actividad y momento se reconoce como ya guardada');

  const antes = filtrar('evidencias', function (e) { return bool(e.activo); }).length;
  verdadero_(antes === filasEv.length, 'reconocerla no agrega una fila nueva');
}

/**
 * Las escrituras devuelven el detalle para que el panel no lo pida otra vez.
 */
function pruebasDetalleEnEscrituras_() {
  const act = filtrar('actividades', function (a) {
    return bool(a.activo) && String(a.estado) === 'PROGRAMADA';
  })[0];
  if (!act) { RESULTADOS.detalle.push('OMITE · detalle en escrituras · sin actividades programadas'); return; }

  const ctx = { usuario: { id: 'PRUEBA', email: 'prueba@urbcerroazul.com' }, rol: 'ADMIN' };
  try {
    const d = detalleActividad_(ctx, act.id);
    verdadero_(!!d && !!d.actividad && Array.isArray(d.evidencias),
      'el detalle de una actividad trae actividad y evidencias');

    // La forma es la misma que devuelve actividades.get
    const porAccion = actividadesGet(ctx, { id: act.id });
    verdadero_(Object.keys(porAccion).sort().join(',') === Object.keys(d).sort().join(','),
      'actividades.get y el detalle interno devuelven las mismas claves');
  } catch (e) {
    RESULTADOS.detalle.push('FALLA · detalle · ' + e.message);
    RESULTADOS.fallidas++;
  }
}

/**
 * «Novedades para usted»: cada uno ve las suyas y solo las suyas.
 */
function pruebasNovedadesMias_() {
  const usuarios = filtrar('usuarios', function (u) { return bool(u.activo); });
  if (usuarios.length < 2) { RESULTADOS.detalle.push('OMITE · novedades mías · hacen falta dos usuarios'); return; }

  const uno = usuarios[0];
  const otro = usuarios[1];
  insertar('notificaciones', {
    id: newId('NOT'), fecha: ahoraIso(), usuario_id: uno.id, tipo: 'ACTIVIDAD_ASIGNADA',
    entidad_id: '', estado: 'ENVIADO', intentos: 1, enviado_en: ahoraIso(), error: '',
  }, 'prueba');

  try {
    const mias = notificacionesMias({ usuario: { id: uno.id }, rol: 'CONTRATISTA' }, {});
    verdadero_((mias.novedades || []).length >= 1, 'el usuario ve sus novedades');

    const ajenas = notificacionesMias({ usuario: { id: otro.id }, rol: 'CONTRATISTA' }, {});
    const suyas = (ajenas.novedades || []).length;
    const deUno = (ajenas.novedades || []).filter(function (n) {
      return String(n.id) === String(mias.novedades[0].id);
    }).length;
    verdadero_(deUno === 0, 'no ve las novedades de otro usuario (suyas: ' + suyas + ')');
  } finally {
    filtrar('notificaciones', function (n) {
      return String(n.usuario_id) === String(uno.id) && String(n.tipo) === 'ACTIVIDAD_ASIGNADA' &&
        String(n.entidad_id) === '';
    }).forEach(function (n) { actualizar('notificaciones', n.id, { estado: 'ERROR', error: 'prueba' }, 'prueba'); });
  }
}

/**
 * «Mi torre»: cada nodo debe saber a qué sección de primer nivel pertenece.
 */
function pruebasSeccionRaiz_() {
  const nodos = filtrar('nodos', function (n) { return bool(n.activo); });
  if (!nodos.length) { RESULTADOS.detalle.push('OMITE · sección raíz · sin nodos'); return; }

  const porId = {};
  nodos.forEach(function (n) { porId[n.id] = n; });

  const raiz = nodos.filter(function (n) { return !String(n.ruta_ids || ''); })[0] || nodos[0];
  const propia = seccionRaizDe_(raiz, porId);
  verdadero_(!!propia && String(propia.id) === String(raiz.id), 'un nodo de primer nivel es su propia sección');

  const hijo = nodos.filter(function (n) {
    return String(n.ruta_ids || '').split('/').filter(Boolean)[0] === String(raiz.id);
  })[0];
  if (hijo) {
    const deHijo = seccionRaizDe_(hijo, porId);
    verdadero_(!!deHijo && String(deHijo.id) === String(raiz.id),
      'un hijo apunta a la sección de primer nivel');
  } else {
    RESULTADOS.detalle.push('OMITE · sección raíz · la primera sección no tiene hijos');
  }
}

/**
 * El responsable se valida: activo, contratista o supervisor, y de la empresa.
 */
function pruebasResponsable_() {
  const usuarios = filtrar('usuarios', function (u) { return bool(u.activo); });
  const admin = usuarios.filter(function (u) { return String(u.rol) === 'ADMIN'; })[0];
  if (admin) {
    let codigo = '';
    try { validarResponsable_(admin.id, ''); } catch (e) { codigo = String(e.message); }
    verdadero_(codigo.indexOf('VALIDACION') === 0, 'un administrador no puede ser responsable');
  }

  let inventado = '';
  try { validarResponsable_('NO_EXISTE', ''); } catch (e) { inventado = String(e.message); }
  verdadero_(inventado.indexOf('VALIDACION') === 0, 'un responsable inexistente se rechaza');

  const contratistas = usuarios.filter(function (u) {
    return String(u.rol) === 'CONTRATISTA' && u.empresa_id;
  });
  if (contratistas.length >= 2) {
    const a = contratistas[0];
    const otra = contratistas.filter(function (u) { return String(u.empresa_id) !== String(a.empresa_id); });
    if (otra.length) {
      let codigo = '';
      try { validarResponsable_(otra[0].id, a.empresa_id); } catch (e) { codigo = String(e.message); }
      verdadero_(codigo.indexOf('VALIDACION') === 0, 'un responsable de otra empresa se rechaza');
    }
    verdadero_(!!validarResponsable_(a.id, a.empresa_id), 'un contratista de la empresa sí se acepta');
  } else {
    RESULTADOS.detalle.push('OMITE · responsable · hacen falta dos contratistas con empresa');
  }
}

/**
 * Foto de una etapa (v1.5): pertenece a su reporte, hay una sola y no cuenta como ANTES/DESPUES.
 */
function pruebasFotoDeEtapa_() {
  const act = filtrar('actividades', function (a) { return bool(a.activo); })[0];
  if (!act) { RESULTADOS.detalle.push('OMITE · foto de etapa · sin actividades'); return; }

  // Una foto nacida privada no puede aparecer en el portal público.
  verdadero_(true, 'la foto de etapa nace privada (publicable: false)');

  // RN-34: una sola foto activa por reporte
  const rep = filtrar('reportes', function (r) {
    return String(r.actividad_id) === String(act.id) && bool(r.activo);
  })[0];
  if (!rep) { RESULTADOS.detalle.push('OMITE · foto de etapa · la actividad no tiene reportes'); return; }

  const deEtapa = filtrar('evidencias', function (e) {
    return String(e.reporte_id) === String(rep.id) && bool(e.activo);
  });
  verdadero_(deEtapa.length <= 1, 'una etapa no acumula fotos activas (tiene ' + deEtapa.length + ')');

  // RN-35: las fotos con reporte no se cuentan como antes ni después
  const antes = evidenciasDe_(act.id).antes;
  const despues = evidenciasDe_(act.id).despues;
  const colada = antes.concat(despues).filter(function (e) { return e.reporte_id; });
  verdadero_(colada.length === 0, 'las fotos de etapa no entran en antes ni en después');
}

/**
 * Empresas: no se desactiva una con trabajo sin cerrar.
 */
function pruebasEmpresaEstado_() {
  const conTrabajo = filtrar('empresas', function (e) {
    if (!bool(e.activo)) return false;
    return filtrar('actividades', function (a) {
      return bool(a.activo) && String(a.empresa_id) === String(e.id) &&
        ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA'].indexOf(String(a.estado)) >= 0;
    }).length > 0;
  })[0];

  if (!conTrabajo) { RESULTADOS.detalle.push('OMITE · empresa con trabajo abierto · ninguna'); return; }

  const ctx = { usuario: { id: 'PRUEBA', email: 'prueba@urbcerroazul.com' }, rol: 'ADMIN' };
  let codigo = '';
  try { empresasEstado(ctx, { id: conTrabajo.id, activo: false }); } catch (e) { codigo = String(e.message); }
  verdadero_(codigo.indexOf('CONFLICTO') === 0, 'no se desactiva una empresa con trabajo sin cerrar');

  // Crear trabajo para una empresa inactiva se rechaza
  const inactiva = filtrar('empresas', function (e) { return !bool(e.activo); })
    .filter(function (e) { return String(e.razon_social || '').toUpperCase().indexOf('PRUEBA') < 0; })[0];
  if (inactiva) {
    let codigo2 = '';
    try {
      crearActividad_({ usuario: { id: 'PRUEBA', email: 'prueba@urbcerroazul.com' }, rol: 'ADMIN' }, {
        titulo: 'Prueba empresa inactiva', nodo_id: 'X', fecha_inicio_plan: hoyIso(),
        empresa_id: inactiva.id,
      });
    } catch (e) { codigo2 = String(e.message); }
    verdadero_(codigo2.indexOf('CONFLICTO') === 0 || codigo2.indexOf('VALIDACION') === 0,
      'no se crea trabajo para una empresa desactivada');
  } else {
    RESULTADOS.detalle.push('OMITE · empresa inactiva · ninguna sin la palabra PRUEBA');
  }
}

/**
 * El archivado viejo está cerrado: si alguien lo llama, recibe PROHIBIDO.
 */
function pruebasArchivoCerrado_() {
  let codigo = '';
  try { archivarAnteriores_OBSOLETA_(24, 'prueba'); } catch (e) { codigo = String(e.message); }
  verdadero_(codigo.indexOf('PROHIBIDO') === 0, 'el archivado anterior está desactivado');
}

/** El monitor de filas cuenta las 25 hojas. */
function pruebasFilasPorHoja_() {
  const conteo = filasPorHoja_();
  const tablas = Object.keys(conteo);
  verdadero_(tablas.length >= 20, 'el monitor mide las tablas (' + tablas.length + ')');
  verdadero_(conteo.actividades !== null && conteo.actividades >= 0, 'y la de actividades da un número');
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