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
    procesarNotificaciones(25);
  } catch (e) {
    console.error('cola de correos: ' + e.message);
  }
}
