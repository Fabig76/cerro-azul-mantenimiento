/**
 * Informe.gs — informe mensual en PDF (SPEC v1.2, sec. 7.2).
 * Se genera en el servidor, se guarda en /Portal/Documentos y se devuelve el enlace.
 */

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nombreMes_(mes) {
  const anio = mes.slice(0, 4);
  const m = Number(mes.slice(5, 7));
  return MESES_LARGOS[m - 1] + ' de ' + anio;
}

function esc_(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function filaTabla_(celdas, esCabecera) {
  const etiqueta = esCabecera ? 'th' : 'td';
  return '<tr>' + celdas.map(function (c) { return '<' + etiqueta + '>' + c + '</' + etiqueta + '>'; }).join('') + '</tr>';
}

/** Arma el HTML del informe. */
function htmlInforme_(mes) {
  const kpi = kpisMes(mes);
  const conjunto = kpi.conjunto;
  const nodos = filtrar('nodos', function (n) { return bool(n.activo); });
  const actividades = filtrar('actividades', function (a) { return bool(a.activo); });
  const novedades = filtrar('novedades', function (n) { return bool(n.activo); });
  const empresas = {};
  filas('empresas').forEach(function (e) { empresas[e.id] = e.razon_social; });

  const secciones = nodos.filter(function (n) {
    return !n.parent_id;
  }).map(function (raiz) {
    return nodos.filter(function (n) { return String(n.parent_id) === String(raiz.id); });
  })[0] || [];

  const delMes = actividades.filter(function (a) {
    return String(a.estado) !== 'CANCELADA' && mesDe_(a.fecha_fin_plan) === mes;
  });

  const cerradas = actividades.filter(function (a) {
    return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0 && mesDe_(a.fecha_fin_plan) === mes;
  }).sort(function (a, b) { return String(a.fecha_aprobacion) < String(b.fecha_aprobacion) ? 1 : -1; });

  const abiertas = novedades.filter(function (n) {
    return ['ABIERTA', 'EN_ATENCION'].indexOf(String(n.estado)) >= 0;
  });

  const filasSecciones = secciones.map(function (s) {
    const propios = nodos.filter(function (n) {
      const p = n.ruta_ids + '/' + n.id;
      const raiz = s.ruta_ids + '/' + s.id;
      return String(n.clase) === 'ELEMENTO' && (p === raiz || p.indexOf(raiz + '/') === 0);
    });
    const conPuntaje = propios.filter(function (n) { return n.salud_puntaje !== ''; });
    const puntaje = conPuntaje.length
      ? Math.round(conPuntaje.reduce(function (x, n) { return x + Number(n.salud_puntaje); }, 0) / conPuntaje.length)
      : null;
    const criticos = propios.filter(function (n) { return String(n.salud_estado) === 'CRITICO'; }).length;
    const atencion = propios.filter(function (n) { return String(n.salud_estado) === 'ATENCION'; }).length;
    return filaTabla_([
      esc_(s.nombre),
      esc_(s.codigo),
      String(propios.length),
      puntaje === null ? '—' : String(puntaje),
      String(criticos),
      String(atencion),
    ]);
  }).join('');

  const filasEmpresas = (kpi.empresas || []).map(function (e) {
    return filaTabla_([
      esc_(e.razon_social),
      String(e.programadas),
      String(e.cumplidas),
      e.cumplimiento_pct === null ? '—' : e.cumplimiento_pct + ' %',
      e.a_tiempo_pct === null ? '—' : e.a_tiempo_pct + ' %',
      String(e.vencidas),
      e.rechazo_pct === null ? '—' : e.rechazo_pct + ' %',
    ]);
  }).join('');

  const filasCerradas = cerradas.slice(0, 40).map(function (a) {
    const nodo = buscarPorId('nodos', a.nodo_id);
    return filaTabla_([
      fechaIso_(a.fecha_aprobacion) || fechaIso_(a.fecha_fin_plan),
      esc_(nodo ? nodo.codigo : ''),
      esc_(a.titulo),
      esc_(empresas[a.empresa_id] || '—'),
    ]);
  }).join('');

  const filasNovedades = abiertas.map(function (n) {
    const nodo = buscarPorId('nodos', n.nodo_id);
    return filaTabla_([
      fechaIso_(n.fecha_deteccion),
      esc_(nodo ? nodo.codigo : ''),
      esc_(n.titulo),
      esc_(n.gravedad),
      esc_(n.estado),
    ]);
  }).join('');

  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>' +
    '@page { size: Letter; margin: 16mm 14mm; }' +
    'body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; font-size:11pt; line-height:1.5; margin:0 }' +
    '.cab { border-bottom:3px solid #4f46e5; padding-bottom:12px; margin-bottom:20px }' +
    '.cab h1 { margin:0; font-size:22pt; letter-spacing:-.02em }' +
    '.cab .sub { color:#5b6b84; font-size:10pt; margin-top:4px }' +
    'h2 { font-size:13pt; margin:22px 0 8px; color:#4f46e5; letter-spacing:.02em; text-transform:uppercase }' +
    '.kpis { display:flex; gap:10px; margin:14px 0 4px }' +
    '.kpi { flex:1; border:1px solid #e3e8f0; border-top:4px solid #4f46e5; border-radius:8px; padding:10px 12px }' +
    '.kpi .n { font-size:18pt; font-weight:800; letter-spacing:-.03em }' +
    '.kpi .l { font-size:8.5pt; color:#5b6b84; text-transform:uppercase; letter-spacing:.06em }' +
    'table { width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:6px }' +
    'th { background:#f5f7fb; text-align:left; padding:6px 8px; font-size:8.5pt; text-transform:uppercase; letter-spacing:.05em; color:#5b6b84 }' +
    'td { padding:6px 8px; border-top:1px solid #e3e8f0 }' +
    '.pie { margin-top:26px; padding-top:10px; border-top:1px solid #e3e8f0; font-size:8.5pt; color:#5b6b84 }' +
    '</style></head><body>' +
    '<div class="cab"><h1>Informe de mantenimiento</h1>' +
    '<div class="sub">Urbanización Cerro Azul · ' + esc_(nombreMes_(mes)) + ' · generado el ' + esc_(ahoraIso()) + '</div></div>' +

    '<h2>Resumen del mes</h2>' +
    '<div class="kpis">' +
      '<div class="kpi"><div class="n">' + conjunto.programadas + '</div><div class="l">Programadas</div></div>' +
      '<div class="kpi"><div class="n">' + conjunto.ejecutadas + '</div><div class="l">Ejecutadas</div></div>' +
      '<div class="kpi"><div class="n">' + (conjunto.cumplimiento_pct === null ? '—' : conjunto.cumplimiento_pct + ' %') + '</div><div class="l">Cumplimiento</div></div>' +
      '<div class="kpi"><div class="n">' + conjunto.vencidas + '</div><div class="l">Vencidas</div></div>' +
      '<div class="kpi"><div class="n">' + abiertas.length + '</div><div class="l">Novedades abiertas</div></div>' +
    '</div>' +

    '<h2>Cumplimiento por empresa</h2>' +
    '<table><thead>' + filaTabla_(['Empresa', 'Programadas', 'Cumplidas', 'Cumplimiento', 'A tiempo', 'Vencidas', 'Rechazo'], true) +
    '</thead><tbody>' + (filasEmpresas || filaTabla_(['Sin empresas con actividades en el mes', '', '', '', '', '', ''])) + '</tbody></table>' +

    '<h2>Estado por sección</h2>' +
    '<table><thead>' + filaTabla_(['Sección', 'Código', 'Equipos', 'Puntaje', 'Críticos', 'En atención'], true) +
    '</thead><tbody>' + (filasSecciones || filaTabla_(['Sin secciones', '', '', '', '', ''])) + '</tbody></table>' +

    '<h2>Actividades cerradas en el mes</h2>' +
    '<table><thead>' + filaTabla_(['Aprobada', 'Sección', 'Actividad', 'Empresa'], true) +
    '</thead><tbody>' + (filasCerradas || filaTabla_(['Sin actividades cerradas en el mes', '', '', ''])) + '</tbody></table>' +

    '<h2>Novedades abiertas</h2>' +
    '<table><thead>' + filaTabla_(['Detectada', 'Sección', 'Novedad', 'Gravedad', 'Estado'], true) +
    '</thead><tbody>' + (filasNovedades || filaTabla_(['Sin novedades abiertas', '', '', '', ''])) + '</tbody></table>' +

    '<div class="pie">Documento generado automáticamente por el Portal de Control de Mantenimientos. ' +
    'Total de actividades del mes: ' + delMes.length + '. Este informe no sustituye las actas de cada actividad.</div>' +
    '</body></html>';
}

/** Genera el PDF, lo guarda en Drive y devuelve el enlace. */
function generarInformeMensual(mes, usuario) {
  const m = mes || mesDe_(hoyIso());
  const html = htmlInforme_(m);

  const raiz = subcarpeta_(carpetaRaiz_(), 'Documentos');
  const carpeta = subcarpeta_(raiz, 'Informes');
  const nombre = 'Informe-mensual-' + m + '.pdf';

  const blob = Utilities.newBlob(html, MimeType.HTML, 'informe.html').getAs(MimeType.PDF);
  blob.setName(nombre);

  // Si ya existe, se reemplaza para no acumular versiones.
  const existentes = carpeta.getFilesByName(nombre);
  while (existentes.hasNext()) {
    existentes.next().setTrashed(true);
  }
  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  auditar(usuario || 'sistema', 'INFORME_GENERADO', 'informe', archivo.getId(), null, { mes: m });
  return { mes: m, archivo_id: archivo.getId(), nombre: nombre, url: archivo.getUrl(), bytes: blob.getBytes().length };
}

/** Acta de una actividad: checklist respondido, evidencias y aprobación. */
function generarActaActividad(actividadId, usuario) {
  const act = buscarPorId('actividades', actividadId);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');

  const nodo = buscarPorId('nodos', act.nodo_id);
  const empresa = act.empresa_id ? buscarPorId('empresas', act.empresa_id) : null;
  const responsable = act.responsable_id ? buscarPorId('usuarios', act.responsable_id) : null;
  const items = filtrar('checklist_items', function (i) { return String(i.actividad_id) === String(act.id); })
    .sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  const evidencias = filtrar('evidencias', function (e) {
    return String(e.actividad_id) === String(act.id) && bool(e.activo);
  });
  const reporte = filtrar('reportes', function (r) { return String(r.actividad_id) === String(act.id); })
    .sort(function (a, b) { return String(a.fecha_envio) < String(b.fecha_envio) ? 1 : -1; })[0];

  const filasItems = items.map(function (i) {
    const ok = evaluarItem_(i, i.respuesta);
    const marca = ok === true ? 'Cumple' : ok === false ? 'No cumple' : '—';
    return filaTabla_([
      esc_(i.grupo || ''),
      esc_(i.pregunta),
      esc_(i.respuesta || 'sin responder'),
      marca,
    ]);
  }).join('');

  const filasEvidencias = evidencias.map(function (e) {
    return filaTabla_([
      esc_(e.momento),
      esc_(String(e.fecha_subida || '').replace('T', ' ').slice(0, 16)),
      esc_(bool(e.contiene_personas) ? 'Con personas · no publicable' : 'Sin personas'),
      esc_(e.drive_file_id ? 'Archivo en Drive' : '—'),
    ]);
  }).join('');

  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>' +
    '@page { size: Letter; margin: 16mm 14mm; }' +
    'body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; font-size:11pt; line-height:1.5; margin:0 }' +
    '.cab { border-bottom:3px solid #4f46e5; padding-bottom:12px; margin-bottom:18px }' +
    '.cab h1 { margin:0; font-size:19pt; letter-spacing:-.02em }' +
    '.cab .sub { color:#5b6b84; font-size:9.5pt; margin-top:4px }' +
    'h2 { font-size:11pt; margin:20px 0 6px; color:#4f46e5; text-transform:uppercase; letter-spacing:.05em }' +
    'table { width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:4px }' +
    'th { background:#f5f7fb; text-align:left; padding:6px 8px; font-size:8.5pt; text-transform:uppercase; color:#5b6b84 }' +
    'td { padding:6px 8px; border-top:1px solid #e3e8f0 }' +
    'dl { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; margin:0; font-size:10pt }' +
    'dt { color:#5b6b84 } dd { margin:0; font-weight:600 }' +
    '.pie { margin-top:26px; padding-top:10px; border-top:1px solid #e3e8f0; font-size:8.5pt; color:#5b6b84 }' +
    '</style></head><body>' +
    '<div class="cab"><h1>Acta de mantenimiento</h1>' +
    '<div class="sub">Urbanización Cerro Azul · ' + esc_(ahoraIso()) + '</div></div>' +

    '<h2>Actividad</h2>' +
    '<dl>' +
      '<dt>Actividad</dt><dd>' + esc_(act.titulo) + '</dd>' +
      '<dt>Sección</dt><dd>' + esc_(nodo ? nodo.codigo + ' · ' + nodo.nombre : '—') + '</dd>' +
      '<dt>Empresa</dt><dd>' + esc_(empresa ? empresa.razon_social : '—') + '</dd>' +
      '<dt>Responsable</dt><dd>' + esc_(responsable ? responsable.nombre : '—') + '</dd>' +
      '<dt>Estado</dt><dd>' + esc_(act.estado) + '</dd>' +
      '<dt>Planificada</dt><dd>' + esc_(fechaIso_(act.fecha_inicio_plan) + ' a ' + fechaIso_(act.fecha_fin_plan)) + '</dd>' +
      '<dt>Ejecutada</dt><dd>' + esc_((String(act.fecha_inicio_real || '').slice(0, 10) || '—') + ' a ' + (String(act.fecha_reporte_final || '').slice(0, 10) || '—')) + '</dd>' +
      '<dt>Avance aprobado</dt><dd>' + esc_(String(act.avance_aprobado_pct || 0) + ' %') + '</dd>' +
    '</dl>' +

    '<h2>Checklist</h2>' +
    '<table><thead>' + filaTabla_(['Grupo', 'Ítem', 'Respuesta', 'Cumple'], true) +
    '</thead><tbody>' + (filasItems || filaTabla_(['Sin checklist registrado', '', '', ''])) + '</tbody></table>' +

    '<h2>Evidencias</h2>' +
    '<table><thead>' + filaTabla_(['Momento', 'Subida', 'Personas', 'Archivo'], true) +
    '</thead><tbody>' + (filasEvidencias || filaTabla_(['Sin evidencias', '', '', ''])) + '</tbody></table>' +

    (reporte ? '<h2>Revisión</h2><dl>' +
      '<dt>Resultado</dt><dd>' + esc_(reporte.estado_revision) + '</dd>' +
      '<dt>Observación</dt><dd>' + esc_(reporte.comentario_admin || '—') + '</dd>' +
      '</dl>' : '') +

    '<div class="pie">Documento generado desde el Portal de Control de Mantenimientos. ' +
    'Las fotografías originales quedan archivadas en la carpeta de evidencias de la copropiedad.</div>' +
    '</body></html>';

  const carpeta = subcarpeta_(subcarpeta_(carpetaRaiz_(), 'Documentos'), 'Actas');
  const nombre = 'Acta-' + String(act.id).slice(-8) + '-' + fechaIso_(act.fecha_fin_plan) + '.pdf';
  const blob = Utilities.newBlob(html, MimeType.HTML, 'acta.html').getAs(MimeType.PDF);
  blob.setName(nombre);

  const existentes = carpeta.getFilesByName(nombre);
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  auditar(usuario || 'sistema', 'ACTA_GENERADA', 'actividad', act.id, null, { archivo: nombre });
  return { nombre: nombre, url: archivo.getUrl(), items: items.length, evidencias: evidencias.length };
}
