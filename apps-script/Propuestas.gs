/**
 * Propuestas.gs — el contratista propone una actividad y el administrador la aprueba.
 * La propuesta NO es una actividad: vive en su propia hoja y no la lee ningún cálculo
 * existente (portal público, KPI, salud, informes).
 */

const PROPUESTAS_FOTOS_MAX = 3;

function propuestaResumen_(p) {
  const nodo = p.nodo_id ? buscarPorId('nodos', p.nodo_id) : null;
  const autor = p.propuesta_por ? buscarPorId('usuarios', p.propuesta_por) : null;
  const empresa = p.empresa_id ? buscarPorId('empresas', p.empresa_id) : null;
  const fotos = fromJson(p.fotos_json, []);
  return {
    id: p.id,
    titulo: p.titulo,
    nodo_id: p.nodo_id,
    nodo_codigo: nodo ? nodo.codigo : '',
    nodo_nombre: nodo ? nodo.nombre : '',
    hallazgo: p.hallazgo || '',
    alcance: p.alcance || '',
    fecha_inicio_sugerida: fechaIso_(p.fecha_inicio_sugerida),
    fecha_fin_sugerida: fechaIso_(p.fecha_fin_sugerida),
    prioridad_sugerida: p.prioridad_sugerida || 'MEDIA',
    afecta_uso: bool(p.afecta_uso),
    propuesta_por: p.propuesta_por,
    propuesta_por_nombre: autor ? (autor.nombre || autor.email) : '',
    empresa_id: p.empresa_id,
    empresa_nombre: empresa ? empresa.razon_social : '',
    estado: p.estado,
    fotos: fotos.map(function (f) { return f.id; }),
    fotos_purgadas_en: p.fotos_purgadas_en || '',
    motivo_rechazo: p.motivo_rechazo || '',
    revisado_por: p.revisado_por || '',
    revisado_en: p.revisado_en || '',
    ajustes: fromJson(p.ajustes_json, {}),
    actividad_id: p.actividad_id || '',
    creado_en: p.creado_en,
    actualizado_en: p.actualizado_en,
  };
}

/** Actividades abiertas en una sección (para avisar, no para bloquear). */
function actividadesAbiertasEn_(nodoId) {
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) return 0;
  const raiz = nodo.ruta_ids + '/' + nodo.id;
  return filtrar('actividades', function (a) {
    if (!bool(a.activo)) return false;
    if (['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA', 'RECHAZADA'].indexOf(String(a.estado)) < 0) return false;
    const suyo = buscarPorId('nodos', a.nodo_id);
    if (!suyo) return false;
    const ruta = suyo.ruta_ids + '/' + suyo.id;
    return ruta === raiz || ruta.indexOf(raiz + '/') === 0;
  }).length;
}

function propuestasCrear(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();

  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) fallar_('NO_ENCONTRADO', 'La sección no existe.');
  if (!bool(nodo.activo)) fallar_('VALIDACION', 'Esa sección está desactivada.');

  // RN-25: solo en secciones asignadas al contratista.
  const asignados = nodosAsignados_(ctx.usuario.id);
  const propio = nodo.ruta_ids + '/' + nodo.id;
  const permitido = asignados.some(function (a) {
    const raiz = a.ruta_ids + '/' + a.id;
    return propio === raiz || propio.indexOf(raiz + '/') === 0;
  });
  if (!permitido) fallar_('PROHIBIDO', 'Esa sección no está entre las que tienes asignadas.');

  // RN-26: máximo de pendientes.
  const maximo = configNumero('propuestas_max_pendientes', 10);
  const pendientes = filtrar('propuestas', function (p) {
    return String(p.propuesta_por) === String(ctx.usuario.id) && String(p.estado) === 'PENDIENTE';
  }).length;
  if (pendientes >= maximo) {
    fallar_('CONFLICTO', 'Ya tienes ' + pendientes + ' propuestas pendientes. Espera a que las revisen.');
  }

  if (!String(payload.titulo || '').trim()) fallar_('VALIDACION', 'Escribe un título para la actividad.');
  const titulo = exigirTexto(payload.titulo, 'titulo', 120);
  const hallazgo = exigirTexto(payload.hallazgo, 'hallazgo', 2000);
  if (hallazgo.trim().length < 20) fallar_('VALIDACION', 'Cuenta con al menos 20 caracteres qué encontraste.');
  const alcance = exigirTexto(payload.alcance, 'alcance', 2000);
  if (alcance.trim().length < 20) fallar_('VALIDACION', 'Cuenta con al menos 20 caracteres qué propones hacer.');

  // RN-27: fechas con sentido.
  const inicio = exigirTexto(payload.fecha_inicio_sugerida, 'fecha_inicio_sugerida');
  const fin = payload.fecha_fin_sugerida ? String(payload.fecha_fin_sugerida) : inicio;
  if (fechaIso_(inicio) < hoyIso()) fallar_('VALIDACION', 'La fecha de inicio no puede ser anterior a hoy.');
  if (fechaIso_(fin) < fechaIso_(inicio)) fallar_('VALIDACION', 'La fecha final no puede ser anterior a la inicial.');

  const prioridad = exigirEnEnum(payload.prioridad_sugerida || 'MEDIA', 'prioridad_sugerida',
    ['BAJA', 'MEDIA', 'ALTA', 'URGENTE']);

  const propuesta = insertar('propuestas', {
    id: newId('PRO'),
    nodo_id: nodoId,
    titulo: titulo,
    hallazgo: hallazgo,
    alcance: alcance,
    fecha_inicio_sugerida: fechaIso_(inicio),
    fecha_fin_sugerida: fechaIso_(fin),
    prioridad_sugerida: prioridad,
    afecta_uso: !!payload.afecta_uso,
    propuesta_por: ctx.usuario.id,
    empresa_id: ctx.usuario.empresa_id || '',
    estado: 'PENDIENTE',
    fotos_json: '[]',
    revisado_por: '',
    revisado_en: '',
    motivo_rechazo: '',
    ajustes_json: '{}',
    actividad_id: '',
    fotos_purgadas_en: '',
    activo: true,
  }, ctx.usuario.email);

  adminsEmails_().forEach(function (adm) {
    const admin = usuarioPorEmail_(adm);
    if (admin) encolar_(admin.id, 'PROPUESTA_NUEVA', propuesta.id);
  });

  // La auditoría no guarda hallazgo ni alcance: si la propuesta se purga, no deben quedar ahí.
  auditar(ctx.usuario.email, 'PROPUESTA_CREADA', 'propuesta', propuesta.id, null,
    { titulo: titulo, nodo: nodo.codigo });

  const abiertas = actividadesAbiertasEn_(nodoId);
  return {
    propuesta: propuestaResumen_(propuesta),
    aviso: abiertas ? 'Ya hay ' + abiertas + ' actividad(es) abierta(s) en esta sección.' : '',
  };
}

function propuestasListar(ctx, payload) {
  asegurarEsquema_();
  const estado = payload.estado ? String(payload.estado).toUpperCase() : null;

  let lista = filtrar('propuestas', function (p) {
    if (!bool(p.activo)) return false;
    if (estado && String(p.estado) !== estado) return false;
    return true;
  });

  if (ctx.rol === 'CONTRATISTA') {
    lista = lista.filter(function (p) { return String(p.propuesta_por) === String(ctx.usuario.id); });
  } else if (['ADMIN', 'SUPERVISOR'].indexOf(ctx.rol) < 0) {
    fallar_('PROHIBIDO', 'No tienes acceso a las propuestas.');
  }

  const orden = { PENDIENTE: 0, APROBADA: 1, RECHAZADA: 2, RETIRADA: 3 };
  lista.sort(function (a, b) {
    const oa = a.estado in orden ? orden[a.estado] : 9;
    const ob = b.estado in orden ? orden[b.estado] : 9;
    if (oa !== ob) return oa - ob;
    return String(a.creado_en) < String(b.creado_en) ? 1 : -1;
  });

  return { propuestas: lista.map(propuestaResumen_), total: lista.length };
}

/** Secciones activas dentro de las asignaciones vigentes de una persona. */
function seccionesPosibles_(usuarioId) {
  const raices = nodosAsignados_(usuarioId).map(function (n) { return n.ruta_ids + '/' + n.id; });
  if (!raices.length) return [];
  return filtrar('nodos', function (n) {
    if (!bool(n.activo)) return false;
    const suyo = n.ruta_ids + '/' + n.id;
    return raices.some(function (r) { return suyo === r || suyo.indexOf(r + '/') === 0; });
  })
    .sort(function (a, b) { return String(a.codigo) < String(b.codigo) ? -1 : 1; })
    .map(function (n) {
      return { id: n.id, codigo: n.codigo, nombre: n.nombre, profundidad: Number(n.profundidad) || 0 };
    });
}

function propuestasGet(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();
  const id = exigirTexto(payload.id, 'id');
  const p = buscarPorId('propuestas', id);
  if (!p || !bool(p.activo)) fallar_('NO_ENCONTRADO', 'La propuesta no existe.');

  const autor = String(p.propuesta_por) === String(ctx.usuario.id);
  const esAdmin = ['ADMIN', 'SUPERVISOR'].indexOf(ctx.rol) >= 0;
  if (!autor && !esAdmin) fallar_('PROHIBIDO', 'No puedes ver esta propuesta.');

  const salida = { propuesta: propuestaResumen_(p) };

  if (ctx.rol === 'ADMIN' || ctx.rol === 'SUPERVISOR') {
    const usuario = buscarPorId('usuarios', p.propuesta_por);
    const empresa = p.empresa_id ? buscarPorId('empresas', p.empresa_id) : null;
    const empresaVencida = empresa && empresa.vigencia_hasta
      && String(empresa.vigencia_hasta) < hoyIso();

    // Ayuda visual: el estado puede cambiar antes de aprobar. La comprobación
    // válida es la de propuestasAprobar, dentro del bloqueo.
    salida.secciones_posibles = seccionesPosibles_(p.propuesta_por);
    salida.verificacion = {
      usuario_activo: usuario ? String(usuario.estado) === 'ACTIVO' : false,
      asignacion_vigente: usuario ? nodosAsignados_(usuario.id).some(function (a) {
        const nodo = buscarPorId('nodos', p.nodo_id);
        if (!nodo) return false;
        const raiz = a.ruta_ids + '/' + a.id;
        const suyo = nodo.ruta_ids + '/' + nodo.id;
        return suyo === raiz || suyo.indexOf(raiz + '/') === 0;
      }) : false,
      empresa_vigente: empresa ? !empresaVencida : false,
      empresa_sin_cambios: usuario ? String(usuario.empresa_id || '') === String(p.empresa_id || '') : false,
      actividades_abiertas: actividadesAbiertasEn_(p.nodo_id),
    };
  }

  return salida;
}

function propuestasAprobar(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();
  const id = exigirTexto(payload.id, 'id');

  return conBloqueo(function () {
    limpiarCache('propuestas');
    const p = buscarPorId('propuestas', id);
    if (!p || !bool(p.activo)) fallar_('NO_ENCONTRADO', 'La propuesta no existe.');
    if (String(p.estado) !== 'PENDIENTE') fallar_('ESTADO_INVALIDO', 'Esa propuesta ya fue revisada.');

    const nodoId = payload.nodo_id || p.nodo_id;
    if (payload.titulo !== undefined && !String(payload.titulo).trim()) {
      fallar_('VALIDACION', 'Escribe un título para la actividad.');
    }
    const titulo = payload.titulo ? exigirTexto(payload.titulo, 'titulo', 120) : p.titulo;
    const descripcion = payload.descripcion !== undefined
      ? String(payload.descripcion).slice(0, 2000) : p.alcance;
    const inicio = payload.fecha_inicio_plan || fechaIso_(p.fecha_inicio_sugerida);
    const fin = payload.fecha_fin_plan || fechaIso_(p.fecha_fin_sugerida) || inicio;
    const prioridad = payload.prioridad || p.prioridad_sugerida;

    // RN-28: todo se valida antes de escribir nada.
    const usuario = buscarPorId('usuarios', p.propuesta_por);
    if (!usuario || String(usuario.estado) !== 'ACTIVO') {
      fallar_('CONFLICTO', 'Quien propuso ya no está activo. No se puede aprobar.');
    }
    const nodo = buscarPorId('nodos', nodoId);
    if (!nodo || !bool(nodo.activo)) fallar_('CONFLICTO', 'La sección ya no está disponible.');
    const propio = nodo.ruta_ids + '/' + nodo.id;
    const asignado = nodosAsignados_(usuario.id).some(function (a) {
      const raiz = a.ruta_ids + '/' + a.id;
      return propio === raiz || propio.indexOf(raiz + '/') > 0 || propio.indexOf(raiz + '/') === 0;
    });
    if (!asignado) fallar_('CONFLICTO', 'Quien propuso ya no tiene asignada esa sección.');

    if (String(usuario.empresa_id || '') !== String(p.empresa_id || '')) {
      fallar_('CONFLICTO',
        'El contratista cambió de empresa desde que propuso. No apruebes esta propuesta: que proponga de nuevo.');
    }
    const empresa = p.empresa_id ? buscarPorId('empresas', p.empresa_id) : null;
    if (empresa && empresa.vigencia_hasta && String(empresa.vigencia_hasta) < hoyIso()) {
      fallar_('CONFLICTO', 'La empresa tiene el contrato vencido (RN-18).');
    }
    if (fechaIso_(inicio) < hoyIso()) fallar_('VALIDACION', 'La fecha de inicio no puede ser anterior a hoy.');

    // RN-29: el responsable y la empresa los pone el servidor.
    const creada = crearActividad_(ctx, {
      nodo_id: nodoId,
      titulo: titulo,
      descripcion: descripcion,
      fecha_inicio_plan: inicio,
      fecha_fin_plan: fin,
      prioridad: prioridad,
      afecta_uso: bool(p.afecta_uso),
      empresa_id: p.empresa_id,
      responsable_id: p.propuesta_por,
    }, { avisar: false, origen: 'PROPUESTA', propuesta_id: p.id });

    const ajustes = {};
    if (titulo !== p.titulo) ajustes.titulo = { antes: p.titulo, despues: titulo };
    if (String(nodoId) !== String(p.nodo_id)) ajustes.nodo = { antes: p.nodo_id, despues: nodoId };
    if (fechaIso_(inicio) !== fechaIso_(p.fecha_inicio_sugerida)) {
      ajustes.fecha_inicio = { antes: fechaIso_(p.fecha_inicio_sugerida), despues: fechaIso_(inicio) };
    }
    if (fechaIso_(fin) !== fechaIso_(p.fecha_fin_sugerida)) {
      ajustes.fecha_fin = { antes: fechaIso_(p.fecha_fin_sugerida), despues: fechaIso_(fin) };
    }
    if (String(prioridad) !== String(p.prioridad_sugerida)) {
      ajustes.prioridad = { antes: p.prioridad_sugerida, despues: prioridad };
    }

    const actualizada = actualizar('propuestas', p.id, {
      estado: 'APROBADA',
      actividad_id: creada.actividad.id,
      revisado_por: ctx.usuario.email,
      revisado_en: ahoraIso(),
      ajustes_json: toJson(ajustes),
    }, ctx.usuario.email);

    encolar_(p.propuesta_por, 'PROPUESTA_APROBADA', p.id);
    auditar(ctx.usuario.email, 'PROPUESTA_APROBADA', 'propuesta', p.id, null,
      { actividad: creada.actividad.id, ajustes: ajustes });

    return { propuesta: propuestaResumen_(actualizada), actividad: creada.actividad };
  });
}

function propuestasRechazar(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();
  const id = exigirTexto(payload.id, 'id');
  const motivo = exigirTexto(payload.motivo, 'motivo', 1000);
  if (motivo.trim().length < 10) fallar_('VALIDACION', 'Escribe el motivo (al menos 10 caracteres).');

  return conBloqueo(function () {
    limpiarCache('propuestas');
    const p = buscarPorId('propuestas', id);
    if (!p || !bool(p.activo)) fallar_('NO_ENCONTRADO', 'La propuesta no existe.');
    if (String(p.estado) !== 'PENDIENTE') fallar_('ESTADO_INVALIDO', 'Esa propuesta ya fue revisada.');

    const actualizada = actualizar('propuestas', p.id, {
      estado: 'RECHAZADA',
      motivo_rechazo: motivo,
      revisado_por: ctx.usuario.email,
      revisado_en: ahoraIso(),
    }, ctx.usuario.email);

    encolar_(p.propuesta_por, 'PROPUESTA_RECHAZADA', p.id);
    auditar(ctx.usuario.email, 'PROPUESTA_RECHAZADA', 'propuesta', p.id, null, { motivo: motivo });
    return { propuesta: propuestaResumen_(actualizada) };
  });
}

function propuestasRetirar(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();
  const id = exigirTexto(payload.id, 'id');

  return conBloqueo(function () {
    limpiarCache('propuestas');
    const p = buscarPorId('propuestas', id);
    if (!p || !bool(p.activo)) fallar_('NO_ENCONTRADO', 'La propuesta no existe.');
    if (String(p.propuesta_por) !== String(ctx.usuario.id)) fallar_('PROHIBIDO', 'Esa propuesta no es tuya.');
    if (String(p.estado) !== 'PENDIENTE') fallar_('ESTADO_INVALIDO', 'Solo puedes retirar una propuesta pendiente.');

    const actualizada = actualizar('propuestas', p.id, { estado: 'RETIRADA' }, ctx.usuario.email);
    auditar(ctx.usuario.email, 'PROPUESTA_RETIRADA', 'propuesta', p.id, null, null);
    return { propuesta: propuestaResumen_(actualizada) };
  });
}

/** Sube una foto de la visita. No es evidencia del trabajo (RN-30). */
function propuestasFotoSubir(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();
  const propuestaId = exigirTexto(payload.propuesta_id, 'propuesta_id');
  const p = buscarPorId('propuestas', propuestaId);
  if (!p || !bool(p.activo)) fallar_('NO_ENCONTRADO', 'La propuesta no existe.');
  if (String(p.propuesta_por) !== String(ctx.usuario.id)) fallar_('PROHIBIDO', 'Esa propuesta no es tuya.');
  if (String(p.estado) !== 'PENDIENTE') fallar_('ESTADO_INVALIDO', 'La propuesta ya fue revisada.');

  const fotos = fromJson(p.fotos_json, []);
  if (fotos.length >= PROPUESTAS_FOTOS_MAX) {
    fallar_('VALIDACION', 'Ya hay ' + PROPUESTAS_FOTOS_MAX + ' fotos en esta propuesta.');
  }

  const mime = exigirEnEnum(payload.mime || 'image/jpeg', 'mime', ['image/jpeg', 'image/png']);
  const bytes = decodificarBase64_(payload.base64);
  if (bytes.length > 2 * 1024 * 1024) fallar_('ARCHIVO_GRANDE', 'La imagen supera 2 MB.');
  const miniBytes = payload.base64_mini ? decodificarBase64_(payload.base64_mini) : [];
  if (miniBytes.length > 55 * 1024) fallar_('ARCHIVO_GRANDE', 'La miniatura supera 55 KB.');

  const sha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');

  // RN-30: una foto de la visita no puede reciclarse como evidencia.
  const yaEvidencia = filtrar('evidencias', function (e) {
    return String(e.sha256) === sha && bool(e.activo);
  })[0];
  if (yaEvidencia) fallar_('FOTO_DUPLICADA', 'Esa foto ya está cargada como evidencia de un trabajo.');

  const enOtraPropuesta = filtrar('propuestas', function (otra) {
    if (String(otra.id) === String(p.id) || !bool(otra.activo)) return false;
    return fromJson(otra.fotos_json, []).some(function (f) { return String(f.sha256) === sha; });
  })[0];
  if (enOtraPropuesta) fallar_('FOTO_DUPLICADA', 'Esa foto ya está en otra propuesta.');

  // Drive fuera del bloqueo (RN-16).
  const carpeta = subcarpeta_(subcarpeta_(carpetaEvidencias_(hoyIso()).mes, 'propuestas'), p.id);
  const principal = carpeta.createFile(Utilities.newBlob(bytes, mime, 'visita_' + Date.now() + '.jpg'));
  let miniId = '';
  if (miniBytes.length) {
    miniId = carpeta.createFile(Utilities.newBlob(miniBytes, mime, 'visita_mini_' + Date.now() + '.jpg')).getId();
  }

  return conBloqueo(function () {
    limpiarCache('propuestas');
    const fresca = buscarPorId('propuestas', p.id);
    if (!fresca || String(fresca.estado) !== 'PENDIENTE') {
      // La propuesta cambió mientras subía: se retiran los archivos recién creados.
      principal.setTrashed(true);
      if (miniId) { try { DriveApp.getFileById(miniId).setTrashed(true); } catch (e) {} }
      fallar_('ESTADO_INVALIDO', 'La propuesta ya fue revisada; la foto no se guardó.');
    }
    const lista = fromJson(fresca.fotos_json, []);
    if (lista.length >= PROPUESTAS_FOTOS_MAX) {
      principal.setTrashed(true);
      if (miniId) { try { DriveApp.getFileById(miniId).setTrashed(true); } catch (e) {} }
      fallar_('VALIDACION', 'La propuesta ya tiene ' + PROPUESTAS_FOTOS_MAX + ' fotos.');
    }
    const foto = {
      id: newId('PFO'),
      drive_file_id: principal.getId(),
      mini_file_id: miniId,
      sha256: sha,
      bytes: bytes.length,
      fecha_subida: ahoraIso(),
    };
    lista.push(foto);
    actualizar('propuestas', fresca.id, { fotos_json: toJson(lista) }, ctx.usuario.email);
    return { foto: { id: foto.id }, fotos: lista.length };
  });
}

/** Devuelve una foto de la visita. */
function propuestasFotoGet(ctx, payload) {
  desdePortal_(payload);
  asegurarEsquema_();
  const propuestaId = exigirTexto(payload.propuesta_id, 'propuesta_id');
  const fotoId = exigirTexto(payload.foto_id, 'foto_id');
  const p = buscarPorId('propuestas', propuestaId);
  if (!p || !bool(p.activo)) fallar_('NO_ENCONTRADO', 'La propuesta no existe.');

  const autor = String(p.propuesta_por) === String(ctx.usuario.id);
  const esAdmin = ['ADMIN', 'SUPERVISOR'].indexOf(ctx.rol) >= 0;
  let puede = autor || esAdmin;
  if (!puede && p.actividad_id) {
    const act = buscarPorId('actividades', p.actividad_id);
    puede = act ? puedeVerActividad_(ctx, act) : false;
  }
  if (!puede) fallar_('PROHIBIDO', 'No puedes ver esa foto.');

  const foto = fromJson(p.fotos_json, []).filter(function (f) { return String(f.id) === fotoId; })[0];
  if (!foto) fallar_('NO_ENCONTRADO', 'Esa foto no está en la propuesta.');
  const fileId = payload.tam === 'mini' && foto.mini_file_id ? foto.mini_file_id : foto.drive_file_id;
  if (!fileId) fallar_('NO_ENCONTRADO', 'La foto ya no está disponible.');

  const blob = DriveApp.getFileById(fileId).getBlob();
  return { base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
}

/**
 * Purga las fotos de las propuestas rechazadas o retiradas viejas.
 * El texto (hallazgo y alcance) se conserva: es la constancia de que el
 * contratista advirtió algo. Solo se van los archivos, que es lo que pesa.
 */
function purgarPropuestas_() {
  const dias = configNumero('propuestas_dias_borrado', 15);
  const corte = new Date(Date.now() - dias * 86400000);
  const hoy = hoyIso();

  const viejas = filtrar('propuestas', function (p) {
    if (!bool(p.activo)) return false;
    if (['RECHAZADA', 'RETIRADA'].indexOf(String(p.estado)) < 0) return false;
    if (p.actividad_id) return false;
    if (p.fotos_purgadas_en) return false;
    const referencia = String(p.estado) === 'RETIRADA'
      ? (p.actualizado_en || p.creado_en) : (p.revisado_en || p.creado_en);
    const fecha = new Date(String(referencia));
    return !isNaN(fecha.getTime()) && fecha < corte;
  });
  if (!viejas.length) return { purgadas: 0 };

  // Los archivos se retiran fuera del bloqueo (RN-16).
  let archivos = 0;
  viejas.forEach(function (p) {
    fromJson(p.fotos_json, []).forEach(function (f) {
      [f.drive_file_id, f.mini_file_id].forEach(function (id) {
        if (!id) return;
        try { DriveApp.getFileById(id).setTrashed(true); archivos++; } catch (e) { /* ya no existe */ }
      });
    });
  });

  return conBloqueo(function () {
    limpiarCache('propuestas');
    let purgadas = 0;
    viejas.forEach(function (p) {
      const fresca = buscarPorId('propuestas', p.id);
      if (!fresca || fresca.actividad_id || fresca.fotos_purgadas_en) return;
      actualizarFotosPurgadas_(fresca, hoy);
      purgadas++;
    });
    return { purgadas: purgadas, archivos: archivos };
  });
}

function actualizarFotosPurgadas_(p, hoy) {
  actualizar('propuestas', p.id, { fotos_json: '[]', fotos_purgadas_en: hoy }, 'sistema');
  auditar('sistema', 'PROPUESTA_FOTOS_PURGADAS', 'propuesta', p.id, null,
    { titulo: p.titulo, estado: p.estado, motivo: p.motivo_rechazo || '' });
}
