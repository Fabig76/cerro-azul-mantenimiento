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
  return conBloqueo(function () {
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');
  if (String(u.estado) === 'ACTIVO') fallar_('ESTADO_INVALIDO', 'Ese usuario ya está activo.');

  const rol = exigirEnEnum(payload.rol || 'CONTRATISTA', 'rol', ['CONTRATISTA', 'SUPERVISOR', 'ADMIN', 'CONSEJO']);
  const empresaId = payload.empresa_id || '';
  if (empresaId) {
    const emp = buscarPorId('empresas', empresaId);
    if (!emp || emp.suprimida_en) fallar_('VALIDACION', 'La empresa no existe.');
  }
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
  });
}

/** Cambia datos del usuario sin tocar el estado. */
function usuariosEditar(ctx, payload) {
  return conBloqueo(function () {
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
  });
}

/** Reemplaza las secciones asignadas (el acceso incluye todo el subárbol). */
function usuariosAsignar(ctx, payload) {
  desdePortal_(payload);
  return conBloqueo(function () {
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
  });
}

/** Desactiva al usuario y revoca sus sesiones. */
function usuariosDesactivar(ctx, payload) {
  desdePortal_(payload);
  return conBloqueo(function () {
  limpiarCache('usuarios');
  const id = exigirTexto(payload.id, 'id');
  const u = buscarPorId('usuarios', id);
  if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');
  if (String(u.email).toLowerCase() === String(ctx.usuario.email).toLowerCase()) {
    fallar_('VALIDACION', 'No puedes desactivar tu propia cuenta.');
  }

  // U2 · Qué queda a su nombre: trabajos abiertos y planes que lo tienen de responsable.
  const abiertos = filtrar('actividades', function (a) {
    return String(a.responsable_id) === String(id) && bool(a.activo) &&
      ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA', 'RECHAZADA'].indexOf(String(a.estado)) >= 0;
  });
  const planes = filtrar('recurrencias', function (r) {
    return bool(r.activo) && bool(r.activa) && String(r.responsable_id) === String(id);
  });

  const destino = payload.reasignar_a ? String(payload.reasignar_a) : '';
  if ((abiertos.length || planes.length) && !destino) {
    fallar_('CONFLICTO', 'Tiene ' + abiertos.length + ' trabajo(s) abierto(s) y ' +
      planes.length + ' plan(es). Elija a quién se los pasa antes de desactivarlo.');
  }
  if (destino) {
    const otro = buscarPorId('usuarios', destino);
    if (!otro || !bool(otro.activo) || String(otro.estado) !== 'ACTIVO') {
      fallar_('VALIDACION', 'La persona a la que se reasigna no está activa.');
    }
    if (String(otro.id) === String(id)) fallar_('VALIDACION', 'No puede reasignarse a sí mismo.');
    abiertos.forEach(function (a) {
      actualizar('actividades', a.id, { responsable_id: destino }, ctx.usuario.email);
    });
    planes.forEach(function (r) {
      actualizar('recurrencias', r.id, { responsable_id: destino }, ctx.usuario.email);
    });
  }

  const despues = actualizar('usuarios', id, { estado: 'INACTIVO' }, ctx.usuario.email);
  revocarSesiones_(id, ctx.usuario.email);
  auditar(ctx.usuario.email, 'USUARIO_DESACTIVADO', 'usuario', id, { estado: u.estado },
    { estado: 'INACTIVO', reasignados: abiertos.length + planes.length, a: destino });
  return {
    usuario: despues,
    reasignados: { trabajos: abiertos.length, planes: planes.length, a: destino },
  };
  });
}


/**
 * Empresas contratistas. Sin `todas` devuelve solo las activas (es lo que necesitan
 * los formularios de asignación); con `todas` devuelve la ficha completa para
 * administrarlas desde la pestaña Empresas.
 */
function empresasListar(ctx, payload) {
  const todas = !!(payload && payload.todas);
  return {
    // RN-58 · Una empresa eliminada no sale nunca, ni con «Ver también las inactivas».
    empresas: filtrar('empresas', function (e) {
      if (e.suprimida_en) return false;
      return todas || bool(e.activo);
    })
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
        // El historial se cuenta solo para quien puede eliminar: es lo que decide el botón.
        const h = (ctx && ctx.rol === 'ADMIN') ? historialEmpresa_(e.id) : null;
        return {
          historial: h,
          puede_eliminar: h ? (h.actividades + h.recurrencias + h.propuestas + h.usuarios) === 0 : false,
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
  return conBloqueo(function () {
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

    // La hoja propuestas tiene empresa_id; `usuario_id` no existe y esta revisión
    // nunca bloqueaba nada.
    const pendientes = filtrar('propuestas', function (p) {
      if (!bool(p.activo) || String(p.estado) !== 'PENDIENTE') return false;
      if (String(p.empresa_id || '') === String(id)) return true;
      const u = p.propuesta_por ? buscarPorId('usuarios', p.propuesta_por) : null;
      return !!u && String(u.empresa_id) === String(id);
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
  });
}

/** Solo los dígitos del NIT, sin puntos, espacios ni guion (RN-61). */
function soloDigitos_(valor) {
  return String(valor === undefined || valor === null ? '' : valor).replace(/[^0-9]/g, '');
}

/**
 * Qué cuelga de una empresa. La usan listar, eliminar y fusionar: una sola cuenta.
 */
function historialEmpresa_(id) {
  const cuenta = function (nombre, campo) {
    return filtrar(nombre, function (x) {
      return String(x[campo] || '') === String(id);
    }).length;
  };
  return {
    actividades: cuenta('actividades', 'empresa_id'),
    recurrencias: cuenta('recurrencias', 'empresa_id'),
    propuestas: cuenta('propuestas', 'empresa_id'),
    usuarios: filtrar('usuarios', function (u) {
      return String(u.empresa_id || '') === String(id) && !bool(u.suprimido_en);
    }).length,
  };
}

/**
 * RN-57 a RN-59 · Eliminar una empresa. Solo si no tiene historial; si tiene usuarios
 * y se pide, se desvinculan. La fila no se borra: queda suprimida y con su motivo.
 */
function empresasEliminar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const motivo = exigirTexto(payload.motivo, 'motivo', 500).trim();
  if (motivo.length < 10) fallar_('VALIDACION', 'Escribe el motivo (al menos 10 caracteres).');

  return conBloqueo(function () {
    limpiarCache('empresas');
    const e = buscarPorId('empresas', id);
    if (!e) fallar_('NO_ENCONTRADO', 'La empresa no existe.');
    if (e.suprimida_en) fallar_('ESTADO_INVALIDO', 'Esa empresa ya fue eliminada.');

    const h = historialEmpresa_(id);
    const conHistorial = h.actividades + h.recurrencias + h.propuestas;
    if (conHistorial > 0) {
      fallar_('CONFLICTO', 'Tiene ' + h.actividades + ' trabajos, ' + h.recurrencias + ' plan(es) y ' +
        h.propuestas + ' propuesta(s) en el historial. Para no perder el historial, desactívela o ' +
        'fusiónela con otra.');
    }
    if (h.usuarios > 0 && !payload.desvincular_usuarios) {
      fallar_('CONFLICTO', 'Tiene ' + h.usuarios + ' usuario(s) vinculado(s). Desvincúlelos y elimine, ' +
        'o fusiónela con otra empresa.');
    }

    if (h.usuarios > 0) {
      filtrar('usuarios', function (u) {
        return String(u.empresa_id || '') === String(id) && !bool(u.suprimido_en);
      }).forEach(function (u) {
        actualizar('usuarios', u.id, { empresa_id: '', estado: 'PENDIENTE' }, ctx.usuario.email);
      });
    }

    const despues = actualizar('empresas', id, {
      activo: false,
      estado: 'INACTIVA',
      suprimida_en: ahoraIso(),
      suprimida_por: ctx.usuario.email,
      motivo_supresion: motivo,
    }, ctx.usuario.email);

    marcarCambio('empresas');
    auditar(ctx.usuario.email, 'EMPRESA_ELIMINADA', 'empresa', id, e, { motivo: motivo });
    programarSnapshot_();
    return {
      empresa: { id: despues.id, razon_social: despues.razon_social, nit: despues.nit },
      desvinculados: h.usuarios,
    };
  });
}

/**
 * RN-60 · Fusionar la empresa repetida con la correcta: mueve usuarios, trabajos, planes
 * y propuestas, y luego suprime la de origen. El historial no se pierde.
 */
function empresasFusionar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const destinoId = exigirTexto(payload.destino_id, 'destino_id');
  const motivo = exigirTexto(payload.motivo, 'motivo', 500).trim();
  if (motivo.length < 10) fallar_('VALIDACION', 'Escribe el motivo (al menos 10 caracteres).');

  return conBloqueo(function () {
    limpiarCache('empresas');
    const origen = buscarPorId('empresas', id);
    const destino = buscarPorId('empresas', destinoId);
    if (!origen || origen.suprimida_en) fallar_('NO_ENCONTRADO', 'La empresa de origen no existe.');
    if (!destino || destino.suprimida_en) fallar_('NO_ENCONTRADO', 'La empresa de destino no existe.');
    if (String(id) === String(destinoId)) {
      fallar_('VALIDACION', 'No se puede fusionar una empresa consigo misma.');
    }
    if (!bool(destino.activo)) {
      fallar_('VALIDACION', 'La empresa de destino debe estar activa.');
    }

    const movidos = { usuarios: 0, actividades: 0, recurrencias: 0, propuestas: 0 };
    funcionMover_('usuarios', id, destinoId, movidos, 'usuarios');
    funcionMover_('actividades', id, destinoId, movidos, 'actividades');
    funcionMover_('recurrencias', id, destinoId, movidos, 'recurrencias');
    funcionMover_('propuestas', id, destinoId, movidos, 'propuestas');

    const despues = actualizar('empresas', id, {
      activo: false,
      estado: 'INACTIVA',
      suprimida_en: ahoraIso(),
      suprimida_por: ctx.usuario.email,
      motivo_supresion: 'Fusionada en ' + destino.razon_social + ': ' + motivo,
    }, ctx.usuario.email);

    auditar(ctx.usuario.email, 'EMPRESA_FUSIONADA', 'empresa', id,
      { razon_social: origen.razon_social, nit: origen.nit },
      { destino_id: destinoId, destino: destino.razon_social, movidos: movidos, motivo: motivo });

    marcarCambio('usuarios');
    marcarCambio('empresas');
    programarSnapshot_();
    return {
      empresa: { id: despues.id, razon_social: despues.razon_social },
      destino: { id: destino.id, razon_social: destino.razon_social },
      movidos: movidos,
    };
  });
}

/** Mueve las filas de una hoja que apuntan a la empresa de origen. */
function funcionMover_(nombre, origenId, destinoId, movidos, clave) {
  filtrar(nombre, function (x) {
    return String(x.empresa_id || '') === String(origenId);
  }).forEach(function (x) {
    actualizar(nombre, x.id, { empresa_id: destinoId }, 'sistema');
    movidos[clave]++;
  });
}

function empresasGuardar(ctx, payload) {
  return conBloqueo(function () {
  const razon = exigirTexto(payload.razon_social, 'razon_social', 160);

  // RN-61 · El NIT es único entre las empresas que no están suprimidas.
  const nitLimpio = soloDigitos_(payload.nit);
  if (nitLimpio) {
    const repetida = filtrar('empresas', function (e) {
      if (!bool(e.activo) && e.suprimida_en) return false;
      if (payload.id && String(e.id) === String(payload.id)) return false;
      return soloDigitos_(e.nit) === nitLimpio;
    })[0];
    if (repetida) {
      fallar_('VALIDACION', 'Ya existe una empresa con ese NIT: ' + repetida.razon_social +
        (bool(repetida.activo) ? '.' : ' (está desactivada: reactívela en vez de crear otra).'));
    }
  }

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
  });
}


/**
 * Punto 16 · Guardar y asignar en una sola acción, con un solo bloqueo.
 * Antes la pantalla encadenaba activar → asignar → listar: unos 8 segundos.
 */
function usuariosGuardar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');

  return conBloqueo(function () {
    limpiarCache('usuarios');
    const u = buscarPorId('usuarios', id);
    if (!u) fallar_('NO_ENCONTRADO', 'El usuario no existe.');

    const cambios = {};
    if (payload.rol !== undefined) {
      cambios.rol = exigirEnEnum(payload.rol, 'rol', ['CONTRATISTA', 'SUPERVISOR', 'ADMIN', 'CONSEJO']);
    }
    if (payload.empresa_id !== undefined) {
      const empresaId = payload.empresa_id || '';
      if (empresaId) {
    const emp = buscarPorId('empresas', empresaId);
    if (!emp || emp.suprimida_en) fallar_('VALIDACION', 'La empresa no existe.');
  }
      cambios.empresa_id = empresaId;
    }
    if (payload.estado !== undefined) {
      cambios.estado = exigirEnEnum(payload.estado, 'estado', ['ACTIVO', 'INACTIVO', 'PENDIENTE']);
      if (cambios.estado === 'INACTIVO' && !payload.reasignar) {
        const abiertos = filtrar('actividades', function (a) {
          return String(a.responsable_id) === String(id) && bool(a.activo) &&
            ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA', 'RECHAZADA'].indexOf(String(a.estado)) >= 0;
        });
        if (abiertos.length) {
          fallar_('CONFLICTO', 'Tiene ' + abiertos.length + ' trabajo(s) abierto(s). ' +
            'Pase esos trabajos a otra persona antes de desactivarlo.');
        }
      }
    }
    if (Object.keys(cambios).length) actualizar('usuarios', id, cambios, ctx.usuario.email);

    // Las secciones, si vienen.
    if (payload.nodo_ids !== undefined) {
      const nodos = (payload.nodo_ids || []).filter(Boolean);
      filtrar('asignaciones', function (a) {
        return String(a.usuario_id) === String(id) && bool(a.activo);
      }).forEach(function (a) { actualizar('asignaciones', a.id, { activo: false }, ctx.usuario.email); });
      nodos.forEach(function (nodoId) {
        insertar('asignaciones', {
          id: newId('ASI'), usuario_id: id, nodo_id: nodoId,
          desde: hoyIso(), hasta: '', activo: true,
        }, ctx.usuario.email);
      });
    }

    auditar(ctx.usuario.email, 'USUARIO_GUARDADO', 'usuario', id, null, cambios);
    return {
      usuario: buscarPorId('usuarios', id),
      asignados: nodosAsignados_(id).map(function (n) { return n.id; }),
    };
  });
}
