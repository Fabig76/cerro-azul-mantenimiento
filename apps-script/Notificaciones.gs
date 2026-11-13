/**
 * Notificaciones.gs — cola de correos (RN-20).
 * La acción solo escribe la fila; el envío ocurre después, agrupado por usuario y
 * como máximo cada 5 minutos. Una caída de MailApp nunca tumba la operación.
 */

const NOMBRE_REMITENTE = 'Cerro Azul — Mantenimientos';

function encolar_(usuarioId, tipo, entidadId) {
  if (!usuarioId) return null;
  const yaPendiente = filtrar('notificaciones', function (n) {
    return String(n.usuario_id) === String(usuarioId) && String(n.tipo) === tipo &&
      String(n.entidad_id) === String(entidadId || '') && String(n.estado) === 'PENDIENTE';
  })[0];
  if (yaPendiente) return yaPendiente;

  return insertar('notificaciones', {
    id: newId('NOT'),
    fecha: ahoraIso(),
    usuario_id: usuarioId,
    tipo: tipo,
    entidad_id: entidadId || '',
    estado: 'PENDIENTE',
    intentos: 0,
    enviado_en: '',
    error: '',
  }, 'sistema');
}

/** Arma el texto del correo según el tipo y su entidad. */
function textoNotificacion_(tipo, entidadId) {
  const base = origenPortal().replace('/app.html', '');
  if (tipo === 'ACTIVIDAD_ASIGNADA' || tipo === 'RECORDATORIO') {
    const a = buscarPorId('actividades', entidadId);
    if (!a) return null;
    const nodo = buscarPorId('nodos', a.nodo_id);
    return {
      asunto: (tipo === 'RECORDATORIO' ? 'Recordatorio: ' : 'Actividad asignada: ') + a.titulo,
      cuerpo: [
        'Actividad: ' + a.titulo,
        'Sección: ' + (nodo ? nodo.codigo + ' · ' + nodo.nombre : '—'),
        'Fecha límite: ' + fechaIso_(a.fecha_fin_plan),
        '',
        'Ingresa al portal para verla: ' + base + '/app.html',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  if (tipo === 'ACTIVIDAD_HOY' || tipo === 'ACTIVIDAD_VENCIDA') {
    const a = buscarPorId('actividades', entidadId);
    if (!a) return null;
    const nodo = buscarPorId('nodos', a.nodo_id);
    const vencida = tipo === 'ACTIVIDAD_VENCIDA';
    return {
      asunto: (vencida ? 'Trabajo vencido: ' : 'Hoy empieza: ') + a.titulo,
      cuerpo: [
        (vencida
          ? 'Este trabajo debía terminar el ' + fechaIso_(a.fecha_fin_plan) + ' y sigue abierto.'
          : 'Este trabajo empieza hoy.'),
        'Actividad: ' + a.titulo,
        'Sección: ' + (nodo ? nodo.codigo + ' · ' + nodo.nombre : '—'),
        'Fechas: ' + fechaIso_(a.fecha_inicio_plan) + ' → ' + fechaIso_(a.fecha_fin_plan),
        a.responsable_id ? '' : 'Este trabajo no tiene responsable asignado.',
        '',
        'Ábrelo aquí: ' + base + '/app.html#/actividades',
        '',
        'Administración — Urbanización Cerro Azul',
      ].filter(Boolean).join('\n'),
    };
  }
  if (tipo === 'EMPRESA_POR_VENCER') {
    const e = buscarPorId('empresas', entidadId);
    if (!e) return null;
    const fechas = [];
    if (e.vigencia_hasta) fechas.push('Contrato: vence el ' + fechaIso_(e.vigencia_hasta));
    if (e.poliza_vence) fechas.push('Póliza: vence el ' + fechaIso_(e.poliza_vence));
    return {
      asunto: 'Contrato o póliza por vencer: ' + e.razon_social,
      cuerpo: [
        'La empresa ' + e.razon_social + (e.nit ? ' (NIT ' + e.nit + ')' : '') + ' tiene un vencimiento próximo.',
        fechas.join('\n'),
        '',
        'Con el contrato vencido no se le pueden asignar trabajos nuevos (RN-18).',
        'Revísalo aquí: ' + base + '/app.html#/empresas',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  if (tipo === 'REPORTE_RECHAZADO') {
    const r = buscarPorId('reportes', entidadId);
    if (!r) return null;
    const a = buscarPorId('actividades', r.actividad_id);
    return {
      asunto: 'Tu reporte fue rechazado: ' + (a ? a.titulo : ''),
      cuerpo: [
        'El reporte de la actividad "' + (a ? a.titulo : '') + '" fue rechazado.',
        'Motivo: ' + (r.comentario_admin || '(sin detalle)'),
        '',
        'Corrige y vuelve a enviarlo: ' + base + '/app.html',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  if (tipo === 'CUENTA_ACTIVADA') {
    return {
      asunto: 'Tu acceso al portal de mantenimientos está activo',
      cuerpo: [
        'Tu cuenta ya está activa. Puedes ingresar con este correo.',
        '',
        base + '/app.html',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  if (tipo === 'REPORTE_REENVIADO') {
    const a = buscarPorId('actividades', entidadId);
    if (!a) return null;
    const nodo = buscarPorId('nodos', a.nodo_id);
    return {
      asunto: 'Reenvío pendiente de revisión: ' + a.titulo,
      cuerpo: [
        'El contratista corrigió y volvió a enviar un trabajo que había sido rechazado.',
        'Actividad: ' + a.titulo,
        'Sección: ' + (nodo ? nodo.codigo + ' · ' + nodo.nombre : '—'),
        '',
        'Revísalo aquí: ' + base + '/app.html#/actividades',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  if (tipo === 'PROPUESTA_NUEVA' || tipo === 'PROPUESTA_APROBADA' || tipo === 'PROPUESTA_RECHAZADA') {
    const p = buscarPorId('propuestas', entidadId);
    if (!p) return null;
    const nodo = buscarPorId('nodos', p.nodo_id);
    const autor = buscarPorId('usuarios', p.propuesta_por);
    const seccion = nodo ? nodo.codigo + ' · ' + nodo.nombre : '—';

    if (tipo === 'PROPUESTA_NUEVA') {
      return {
        asunto: 'Nueva propuesta de actividad: ' + p.titulo,
        cuerpo: [
          'Un contratista propuso una actividad.',
          'Título: ' + p.titulo,
          'Sección: ' + seccion,
          'Propone: ' + (autor ? (autor.nombre || autor.email) : '—'),
          '',
          'Revísala aquí: ' + base + '/app.html#/actividades',
          '',
          'Administración — Urbanización Cerro Azul',
        ].join('\n'),
      };
    }

    if (tipo === 'PROPUESTA_APROBADA') {
      const ajustes = fromJson(p.ajustes_json, {});
      const cambiados = Object.keys(ajustes);
      return {
        asunto: 'Tu propuesta fue aprobada: ' + p.titulo,
        cuerpo: [
          'La administración aprobó tu propuesta y creó la actividad.',
          'Sección: ' + seccion,
          'Fecha de inicio: ' + fechaIso_(p.fecha_inicio_sugerida),
          cambiados.length ? 'La administración ajustó: ' + cambiados.join(', ') : '',
          '',
          'Ábrela aquí: ' + base + '/app.html#/actividades',
          '',
          'Administración — Urbanización Cerro Azul',
        ].filter(Boolean).join('\n'),
      };
    }

    return {
      asunto: 'Tu propuesta no fue aprobada: ' + p.titulo,
      cuerpo: [
        'La administración revisó tu propuesta y no la aprobó.',
        'Sección: ' + seccion,
        'Motivo: ' + (p.motivo_rechazo || '(sin detalle)'),
        '',
        'Puedes proponer otra cuando quieras: ' + base + '/app.html#/actividades',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  if (tipo === 'USUARIO_NUEVO') {
    return {
      asunto: 'Nuevo registro esperando activación',
      cuerpo: [
        'Hay una persona registrada esperando que la actives en el portal.',
        '',
        base + '/app.html#/usuarios',
        '',
        'Administración — Urbanización Cerro Azul',
      ].join('\n'),
    };
  }
  return null;
}

/** Envía los pendientes, uno por usuario. Devuelve el resumen. */
function procesarNotificaciones(limite) {
  const maximo = limite || 25;
  const pendientes = filtrar('notificaciones', function (n) { return String(n.estado) === 'PENDIENTE'; })
    .slice(0, maximo);
  if (!pendientes.length) return { enviados: 0, errores: 0 };

  const porUsuario = {};
  pendientes.forEach(function (n) {
    (porUsuario[n.usuario_id] = porUsuario[n.usuario_id] || []).push(n);
  });

  let enviados = 0;
  let errores = 0;
  Object.keys(porUsuario).forEach(function (usuarioId) {
    const usuario = buscarPorId('usuarios', usuarioId);
    const lote = porUsuario[usuarioId];
    if (!usuario || !usuario.email) {
      lote.forEach(function (n) { actualizar('notificaciones', n.id, { estado: 'ERROR', error: 'sin correo' }, 'sistema'); });
      errores += lote.length;
      return;
    }

    const partes = lote.map(function (n) { return textoNotificacion_(n.tipo, n.entidad_id); }).filter(Boolean);
    if (!partes.length) {
      lote.forEach(function (n) { actualizar('notificaciones', n.id, { estado: 'ERROR', error: 'sin contenido' }, 'sistema'); });
      errores += lote.length;
      return;
    }

    const asunto = partes.length === 1 ? partes[0].asunto : partes.length + ' novedades en el portal de mantenimientos';
    const cuerpo = partes.map(function (p) { return p.cuerpo; }).join('\n\n---\n\n');

    try {
      MailApp.sendEmail({ to: usuario.email, subject: asunto, body: cuerpo, name: NOMBRE_REMITENTE });
      lote.forEach(function (n) {
        actualizar('notificaciones', n.id, {
          estado: 'ENVIADO', enviado_en: ahoraIso(), intentos: Number(n.intentos || 0) + 1,
        }, 'sistema');
      });
      enviados += lote.length;
    } catch (e) {
      lote.forEach(function (n) {
        actualizar('notificaciones', n.id, {
          estado: Number(n.intentos || 0) >= 2 ? 'ERROR' : 'PENDIENTE',
          intentos: Number(n.intentos || 0) + 1,
          error: String(e.message || e).slice(0, 200),
        }, 'sistema');
      });
      errores += lote.length;
    }
  });

  return { enviados: enviados, errores: errores };
}

/**
 * Se llama después de cada acción: envía como máximo una vez cada 5 minutos.
 * Sustituye al disparador sin exigir permisos adicionales.
 */
function quizasEnviarCorreos_() {
  try {
    if (cacheGet('correo:ventana')) return;
    cachePut('correo:ventana', '1', 300);
    // Sin bloqueo, dos acciones simultáneas podían leer las mismas filas y enviar dos veces.
    const bloqueo = LockService.getScriptLock();
    if (!bloqueo.tryLock(1000)) return;
    try {
      procesarNotificaciones(25);
    } finally {
      bloqueo.releaseLock();
    }
  } catch (e) {
    console.error('cola de correos: ' + e.message);
  }
}

/** Estado del sistema para el panel: cola de correos y disparadores instalados. */
function sistemaEstado(ctx) {
  const correos = correosPendientes_();
  let disparadores = [];
  try {
    disparadores = ScriptApp.getProjectTriggers().map(function (t) {
      return t.getHandlerFunction();
    });
  } catch (e) {
    disparadores = [];
  }
  const esperados = ['regenerarSnapshot', 'recalcularTodoDiario', 'despacharCorreos', 'avisosDiariosDisparador'];
  return {
    correos: correos,
    disparadores: disparadores,
    faltan: esperados.filter(function (f) { return disparadores.indexOf(f) < 0; }),
  };
}

/** Resumen de la cola para la pestaña Sistema del panel. */
function correosPendientes_() {
  let pendientes = 0;
  let errores = 0;
  filtrar('notificaciones', function (n) {
    if (String(n.estado) === 'PENDIENTE') pendientes++;
    if (String(n.estado) === 'ERROR') errores++;
    return false;
  });
  return { pendientes: pendientes, errores: errores };
}

/**
 * ¿Ya se avisó de esto alguna vez? Los avisos diarios no se repiten aunque
 * la fila ya se haya enviado: se busca en cualquier estado.
 */
function yaAvisado_(usuarioId, tipo, entidadId) {
  return !!filtrar('notificaciones', function (n) {
    return String(n.usuario_id) === String(usuarioId) && String(n.tipo) === tipo &&
      String(n.entidad_id) === String(entidadId || '');
  })[0];
}

/** Encola solo si no se ha avisado antes. */
function encolarUnaVez_(usuarioId, tipo, entidadId) {
  if (!usuarioId) return false;
  if (yaAvisado_(usuarioId, tipo, entidadId)) return false;
  encolar_(usuarioId, tipo, entidadId);
  return true;
}

/**
 * Avisos diarios: recordatorio, empieza hoy, vencida y contrato por vencer.
 * Cada paso va aparte: si uno falla, los demás siguen.
 */
function avisosDiarios_() {
  const hoy = hoyIso();
  const ayer = sumarDias(hoy, -1);
  const resumen = { recordatorio: 0, hoy: 0, vencidas: 0, empresas: 0 };
  const admins = adminsEmails_().map(function (correo) {
    const u = usuarioPorEmail_(correo);
    return u ? u.id : '';
  }).filter(Boolean);

  const abiertas = filtrar('actividades', function (a) {
    return bool(a.activo) && ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA', 'RECHAZADA'].indexOf(String(a.estado)) >= 0;
  });

  // 1. Recordatorio: empieza dentro de los días configurados
  try {
    const dias = configNumero('recordatorio_dias', 1);
    abiertas.forEach(function (a) {
      if (String(a.estado) !== 'PROGRAMADA') return;
      if (fechaIso_(a.fecha_inicio_plan) !== sumarDias(hoy, dias)) return;
      const destino = a.responsable_id ? [a.responsable_id] : admins;
      destino.forEach(function (u) { if (encolarUnaVez_(u, 'RECORDATORIO', a.id)) resumen.recordatorio++; });
    });
  } catch (e) { console.error('aviso recordatorio: ' + e.message); }

  // 2. Empieza hoy
  try {
    abiertas.forEach(function (a) {
      if (String(a.estado) !== 'PROGRAMADA') return;
      if (fechaIso_(a.fecha_inicio_plan) !== hoy) return;
      const destino = a.responsable_id ? [a.responsable_id] : admins;
      destino.forEach(function (u) { if (encolarUnaVez_(u, 'ACTIVIDAD_HOY', a.id)) resumen.hoy++; });
    });
  } catch (e) { console.error('aviso de hoy: ' + e.message); }

  // 3. Venció ayer y sigue abierta
  try {
    abiertas.forEach(function (a) {
      if (fechaIso_(a.fecha_fin_plan) !== ayer) return;
      const destino = (a.responsable_id ? [a.responsable_id] : []).concat(admins);
      destino.forEach(function (u) { if (encolarUnaVez_(u, 'ACTIVIDAD_VENCIDA', a.id)) resumen.vencidas++; });
    });
  } catch (e) { console.error('aviso de vencida: ' + e.message); }

  // 4. Contrato o póliza por vencer
  try {
    const diasAviso = configNumero('dias_aviso_poliza', 30);
    const limite = sumarDias(hoy, diasAviso);
    filtrar('empresas', function (e) { return bool(e.activo); }).forEach(function (e) {
      const fechas = [e.vigencia_hasta, e.poliza_vence].filter(function (f) {
        return f && fechaIso_(f) >= hoy && fechaIso_(f) <= limite;
      });
      if (!fechas.length) return;
      // Se guarda la fecha más próxima avisada: si cambia, vuelve a avisarse.
      const proxima = fechas.sort()[0];
      if (String(e.aviso_vencimiento_en || '') === proxima) return;
      admins.forEach(function (u) { encolarUnaVez_(u, 'EMPRESA_POR_VENCER', e.id); });
      actualizar('empresas', e.id, { aviso_vencimiento_en: proxima }, 'sistema');
      resumen.empresas++;
    });
  } catch (e) { console.error('aviso de empresa: ' + e.message); }

  return resumen;
}

/** Envía la cola aunque nadie use el portal. */
function despacharCorreos() {
  const bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(1000)) return { enviados: 0, saltado: true };
  try {
    const restantes = MailApp.getRemainingDailyQuota();
    if (restantes < 10) {
      console.warn('Cuota de correo casi agotada (' + restantes + '). No se envía nada.');
      return { enviados: 0, cuota: restantes };
    }
    return procesarNotificaciones(25);
  } finally {
    bloqueo.releaseLock();
  }
}

/**
 * «Novedades para usted»: lo que le pasó al usuario en los últimos días, para verlo
 * al entrar sin depender del correo. Solo lectura y solo lo suyo.
 */
function notificacionesMias(ctx, payload) {
  const dias = Math.min(Math.max(Number(payload && payload.dias) || 15, 1), 60);
  const desde = new Date(Date.now() - dias * 86400000);

  const mias = filtrar('notificaciones', function (n) {
    if (String(n.usuario_id) !== String(ctx.usuario.id)) return false;
    const fecha = new Date(String(n.fecha));
    return !isNaN(fecha.getTime()) && fecha >= desde;
  }).sort(function (a, b) { return String(b.fecha) < String(a.fecha) ? -1 : 1; }).slice(0, 30);

  const ETIQUETA = {
    ACTIVIDAD_ASIGNADA: 'Te asignaron un trabajo',
    ACTIVIDAD_HOY: 'Hoy empieza un trabajo',
    ACTIVIDAD_VENCIDA: 'Un trabajo se venció',
    RECORDATORIO: 'Recordatorio de un trabajo',
    REPORTE_APROBADO: 'Aprobaron tu reporte',
    REPORTE_RECHAZADO: 'Devolvieron tu reporte',
    REPORTE_REENVIADO: 'Reenviaste un reporte',
    PROPUESTA_NUEVA: 'Recibimos tu propuesta',
    PROPUESTA_APROBADA: 'Aprobaron tu propuesta',
    PROPUESTA_RECHAZADA: 'No aprobaron tu propuesta',
    USUARIO_NUEVO: 'Se creó tu usuario',
  };

  return {
    novedades: mias.map(function (n) {
      const tipo = String(n.tipo);
      const act = /^ACTIVIDAD_|^RECORDATORIO|^REPORTE_/.test(tipo) && n.entidad_id
        ? buscarPorId('actividades', n.entidad_id) : null;
      const prop = tipo.indexOf('PROPUESTA_') === 0 && n.entidad_id
        ? buscarPorId('propuestas', n.entidad_id) : null;
      return {
        id: n.id,
        tipo: tipo,
        etiqueta: ETIQUETA[tipo] || 'Novedad',
        titulo: act ? act.titulo : (prop ? prop.titulo : ''),
        entidad_id: n.entidad_id || '',
        fecha: n.fecha,
      };
    }),
    desde: desde.toISOString(),
  };
}
