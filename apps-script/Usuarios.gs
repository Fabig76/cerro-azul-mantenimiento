/**
 * Usuarios.gs — activación, roles y asignación de secciones (SPEC v1.2, sec. 6.1 y RN-01).
 * Solo el administrador activa usuarios, cambia roles y asigna nodos.
 */

function usuarioResumen_(u) {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    telefono: u.telefono || '',
    rol: u.rol,
    estado: u.estado,
    empresa_id: u.empresa_id || '',
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
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');
  if (String(u.estado) === 'ACTIVO') fallar_('ESTADO_INVALIDO', 'Ese usuario ya está activo.');

  const rol = exigirEnEnum(payload.rol || 'CONTRATISTA', 'rol', ['CONTRATISTA', 'SUPERVISOR', 'ADMIN']);
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
    cambios.rol = exigirEnEnum(payload.rol, 'rol', ['CONTRATISTA', 'SUPERVISOR', 'ADMIN']);
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

/** Empresas contratistas disponibles para asignar. */
function empresasListar(ctx) {
  return {
    empresas: filtrar('empresas', function (e) { return bool(e.activo) }).map(function (e) {
      return {
        id: e.id, razon_social: e.razon_social, nit: e.nit,
        vigencia_hasta: e.vigencia_hasta || '', poliza_vence: e.poliza_vence || '',
        vencida: !!(e.vigencia_hasta && String(e.vigencia_hasta) < hoyIso()),
      };
    }),
  };
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
