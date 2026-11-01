/**
 * Alertas.gs — mensajes públicos de la administración (SPEC v1.2, sec. 8).
 * Una alerta publicada aparece en la franja de la portada hasta que se cierra.
 */

const NIVELES_ALERTA = ['INFO', 'AVISO', 'URGENTE', 'CRITICA'];

function alertaResumen_(a) {
  const nodo = a.nodo_id ? buscarPorId('nodos', a.nodo_id) : null;
  return {
    id: a.id,
    nivel: a.nivel,
    categoria: a.categoria,
    titulo: a.titulo,
    mensaje: a.mensaje_publico || '',
    estado: a.estado,
    fijada: bool(a.fijada),
    inicio: fechaIso_(a.inicio),
    fin: fechaIso_(a.fin),
    nodo_codigo: nodo ? nodo.codigo : '',
    nodo_nombre: nodo ? nodo.nombre : '',
    actualizaciones: fromJson(a.actualizaciones_json, []),
  };
}

function alertasListar(ctx, payload) {
  const estado = payload.estado ? String(payload.estado).toUpperCase() : null;
  const lista = filtrar('alertas', function (a) {
    if (!bool(a.activo)) return false;
    if (estado && String(a.estado) !== estado) return false;
    return true;
  });
  const orden = { CRITICA: 0, URGENTE: 1, AVISO: 2, INFO: 3 };
  lista.sort(function (a, b) {
    if (bool(a.fijada) !== bool(b.fijada)) return bool(a.fijada) ? -1 : 1;
    return (orden[a.nivel] || 9) - (orden[b.nivel] || 9);
  });
  return { alertas: lista.map(alertaResumen_) };
}

/** Crea o actualiza una alerta. */
function alertasGuardar(ctx, payload) {
  desdePortal_(payload);
  const nivel = exigirEnEnum(payload.nivel || 'INFO', 'nivel', NIVELES_ALERTA);
  const categoria = exigirEnEnum(payload.categoria || 'GENERAL', 'categoria',
    ['FALLA', 'CORTE_SERVICIO', 'CIERRE_AREA', 'MANTENIMIENTO_PROGRAMADO', 'SEGURIDAD', 'GENERAL']);
  const titulo = exigirTexto(payload.titulo, 'titulo', 120);

  const datos = {
    nivel: nivel,
    categoria: categoria,
    titulo: titulo,
    mensaje_publico: payload.mensaje ? String(payload.mensaje).slice(0, 1000) : '',
    nodo_id: payload.nodo_id || '',
    novedad_id: payload.novedad_id || '',
    actividad_id: payload.actividad_id || '',
    inicio: payload.inicio || hoyIso(),
    fin: payload.fin || '',
    fijada: !!payload.fijada,
    actualizaciones_json: '[]',
  };

  if (payload.id) {
    const a = buscarPorId('alertas', payload.id);
    if (!a) fallar_('NO_ENCONTRADO', 'La alerta no existe.');
    const despues = actualizar('alertas', payload.id, datos, ctx.usuario.email);
    auditar(ctx.usuario.email, 'ALERTA_EDITADA', 'alerta', payload.id, a, datos);
    return { alerta: alertaResumen_(despues) };
  }

  const nueva = insertar('alertas', Object.assign({
    id: newId('ALE'),
    estado: 'BORRADOR',
    origen: 'MANUAL',
    activo: true,
  }, datos), ctx.usuario.email);
  auditar(ctx.usuario.email, 'ALERTA_CREADA', 'alerta', nueva.id, null, datos);
  return { alerta: alertaResumen_(nueva) };
}

/** Publica una alerta: queda visible para todos de inmediato. */
function alertasPublicar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const a = buscarPorId('alertas', id);
  if (!a) fallar_('NO_ENCONTRADO', 'La alerta no existe.');
  const despues = actualizar('alertas', id, { estado: 'PUBLICADA' }, ctx.usuario.email);
  regenerarSnapshot();
  auditar(ctx.usuario.email, 'ALERTA_PUBLICADA', 'alerta', id, { estado: a.estado }, { estado: 'PUBLICADA' });
  return { alerta: alertaResumen_(despues) };
}

/** Agrega una actualización con línea de tiempo. */
function alertasActualizar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const texto = exigirTexto(payload.mensaje, 'mensaje', 400);
  const a = buscarPorId('alertas', id);
  if (!a) fallar_('NO_ENCONTRADO', 'La alerta no existe.');

  const linea = fromJson(a.actualizaciones_json, []);
  linea.push({ fecha: ahoraIso(), texto: texto });
  const despues = actualizar('alertas', id, {
    actualizaciones_json: toJson(linea),
    estado: String(a.estado) === 'PUBLICADA' ? 'ACTUALIZADA' : a.estado,
  }, ctx.usuario.email);
  if (String(a.estado) !== 'BORRADOR') regenerarSnapshot();
  return { alerta: alertaResumen_(despues) };
}

/** Cierra la alerta con un mensaje final. */
function alertasCerrar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const mensaje = exigirTexto(payload.mensaje, 'mensaje', 400);
  const a = buscarPorId('alertas', id);
  if (!a) fallar_('NO_ENCONTRADO', 'La alerta no existe.');

  const linea = fromJson(a.actualizaciones_json, []);
  linea.push({ fecha: ahoraIso(), texto: mensaje });
  const despues = actualizar('alertas', id, {
    estado: 'CERRADA',
    fin: hoyIso(),
    actualizaciones_json: toJson(linea),
  }, ctx.usuario.email);
  regenerarSnapshot();
  auditar(ctx.usuario.email, 'ALERTA_CERRADA', 'alerta', id, { estado: a.estado }, { estado: 'CERRADA' });
  return { alerta: alertaResumen_(despues) };
}
