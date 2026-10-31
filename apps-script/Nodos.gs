/**
 * Nodos.gs — operaciones del árbol (SPEC v1.2, sec. 3).
 * El código y la ruta se calculan siempre; nunca se escriben a mano.
 */

function nodosCrear(ctx, payload) {
  const parentId = payload.parent_id || null;
  const padre = parentId ? buscarPorId('nodos', parentId) : null;
  if (parentId && !padre) fallar_('NO_ENCONTRADO', 'El nodo padre no existe.');

  const clase = exigirEnEnum(payload.clase || 'ELEMENTO', 'clase', ['AGRUPADOR', 'ELEMENTO']);
  const segmento = String(exigirTexto(payload.segmento, 'segmento')).toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(segmento)) fallar_('VALIDACION', 'El segmento debe tener 2 a 5 caracteres A-Z o 0-9.');
  const nombre = exigirTexto(payload.nombre, 'nombre', 120);

  if (padre && padre.clase === 'ELEMENTO' && clase === 'AGRUPADOR') {
    fallar_('VALIDACION', 'Un elemento no puede contener agrupadores.');
  }
  const maxProf = configNumero('max_profundidad', 8);
  const profundidad = padre ? Number(padre.profundidad) + 1 : 1;
  if (profundidad > maxProf) fallar_('VALIDACION', 'Se alcanzó la profundidad máxima del árbol (' + maxProf + ').');

  const hermanos = filtrar('nodos', function (n) {
    return String(n.parent_id || '') === String(parentId || '') && bool(n.activo);
  });
  if (hermanos.some(function (n) { return String(n.segmento).toUpperCase() === segmento; })) {
    fallar_('CONFLICTO', 'Ya existe un nodo hermano con el segmento ' + segmento + '.');
  }

  let tipoId = '';
  if (clase === 'ELEMENTO') {
    tipoId = exigirTexto(payload.tipo_elemento_id, 'tipo_elemento_id');
    if (!buscarPorId('tipos_elemento', tipoId)) fallar_('VALIDACION', 'El tipo de elemento no existe.');
  }

  const codigo = padre ? padre.codigo + '-' + segmento : segmento;
  const rutaIds = padre ? padre.ruta_ids + '/' + padre.id : '';
  const orden = hermanos.length + 1;

  const nodo = insertar('nodos', {
    id: newId('NOD'),
    parent_id: padre ? padre.id : '',
    clase: clase,
    segmento: segmento,
    nombre: nombre,
    codigo: codigo,
    ruta_ids: rutaIds,
    profundidad: profundidad,
    orden: orden,
    tipo_elemento_id: tipoId,
    sensible: payload.sensible !== undefined ? !!payload.sensible : (tipoId ? !!buscarPorId('tipos_elemento', tipoId).sensible_default : false),
    visible_publico: payload.visible_publico === undefined ? true : !!payload.visible_publico,
    criticidad: payload.criticidad || (profundidad === 1 ? 3 : 2),
    ficha_json: payload.ficha_json ? toJson(payload.ficha_json) : '',
    condicion_operativa: '',
    salud_estado: 'SIN_DATOS',
    salud_puntaje: '',
    activo: true,
  }, ctx.usuario.email);

  auditar(ctx.usuario.email, 'NODO_CREADO', 'nodo', nodo.id, null, { codigo: codigo, nombre: nombre });
  return nodo;
}

function nodosEditar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const nodo = buscarPorId('nodos', id);
  if (!nodo) fallar_('NO_ENCONTRADO', 'Nodo inexistente');

  const cambios = {};
  if (payload.nombre !== undefined) cambios.nombre = exigirTexto(payload.nombre, 'nombre', 120);
  if (payload.sensible !== undefined) cambios.sensible = !!payload.sensible;
  if (payload.visible_publico !== undefined) cambios.visible_publico = !!payload.visible_publico;
  if (payload.criticidad !== undefined) cambios.criticidad = Number(payload.criticidad);
  if (payload.orden !== undefined) cambios.orden = Number(payload.orden);
  if (payload.ficha_json !== undefined) cambios.ficha_json = toJson(payload.ficha_json);
  if (payload.condicion_operativa !== undefined) cambios.condicion_operativa = String(payload.condicion_operativa);
  if (payload.desactivar === true) cambios.activo = false;
  if (!Object.keys(cambios).length) fallar_('VALIDACION', 'No hay cambios para aplicar.');

  const despues = actualizar('nodos', id, cambios, ctx.usuario.email);
  auditar(ctx.usuario.email, 'NODO_EDITADO', 'nodo', id, nodo, cambios);
  return despues;
}

/** Mueve un nodo y recalcula código, ruta y profundidad de todo su subárbol. */
function nodosMover(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const nuevoPadreId = payload.nuevo_parent_id || '';
  const nodo = buscarPorId('nodos', id);
  if (!nodo) fallar_('NO_ENCONTRADO', 'Nodo inexistente');
  if (String(nodo.id) === String(nuevoPadreId)) fallar_('VALIDACION', 'Un nodo no se puede mover dentro de sí mismo.');

  const nuevoPadre = nuevoPadreId ? buscarPorId('nodos', nuevoPadreId) : null;
  if (nuevoPadreId && !nuevoPadre) fallar_('NO_ENCONTRADO', 'El padre destino no existe.');
  if (nuevoPadre && nuevoPadre.clase === 'ELEMENTO' && nodo.clase === 'AGRUPADOR') {
    fallar_('VALIDACION', 'Un elemento no puede contener agrupadores.');
  }
  // Evitar ciclos: el destino no puede ser descendiente del nodo.
  if (nuevoPadre) {
    const rutaDestino = nodo.ruta_ids + '/' + nodo.id;
    const rutaPadre = nuevoPadre.ruta_ids + '/' + nuevoPadre.id;
    if (rutaPadre === rutaDestino || rutaPadre.indexOf(rutaDestino + '/') === 0) {
      fallar_('VALIDACION', 'No se puede mover un nodo bajo uno de sus descendientes.');
    }
  }

  const nuevoCodigo = nuevoPadre ? nuevoPadre.codigo + '-' + nodo.segmento : nodo.segmento;
  const nuevaRuta = nuevoPadre ? nuevoPadre.ruta_ids + '/' + nuevoPadre.id : '';
  const nuevaProf = nuevoPadre ? Number(nuevoPadre.profundidad) + 1 : 1;
  const delta = nuevaProf - Number(nodo.profundidad);

  return conBloqueo(function () {
    const viejaRuta = nodo.ruta_ids + '/' + nodo.id;
    const viejoCodigo = nodo.codigo;
    const subarbol = filas('nodos').filter(function (n) {
      const propia = n.ruta_ids + '/' + n.id;
      return propia === viejaRuta || propia.indexOf(viejaRuta + '/') === 0;
    });

    actualizar('nodos', nodo.id, {
      parent_id: nuevoPadre ? nuevoPadre.id : '',
      codigo: nuevoCodigo,
      ruta_ids: nuevaRuta,
      profundidad: nuevaProf,
    }, ctx.usuario.email);

    subarbol.forEach(function (n) {
      if (String(n.id) === String(nodo.id)) return;
      const codigoHijo = String(n.codigo).replace(viejoCodigo + '-', nuevoCodigo + '-');
      const rutaHija = String(n.ruta_ids).replace(viejaRuta, nuevaRuta + '/' + nodo.id);
      actualizar('nodos', n.id, {
        codigo: codigoHijo,
        ruta_ids: rutaHija,
        profundidad: Number(n.profundidad) + delta,
      }, ctx.usuario.email);
    });

    auditar(ctx.usuario.email, 'NODO_MOVIDO', 'nodo', nodo.id,
      { codigo: viejoCodigo }, { codigo: nuevoCodigo, hijos: subarbol.length - 1 });
    return { movido: true, codigo: nuevoCodigo, hijos_recalculados: subarbol.length - 1 };
  });
}
