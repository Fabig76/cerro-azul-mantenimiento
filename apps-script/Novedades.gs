/**
 * Novedades.gs — daños y fallas reportadas desde campo (SPEC v1.2, sec. 8.5).
 * Una novedad abierta baja la salud del elemento hasta que se resuelve.
 */

function novedadResumen_(n) {
  const nodo = buscarPorId('nodos', n.nodo_id);
  return {
    id: n.id,
    titulo: n.titulo,
    descripcion: n.descripcion || '',
    tipo: n.tipo,
    gravedad: n.gravedad,
    estado: n.estado,
    fecha_deteccion: fechaIso_(n.fecha_deteccion),
    fecha_compromiso: fechaIso_(n.fecha_compromiso),
    nodo: nodo ? { id: nodo.id, codigo: nodo.codigo, nombre: nodo.nombre } : null,
    reportada_por: n.reportada_por || '',
  };
}

function novedadesListar(ctx, payload) {
  const estado = payload.estado ? String(payload.estado).toUpperCase() : null;
  let lista = filtrar('novedades', function (n) {
    if (!bool(n.activo)) return false;
    if (estado && String(n.estado) !== estado) return false;
    return true;
  });

  if (ctx.rol === 'CONTRATISTA') {
    lista = lista.filter(function (n) {
      const nodo = buscarPorId('nodos', n.nodo_id);
      if (!nodo) return false;
      const asignados = nodosAsignados_(ctx.usuario.id);
      const propio = nodo.ruta_ids + '/' + nodo.id;
      return asignados.some(function (a) {
        const raiz = a.ruta_ids + '/' + a.id;
        return propio === raiz || propio.indexOf(raiz + '/') === 0;
      });
    });
  }

  const orden = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
  lista.sort(function (a, b) {
    const ea = ['ABIERTA', 'EN_ATENCION'].indexOf(String(a.estado)) >= 0 ? 0 : 1;
    const eb = ['ABIERTA', 'EN_ATENCION'].indexOf(String(b.estado)) >= 0 ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return (orden[a.gravedad] || 9) - (orden[b.gravedad] || 9);
  });

  return {
    novedades: lista.map(novedadResumen_),
    abiertas: lista.filter(function (n) {
      return ['ABIERTA', 'EN_ATENCION'].indexOf(String(n.estado)) >= 0;
    }).length,
  };
}

function novedadesCrear(ctx, payload) {
  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) fallar_('NO_ENCONTRADO', 'La sección no existe.');
  if (ctx.rol === 'CONTRATISTA') requireNodo_(ctx, nodo);

  const titulo = exigirTexto(payload.titulo, 'titulo', 120);
  const tipo = exigirEnEnum(payload.tipo || 'DANO', 'tipo', ['DANO', 'FALLA', 'RIESGO', 'OBSERVACION']);
  const gravedad = exigirEnEnum(payload.gravedad || 'MEDIA', 'gravedad', ['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

  const novedad = insertar('novedades', {
    id: newId('NOV'),
    nodo_id: nodoId,
    titulo: titulo,
    descripcion: payload.descripcion ? String(payload.descripcion).slice(0, 2000) : '',
    tipo: tipo,
    gravedad: gravedad,
    estado: 'ABIERTA',
    reportada_por: ctx.usuario.email,
    origen: ctx.rol === 'ADMIN' ? 'ADMIN' : 'CONTRATISTA',
    actividad_origen_id: payload.actividad_id || '',
    actividad_correctiva_id: '',
    fecha_deteccion: hoyIso(),
    fecha_compromiso: payload.fecha_compromiso || '',
    fecha_resolucion: '',
    publicable: false,
    texto_publico: '',
    activo: true,
  }, ctx.usuario.email);

  recalcularSalud_(nodoId, ctx.usuario.email);
  auditar(ctx.usuario.email, 'NOVEDAD_CREADA', 'novedad', novedad.id, null,
    { nodo: nodo.codigo, gravedad: gravedad, tipo: tipo });

  return { novedad: novedadResumen_(novedad) };
}

function novedadesResolver(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  return conBloqueo(function () {
    limpiarCache('novedades');
    const n = buscarPorId('novedades', id);
    if (!n) fallar_('NO_ENCONTRADO', 'La novedad no existe.');
    if (String(n.estado) === 'RESUELTA') fallar_('ESTADO_INVALIDO', 'Ya está resuelta.');

    const despues = actualizar('novedades', id, {
      estado: 'RESUELTA',
      fecha_resolucion: hoyIso(),
    }, ctx.usuario.email);

    auditar(ctx.usuario.email, 'NOVEDAD_RESUELTA', 'novedad', id, { estado: n.estado }, { estado: 'RESUELTA' });
    recalcularSalud_(n.nodo_id, ctx.usuario.email);
    return { novedad: novedadResumen_(despues) };
  });
}
