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

// ---------------------------------------------------------------------------
// Alertas automáticas (AL-01, AL-02, AL-03)
// ---------------------------------------------------------------------------

/**
 * AL-02 · Dos días antes de un trabajo que afecta el uso, se avisa solo.
 * Es la que más ve el residente: «el salón estará cerrado el…».
 * Se llama desde el disparador de las 6:00.
 */
function alertasAfectaUso_(diasAntes) {
  const dias = Number(diasAntes || 2);
  const objetivo = sumarDias(hoyIso(), dias);
  const creadas = [];

  filtrar('actividades', function (a) {
    if (!bool(a.activo) || !bool(a.afecta_uso) || !bool(a.publicable)) return false;
    if (['PROGRAMADA', 'EN_EJECUCION'].indexOf(String(a.estado)) < 0) return false;
    return fechaIso_(a.fecha_inicio_plan) === objetivo;
  }).forEach(function (a) {
    // Una por trabajo y por fecha: no se repite al día siguiente.
    if (filtrar('alertas', function (x) {
      return bool(x.activo) && String(x.actividad_id) === String(a.id) &&
        String(x.origen) === 'AUTOMATICA_AFECTA_USO';
    })[0]) return;

    const nodo = a.nodo_id ? buscarPorId('nodos', a.nodo_id) : null;
    const sensible = nodo ? esSensible(nodo) : false;
    const cuando = String(a.fecha_inicio_plan) === String(a.fecha_fin_plan)
      ? 'el ' + a.fecha_inicio_plan
      : 'del ' + a.fecha_inicio_plan + ' al ' + a.fecha_fin_plan;

    const creada = insertar('alertas', {
      id: newId('ALE'),
      nivel: 'AVISO',
      categoria: 'CIERRE_AREA',
      // Un sistema sensible nunca se nombra: se dice que hay un trabajo, no cuál.
      titulo: sensible ? 'Trabajo programado que afecta el uso' : a.titulo,
      mensaje_publico: (sensible ? 'Habrá un trabajo en un sistema del conjunto ' : 'Trabajo en ' +
        (nodo ? nodo.nombre : 'el conjunto') + ' ' + cuando + '. ') +
        'Puede afectar el uso normal de la zona.',
      nodo_id: sensible ? '' : (a.nodo_id || ''),
      novedad_id: '',
      actividad_id: a.id,
      inicio: hoyIso(),
      fin: a.fecha_fin_plan,
      fijada: false,
      actualizaciones_json: '[]',
      estado: 'PUBLICADA',
      origen: 'AUTOMATICA_AFECTA_USO',
      activo: true,
    }, 'sistema');
    creadas.push(creada.id);
  });

  if (creadas.length) regenerarSnapshot();
  return { creadas: creadas.length };
}

/**
 * AL-01 · Una novedad ALTA o CRÍTICA deja una alerta en BORRADOR para que la
 * administración la revise, y avisa a los administradores. No se publica sola.
 */
function alertaPorNovedad_(novedad) {
  if (!novedad) return null;
  const gravedad = String(novedad.gravedad || '').toUpperCase();
  if (['ALTA', 'CRITICA'].indexOf(gravedad) < 0) return null;

  // Una sola alerta por novedad.
  const ya = filtrar('alertas', function (x) {
    return bool(x.activo) && String(x.novedad_id) === String(novedad.id);
  })[0];
  if (ya) return ya;

  const nodo = novedad.nodo_id ? buscarPorId('nodos', novedad.nodo_id) : null;
  const sensible = nodo ? esSensible(nodo) : false;
  const alerta = insertar('alertas', {
    id: newId('ALE'),
    nivel: gravedad === 'CRITICA' ? 'CRITICA' : 'URGENTE',
    categoria: novedad.tipo === 'FALLA' ? 'FALLA' : 'GENERAL',
    titulo: novedad.titulo || 'Novedad que requiere atención',
    mensaje_publico: novedad.texto_publico || novedad.descripcion || '',
    nodo_id: sensible ? '' : (novedad.nodo_id || ''),
    novedad_id: novedad.id,
    actividad_id: '',
    inicio: hoyIso(),
    fin: novedad.fecha_compromiso || '',
    fijada: false,
    actualizaciones_json: '[]',
    estado: 'BORRADOR',
    origen: 'AUTOMATICA_NOVEDAD',
    activo: true,
  }, 'sistema');

  auditar('sistema', 'ALERTA_SUGERIDA', 'alerta', alerta.id, null,
    { novedad_id: novedad.id, gravedad: gravedad });
  return alerta;
}

/**
 * AL-03 · Al resolver una novedad, su alerta se propone cerrar: no se cierra sola
 * porque el mensaje público lo escribe la administración.
 */
function alertasProponerCierre_(novedadId, motivo) {
  const alertas = filtrar('alertas', function (x) {
    return bool(x.activo) && String(x.novedad_id) === String(novedadId) &&
      ['PUBLICADA', 'ACTUALIZADA'].indexOf(String(x.estado)) >= 0;
  });
  if (!alertas.length) return 0;

  alertas.forEach(function (a) {
    const linea = fromJson(a.actualizaciones_json, []);
    linea.push({ fecha: ahoraIso(), texto: 'La novedad quedó resuelta' + (motivo ? ': ' + motivo : '') +
      '. Se puede cerrar esta alerta.' });
    actualizar('alertas', a.id, { actualizaciones_json: toJson(linea), sugerida_cerrar: true }, 'sistema');
  });
  return alertas.length;
}
