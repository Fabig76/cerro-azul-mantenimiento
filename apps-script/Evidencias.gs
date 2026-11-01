/**
 * Evidencias.gs — fotos de campo (SPEC v1.2, sec. 7.4 y RN-16).
 * El archivo va a Drive; la hoja guarda solo metadatos y el id del archivo.
 */

const CARPETA_EVIDENCIAS = 'Evidencias';

function carpetaRaiz_() {
  const id = prop('ROOT_FOLDER_ID');
  if (!id) fallar_('SIN_CONFIGURAR', 'Falta la carpeta raíz del portal. Ejecute setup().');
  return DriveApp.getFolderById(id);
}

function subcarpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

/** Carpeta /Evidencias/AAAA/MM/<actividad>/ */
function carpetaEvidencias_(fecha) {
  const raiz = subcarpeta_(carpetaRaiz_(), CARPETA_EVIDENCIAS);
  const anio = subcarpeta_(raiz, String(fecha).slice(0, 4));
  return { anio: anio, mes: subcarpeta_(anio, String(fecha).slice(5, 7)) };
}

function decodificarBase64_(txt) {
  const limpio = String(txt || '').replace(/^data:[^;]+;base64,/, '');
  if (!limpio) fallar_('VALIDACION', 'La imagen llegó vacía.');
  return Utilities.base64Decode(limpio);
}

/**
 * Sube una foto. Una petición por foto (sec. 7.4).
 * payload: { actividad_id, momento, base64, base64_mini?, mime, sha256, fecha_captura?, lat?, lng?, contiene_personas? }
 */
function evidenciasUpload(ctx, payload) {
  const actividadId = exigirTexto(payload.actividad_id, 'actividad_id');
  const act = buscarPorId('actividades', actividadId);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (!puedeEjecutarActividad_(ctx, act)) fallar_('PROHIBIDO', 'No puedes subir fotos a esta actividad.');
  if (['APROBADA', 'CERRADA', 'CANCELADA'].indexOf(String(act.estado)) >= 0) {
    fallar_('ESTADO_INVALIDO', 'La actividad ya está cerrada.');
  }

  const momento = exigirEnEnum(payload.momento || 'ANTES', 'momento', ['ANTES', 'DURANTE', 'DESPUES', 'DOCUMENTO']);
  const mime = exigirEnEnum(payload.mime || 'image/jpeg', 'mime', ['image/jpeg', 'image/png', 'application/pdf']);
  const bytes = decodificarBase64_(payload.base64);
  if (bytes.length > 2 * 1024 * 1024) fallar_('ARCHIVO_GRANDE', 'La imagen supera 2 MB.');

  const sha = payload.sha256 ? String(payload.sha256) : Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes, Utilities.Charset.UTF_8).map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');

  const repetida = filtrar('evidencias', function (e) {
    return String(e.sha256) === sha && bool(e.activo);
  })[0];
  if (repetida) fallar_('FOTO_DUPLICADA', 'Esa foto ya está cargada en otra actividad.');

  const nodo = buscarPorId('nodos', act.nodo_id);
  const codigo = nodo ? nodo.codigo : 'NODO';
  const hoy = hoyIso();
  const carpetas = carpetaEvidencias_(hoy);
  const carpetaAct = subcarpeta_(carpetas.mes, actividadId);
  const consecutivo = filtrar('evidencias', function (e) {
    return String(e.actividad_id) === actividadId && String(e.momento) === momento;
  }).length + 1;
  const nombre = codigo + '_' + momento + '_' + hoy + '_' + consecutivo;

  // 1) La operación externa va primero y FUERA del bloqueo (RN-16).
  const principal = carpetaAct.createFile(Utilities.newBlob(bytes, mime, nombre + (mime === 'application/pdf' ? '.pdf' : '.jpg')));
  principal.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  let miniId = '';
  if (payload.base64_mini) {
    const miniBytes = decodificarBase64_(payload.base64_mini);
    if (miniBytes.length <= 120 * 1024) {
      const mini = carpetaAct.createFile(Utilities.newBlob(miniBytes, 'image/jpeg', nombre + '_mini.jpg'));
      mini.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      miniId = mini.getId();
    }
  }

  // 2) Solo ahora, el bloqueo para escribir la fila.
  const fila = conBloqueo(function () {
    return insertar('evidencias', {
      id: newId('EVI'),
      reporte_id: payload.reporte_id || '',
      actividad_id: actividadId,
      nodo_id: act.nodo_id,
      momento: momento,
      drive_file_id: principal.getId(),
      mini_file_id: miniId,
      mime: mime,
      bytes: bytes.length,
      sha256: sha,
      fecha_captura: payload.fecha_captura || '',
      fecha_subida: ahoraIso(),
      lat: payload.lat || '',
      lng: payload.lng || '',
      contiene_personas: !!payload.contiene_personas,
      publicable: false,
      public_file_id: '',
      activo: true,
    }, ctx.usuario.email);
  });

  return { evidencia_id: fila.id, momento: momento, bytes: bytes.length };
}

/** Devuelve la foto en base64 para quien tenga permiso sobre la actividad. */
function evidenciasGet(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const ev = buscarPorId('evidencias', id);
  if (!ev) fallar_('NO_ENCONTRADO', 'La evidencia no existe.');
  const act = buscarPorId('actividades', ev.actividad_id);
  if (!act || !puedeVerActividad_(ctx, act)) fallar_('PROHIBIDO', 'No tienes acceso a esta evidencia.');

  const tam = payload.tam === 'mini' ? 'mini' : 'grande';
  const fileId = tam === 'mini' && ev.mini_file_id ? ev.mini_file_id : ev.drive_file_id;
  const archivo = DriveApp.getFileById(fileId);
  const blob = archivo.getBlob();

  return {
    id: ev.id,
    mime: blob.getContentType(),
    bytes: blob.getBytes().length,
    base64: Utilities.base64Encode(blob.getBytes()),
    momento: ev.momento,
  };
}

/** Evidencias de una actividad, agrupadas por momento. */
function evidenciasDe_(actividadId) {
  const lista = filtrar('evidencias', function (e) {
    return String(e.actividad_id) === String(actividadId) && bool(e.activo);
  });
  return {
    antes: lista.filter(function (e) { return String(e.momento) === 'ANTES'; }),
    durante: lista.filter(function (e) { return String(e.momento) === 'DURANTE'; }),
    despues: lista.filter(function (e) { return String(e.momento) === 'DESPUES'; }),
  };
}
