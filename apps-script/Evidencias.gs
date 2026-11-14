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
  desdePortal_(payload);
  const actividadId = exigirTexto(payload.actividad_id, 'actividad_id');
  const act = buscarPorId('actividades', actividadId);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (!puedeEjecutarActividad_(ctx, act)) fallar_('PROHIBIDO', 'No puedes subir fotos a esta actividad.');
  if (['APROBADA', 'CERRADA', 'CANCELADA'].indexOf(String(act.estado)) >= 0) {
    fallar_('ESTADO_INVALIDO', 'La actividad ya está cerrada.');
  }

  const momento = exigirEnEnum(payload.momento || 'ANTES', 'momento', ['ANTES', 'DURANTE', 'DESPUES', 'DOCUMENTO']);
  // Una foto de ANTES solo tiene sentido antes de empezar (4.3).
  if (momento === 'ANTES' && String(act.estado) !== 'PROGRAMADA') {
    fallar_('ESTADO_INVALIDO', 'La actividad ya fue iniciada: no se aceptan fotos de ANTES.');
  }
  // RN-33: si la foto viene de una etapa, el reporte tiene que ser de esta actividad
  // y de quien la está subiendo.
  let reporteId = '';
  if (payload.reporte_id) {
    const rep = buscarPorId('reportes', payload.reporte_id);
    if (!rep || !bool(rep.activo)) fallar_('VALIDACION', 'Ese reporte no existe.');
    if (String(rep.actividad_id) !== String(actividadId)) {
      fallar_('VALIDACION', 'Ese reporte es de otra actividad.');
    }
    if (String(rep.usuario_id) !== String(ctx.usuario.id)) {
      fallar_('VALIDACION', 'Solo quien reportó la etapa puede subir su foto.');
    }
    reporteId = String(rep.id);
  }

  const mime = exigirEnEnum(payload.mime || 'image/jpeg', 'mime', ['image/jpeg', 'image/png', 'application/pdf']);
  const bytes = decodificarBase64_(payload.base64);
  if (bytes.length > 2 * 1024 * 1024) fallar_('ARCHIVO_GRANDE', 'La imagen supera 2 MB.');

  // El hash se calcula siempre en el servidor: el del cliente no es confiable (B2).
  const sha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');

  const repetida = filtrar('evidencias', function (e) {
    return String(e.sha256) === sha && bool(e.activo);
  })[0];
  if (repetida) {
    // Reintento de una subida cuya respuesta se perdió: si es la misma foto, en la
    // misma actividad y el mismo momento, ya está guardada. Se responde como éxito.
    const misma = String(repetida.actividad_id) === String(actividadId) &&
      String(repetida.momento) === String(momento);
    if (misma) {
      return { evidencia_id: repetida.id, momento: repetida.momento,
        bytes: Number(repetida.bytes) || bytes.length, ya_estaba: true };
    }
    fallar_('FOTO_DUPLICADA', 'Esa foto ya está cargada en otra actividad.');
  }

  // RN-30: una foto de la visita no reemplaza la foto de antes.
  const deVisita = filtrar('propuestas', function (p) {
    if (!bool(p.activo)) return false;
    return fromJson(p.fotos_json, []).some(function (f) { return String(f.sha256) === sha; });
  })[0];
  if (deVisita) {
    fallar_('FOTO_DUPLICADA', 'Esa foto es de la visita. La foto de antes se toma al iniciar el trabajo.');
  }

  // RN-34: una foto por etapa. Si ya hay una, se reemplaza (la anterior queda inactiva).
  if (reporteId) {
    const anterior = filtrar('evidencias', function (e) {
      return String(e.reporte_id) === reporteId && bool(e.activo);
    })[0];
    if (anterior) {
      actualizar('evidencias', anterior.id, { activo: false, publicable: false }, ctx.usuario.email);
    }
  }

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
    if (miniBytes.length > 55 * 1024) {
      fallar_('ARCHIVO_GRANDE', 'La miniatura supera 55 KB. Vuelve a tomarla: debe quedar más liviana.');
    }
    if (miniBytes.length > 0) {
      const mini = carpetaAct.createFile(Utilities.newBlob(miniBytes, 'image/jpeg', nombre + '_mini.jpg'));
      mini.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      miniId = mini.getId();
    }
  }

  // 2) Solo ahora, el bloqueo para escribir la fila.
  const fila = conBloqueo(function () {
    return insertar('evidencias', {
      id: newId('EVI'),
      reporte_id: reporteId,
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
