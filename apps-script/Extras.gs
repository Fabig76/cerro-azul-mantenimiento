/**
 * Extras.gs — acciones del SPEC que completan la operación (sec. 9).
 */

function configGet(ctx) {
  return {
    config: filas('config').map(function (c) {
      return { clave: c.clave, valor: c.valor, descripcion: c.descripcion || '' };
    }),
  };
}

function auditoriaListar(ctx, payload) {
  desdePortal_(payload);
  const entidad = payload.entidad || null;
  const limite = Math.min(Number(payload.limite) || 100, 300);
  let lista = filas('auditoria');
  if (entidad) lista = lista.filter(function (a) { return String(a.entidad) === entidad; });
  lista = lista.slice(-limite).reverse();
  return {
    registros: lista.map(function (a) {
      return {
        fecha: a.fecha, usuario: a.usuario_email, accion: a.accion,
        entidad: a.entidad, entidad_id: a.entidad_id,
      };
    }),
  };
}

/** Registra la condición de un elemento (lectura de estado). */
function lecturasCrear(ctx, payload) {
  desdePortal_(payload);
  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) fallar_('NO_ENCONTRADO', 'El nodo no existe.');
  if (ctx.rol === 'CONTRATISTA') requireNodo_(ctx, nodo);

  const condicion = exigirTexto(payload.condicion_operativa, 'condicion_operativa', 80);
  const tipo = nodo.tipo_elemento_id ? buscarPorId('tipos_elemento', nodo.tipo_elemento_id) : null;
  const condiciones = tipo ? fromJson(tipo.condiciones_json, []) : [];
  if (condiciones.length && !condiciones.some(function (c) { return String(c.valor) === condicion; })) {
    fallar_('VALIDACION', 'Esa condición no está en el catálogo del tipo.');
  }

  return conBloqueo(function () {
    const lectura = insertar('lecturas_estado', {
      id: newId('LEC'),
      nodo_id: nodoId,
      fecha: hoyIso(),
      condicion_operativa: condicion,
      origen: ctx.rol === 'ADMIN' ? 'ADMIN' : 'INSPECCION',
      reporte_id: payload.reporte_id || '',
      usuario_id: ctx.usuario.id,
      nota: payload.nota ? String(payload.nota).slice(0, 500) : '',
      activo: true,
    }, ctx.usuario.email);

    actualizar('nodos', nodoId, { condicion_operativa: condicion }, ctx.usuario.email);
    recalcularSalud_(nodoId, ctx.usuario.email);
    return { lectura: lectura.id, condicion: condicion };
  });
}

/** Edita una novedad (gravedad, texto público, fecha de compromiso). */
function novedadesEditar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const n = buscarPorId('novedades', id);
  if (!n) fallar_('NO_ENCONTRADO', 'La novedad no existe.');

  const cambios = {};
  if (payload.gravedad !== undefined) {
    cambios.gravedad = exigirEnEnum(payload.gravedad, 'gravedad', ['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);
  }
  if (payload.fecha_compromiso !== undefined) cambios.fecha_compromiso = payload.fecha_compromiso || '';
  if (payload.texto_publico !== undefined) {
    cambios.texto_publico = String(payload.texto_publico || '').slice(0, 400);
  }
  if (payload.publicable !== undefined) cambios.publicable = !!payload.publicable;
  if (!Object.keys(cambios).length) fallar_('VALIDACION', 'No hay cambios.');

  const despues = actualizar('novedades', id, cambios, ctx.usuario.email);
  recalcularSalud_(n.nodo_id, ctx.usuario.email);
  auditar(ctx.usuario.email, 'NOVEDAD_EDITADA', 'novedad', id, null, cambios);
  return { novedad: novedadResumen_(despues) };
}
