/**
 * Usuarios.gs — activación, roles y asignación de secciones (SPEC v1.2, sec. 6.1 y RN-01).
 * Solo el administrador activa usuarios, cambia roles y asigna nodos.
 */

function usuarioResumen_(u) {
  const empresa = u.empresa_id ? buscarPorId('empresas', u.empresa_id) : null;
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    telefono: u.telefono || '',
    rol: u.rol,
    estado: u.estado,
    empresa_id: u.empresa_id || '',
    // Sin el nombre de la empresa, la lista de usuarios no dice a quién pertenece cada uno.
    empresa: empresa ? empresa.razon_social : '',
    empresa_activa: empresa ? bool(empresa.activo) : false,
    ultimo_acceso: u.ultimo_acceso || '',
    acepto_datos_version: u.acepto_datos_version || '',
  };
}

function asignacionesDe_(usuarioId) {
  const hoy = hoyIso();
  return filtrar('asignaciones', function (a) {
    if (String(a.usuario_id) !== String(usuarioId)) return false;
    if (a.hasta && String(a.hasta) < hoy) return false;
    return bool(a.activo);
  }).map(function (a) {
    const n = buscarPorId('nodos', a.nodo_id);
    return { id: a.id, nodo_id: a.nodo_id, codigo: n ? n.codigo : '', nombre: n ? n.nombre : '' };
  });
}

/** Lista de usuarios con sus secciones. Solo ADMIN. */
function usuariosListar(ctx, payload) {
  const estado = payload.estado ? String(payload.estado).toUpperCase() : null;
  const lista = filas('usuarios')
    .filter(function (u) { return !u.suprimido_en; })
    .filter(function (u) { return !estado || String(u.estado) === estado; })
    .map(function (u) {
      const r = usuarioResumen_(u);
      r.asignaciones = asignacionesDe_(u.id);
      return r;
    });

  const conteo = { PENDIENTE: 0, ACTIVO: 0, INACTIVO: 0 };
  filas('usuarios').forEach(function (u) {
    if (conteo[String(u.estado)] !== undefined) conteo[String(u.estado)] += 1;
  });

  return { usuarios: lista, conteo: conteo };
}

/** Activa a un usuario, le fija el rol y la empresa. */
function usuariosActivar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');
  if (String(u.estado) === 'ACTIVO') fallar_('ESTADO_INVALIDO', 'Ese usuario ya está activo.');

  const rol = exigirEnEnum(payload.rol || 'CONTRATISTA', 'rol', ['CONTRATISTA', 'SUPERVISOR', 'ADMIN', 'CONSEJO']);
  const empresaId = payload.empresa_id || '';
  if (empresaId && !buscarPorId('empresas', empresaId)) fallar_('VALIDACION', 'La empresa no existe.');
  if (rol === 'CONTRATISTA' && !empresaId) {
    fallar_('VALIDACION', 'Un contratista debe quedar asociado a una empresa.');
  }

  const despues = actualizar('usuarios', id, {
    estado: 'ACTIVO',
    rol: rol,
    empresa_id: empresaId,
    inactivo_desde: '',
  }, ctx.usuario.email);

  encolar_(id, 'CUENTA_ACTIVADA', id);
  auditar(ctx.usuario.email, 'USUARIO_ACTIVADO', 'usuario', id,
    { estado: u.estado }, { estado: 'ACTIVO', rol: rol, empresa: empresaId });
  return { usuario: usuarioResumen_(despues) };
}

/** Cambia datos del usuario sin tocar el estado. */
function usuariosEditar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');

  const cambios = {};
  if (payload.nombre !== undefined) cambios.nombre = exigirTexto(payload.nombre, 'nombre', 120);
  if (payload.telefono !== undefined) cambios.telefono = String(payload.telefono || '').slice(0, 30);
  if (payload.rol !== undefined) {
    cambios.rol = exigirEnEnum(payload.rol, 'rol', ['CONTRATISTA', 'SUPERVISOR', 'ADMIN', 'CONSEJO']);
    if (String(cambios.rol) !== String(u.rol)) {
      // Cambiar el rol revoca sesiones (RN-19).
      revocarSesiones_(id, ctx.usuario.email);
    }
  }
  if (payload.empresa_id !== undefined) cambios.empresa_id = payload.empresa_id || '';
  if (!Object.keys(cambios).length) fallar_('VALIDACION', 'No hay cambios para guardar.');

  const despues = actualizar('usuarios', id, cambios, ctx.usuario.email);
  auditar(ctx.usuario.email, 'USUARIO_EDITADO', 'usuario', id, { rol: u.rol }, cambios);
  return { usuario: usuarioResumen_(despues) };
}

/** Reemplaza las secciones asignadas (el acceso incluye todo el subárbol). */
function usuariosAsignar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');
  if (String(u.estado) !== 'ACTIVO') fallar_('ESTADO_INVALIDO', 'Primero activa al usuario.');

  const nodos = Array.isArray(payload.nodo_ids) ? payload.nodo_ids : [];
  nodos.forEach(function (n) {
    if (!buscarPorId('nodos', n)) fallar_('VALIDACION', 'Una de las secciones no existe.');
  });

  const hoy = hoyIso();
  const anteriores = asignacionesDe_(id);
  anteriores.forEach(function (a) {
    actualizar('asignaciones', a.id, { hasta: hoy, activo: false }, ctx.usuario.email);
  });

  if (nodos.length) {
    insertarVarias('asignaciones', nodos.map(function (nodoId) {
      return {
        id: newId('ASI'),
        usuario_id: id,
        nodo_id: nodoId,
        desde: hoy,
        hasta: '',
        activo: true,
      };
    }), ctx.usuario.email);
  }

  auditar(ctx.usuario.email, 'USUARIO_ASIGNADO', 'usuario', id,
    { antes: anteriores.length }, { nodos: nodos });
  return { usuario: usuarioResumen_(u), asignaciones: asignacionesDe_(id) };
}

/** Desactiva al usuario y revoca sus sesiones. */
function usuariosDesactivar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');
  if (String(u.email).toLowerCase() === String(ctx.usuario.email).toLowerCase()) {
    fallar_('VALIDACION', 'No puedes desactivar tu propia cuenta.');
  }

  const sesiones = revocarSesiones_(id, ctx.usuario.email);
  const hoy = hoyIso();
  asignacionesDe_(id).forEach(function (a) {
    actualizar('asignaciones', a.id, { hasta: hoy, activo: false }, ctx.usuario.email);
  });
  const despues = actualizar('usuarios', id, {
    estado: 'INACTIVO',
    inactivo_desde: hoy,
  }, ctx.usuario.email);

  auditar(ctx.usuario.email, 'USUARIO_DESACTIVADO', 'usuario', id,
    { estado: u.estado }, { estado: 'INACTIVO', sesiones_revocadas: sesiones });
  return { usuario: usuarioResumen_(despues) };
}

/**
 * Empresas contratistas. Sin `todas` devuelve solo las activas (es lo que necesitan
 * los formularios de asignación); con `todas` devuelve la ficha completa para
 * administrarlas desde la pestaña Empresas.
 */
function empresasListar(ctx, payload) {
  const todas = !!(payload && payload.todas);
  return {
    empresas: filtrar('empresas', function (e) { return todas || bool(e.activo); })
      .sort(function (a, b) {
        const activaA = bool(a.activo) ? 0 : 1;
        const activaB = bool(b.activo) ? 0 : 1;
        if (activaA !== activaB) return activaA - activaB;
        return String(a.razon_social).localeCompare(String(b.razon_social));
      })
      .map(function (e) {
        const usuarios = filtrar('usuarios', function (u) {
          return !u.suprimido_en && String(u.empresa_id) === String(e.id);
        });
        const esConsejo = ctx && ctx.rol === 'CONSEJO';
        return {
          id: e.id, razon_social: e.razon_social, nit: e.nit,
          // RN-42: el consejo no necesita los datos de contacto de las empresas.
          contacto: esConsejo ? undefined : (e.contacto || ''),
          email: esConsejo ? undefined : (e.email || ''),
          telefono: esConsejo ? undefined : (e.telefono || ''),
          contrato_numero: e.contrato_numero || '',
          vigencia_desde: e.vigencia_desde || '', vigencia_hasta: e.vigencia_hasta || '',
          poliza_vence: e.poliza_vence || '',
          estado: e.estado || '', activo: bool(e.activo),
          usuarios: usuarios.length,
          vencida: !!(e.vigencia_hasta && String(e.vigencia_hasta) < hoyIso()),
        };
      }),
  };
}

/**
 * Activa o desactiva una empresa. No se desactiva con trabajo en curso: dejaría
 * actividades asignadas a una empresa invisible.
 */
function empresasEstado(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const activo = !!payload.activo;
  const e = buscarPorId('empresas', id);
  if (!e) fallar_('NO_ENCONTRADO', 'La empresa no existe.');

  if (!activo) {
    // RECHAZADA también cuenta: el contratista todavía tiene que corregirla.
    const abiertas = filtrar('actividades', function (a) {
      if (!bool(a.activo)) return false;
      if (String(a.empresa_id) !== String(id)) return false;
      return ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA', 'RECHAZADA'].indexOf(String(a.estado)) >= 0;
    });
    if (abiertas.length) {
      fallar_('CONFLICTO', 'La empresa tiene ' + abiertas.length +
        ' trabajo(s) sin cerrar. Termínalos o reasígnalos antes de desactivarla.');
    }

    const recurrencias = filtrar('recurrencias', function (r) {
      return bool(r.activo) && String(r.empresa_id) === String(id);
    });
    if (recurrencias.length) {
      fallar_('CONFLICTO', 'La empresa tiene ' + recurrencias.length +
        ' plan(es) recurrente(s) activo(s). Páusalos o cámbialos de empresa antes de desactivarla.');
    }

    const pendientes = filtrar('propuestas', function (p) {
      if (!bool(p.activo) || String(p.estado) !== 'PENDIENTE') return false;
      const u = buscarPorId('usuarios', p.usuario_id);
      return u && String(u.empresa_id) === String(id);
    });
    if (pendientes.length) {
      fallar_('CONFLICTO', 'La empresa tiene ' + pendientes.length +
        ' propuesta(s) sin responder. Resuélvelas antes de desactivarla.');
    }
  }

  const despues = actualizar('empresas', id, {
    activo: activo,
    estado: activo ? 'ACTIVA' : 'INACTIVA',
  }, ctx.usuario.email);

  // Opcional: apagar también a su gente, para que no sigan entrando a trabajar.
  let usuariosApagados = 0;
  if (!activo && payload.desactivar_usuarios) {
    filtrar('usuarios', function (u) {
      return !u.suprimido_en && String(u.empresa_id) === String(id) && String(u.estado) === 'ACTIVO';
    }).forEach(function (u) {
      actualizar('usuarios', u.id, { estado: 'INACTIVO', inactivo_desde: ahoraIso() }, ctx.usuario.email);
      usuariosApagados++;
    });
  }

  auditar(ctx.usuario.email, activo ? 'EMPRESA_ACTIVADA' : 'EMPRESA_DESACTIVADA', 'empresa', id,
    { activo: bool(e.activo) }, { activo: activo, usuarios_apagados: usuariosApagados });
  return { empresa: { id: despues.id, activo: bool(despues.activo) }, usuarios_apagados: usuariosApagados };
}

function empresasGuardar(ctx, payload) {
  const razon = exigirTexto(payload.razon_social, 'razon_social', 160);
  const cambios = {
    razon_social: razon,
    nit: payload.nit ? String(payload.nit).slice(0, 30) : '',
    contacto: payload.contacto ? String(payload.contacto).slice(0, 120) : '',
    email: payload.email ? String(payload.email).slice(0, 160) : '',
    telefono: payload.telefono ? String(payload.telefono).slice(0, 40) : '',
    contrato_numero: payload.contrato_numero ? String(payload.contrato_numero).slice(0, 60) : '',
    vigencia_desde: payload.vigencia_desde || '',
    vigencia_hasta: payload.vigencia_hasta || '',
    poliza_vence: payload.poliza_vence || '',
    estado: 'ACTIVA',
  };

  if (payload.id) {
    const e = buscarPorId('empresas', payload.id);
    if (!e) fallar_('NO_ENCONTRADO', 'La empresa no existe.');
    const despues = actualizar('empresas', payload.id, cambios, ctx.usuario.email);
    auditar(ctx.usuario.email, 'EMPRESA_EDITADA', 'empresa', payload.id, e, cambios);
    return { empresa: despues };
  }
  const nueva = insertar('empresas', Object.assign({ id: newId('EMP'), activo: true }, cambios), ctx.usuario.email);
  auditar(ctx.usuario.email, 'EMPRESA_CREADA', 'empresa', nueva.id, null, cambios);
  return { empresa: nueva };
}
