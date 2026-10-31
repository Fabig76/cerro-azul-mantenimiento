/**
 * Actividades.gs — creación, consulta e inicio de actividades (SPEC v1.2, sec. 4.3, 7.3 y 10).
 */

/** Plantilla vigente con sus ítems, o null. */
function plantillaConItems_(plantillaId, version) {
  if (esVacio(plantillaId)) return null;
  const p = buscarPorId('plantillas', plantillaId);
  if (!p) return null;
  const v = version ? Number(version) : Number(p.version);
  const items = filtrar('plantilla_items', function (i) {
    return String(i.plantilla_id) === String(p.id) && Number(i.version) === v && bool(i.activo);
  }).sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  return { plantilla: p, items: items };
}

/** ¿El usuario puede ver esta actividad? */
function puedeVerActividad_(ctx, act) {
  if (ctx.rol === 'ADMIN' || ctx.rol === 'SUPERVISOR') return true;
  if (String(act.responsable_id) === String(ctx.usuario.id)) return true;
  if (act.empresa_id && String(act.empresa_id) === String(ctx.usuario.empresa_id || '')) return true;
  const nodo = buscarPorId('nodos', act.nodo_id);
  if (!nodo) return false;
  const asignados = nodosAsignados_(ctx.usuario.id);
  const propio = nodo.ruta_ids + '/' + nodo.id;
  return asignados.some(function (a) {
    const raiz = a.ruta_ids + '/' + a.id;
    return propio === raiz || propio.indexOf(raiz + '/') === 0;
  });
}

function actividadResumen_(a) {
  return {
    id: a.id, titulo: a.titulo, nodo_id: a.nodo_id, empresa_id: a.empresa_id,
    responsable_id: a.responsable_id, tipo: a.tipo, estado: a.estado, prioridad: a.prioridad,
    fecha_inicio_plan: a.fecha_inicio_plan, fecha_fin_plan: a.fecha_fin_plan,
    avance_aprobado_pct: Number(a.avance_aprobado_pct || 0),
    avance_reportado_pct: Number(a.avance_reportado_pct || 0),
    vencida: bool(a.vencida), en_riesgo: bool(a.en_riesgo),
    afecta_uso: bool(a.afecta_uso), obligatoria_legal: bool(a.obligatoria_legal),
  };
}

/** Crea una actividad. Solo ADMIN. */
function actividadesCrear(ctx, payload) {
  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) fallar_('NO_ENCONTRADO', 'La sección indicada no existe.');
  if (!bool(nodo.activo)) fallar_('VALIDACION', 'Esa sección está desactivada.');

  const titulo = exigirTexto(payload.titulo, 'titulo', 120);
  const tipo = exigirEnEnum(payload.tipo || 'UNICA', 'tipo', ['UNICA', 'MULTIDIA', 'RECURRENTE']);
  const prioridad = exigirEnEnum(payload.prioridad || 'MEDIA', 'prioridad', ['BAJA', 'MEDIA', 'ALTA', 'URGENTE']);

  const inicio = exigirTexto(payload.fecha_inicio_plan, 'fecha_inicio_plan');
  const fin = payload.fecha_fin_plan ? String(payload.fecha_fin_plan) : inicio;
  if (fin < inicio) fallar_('VALIDACION', 'La fecha final no puede ser anterior a la inicial.');
  const dias = diasEntre(fechaIso_(inicio), fechaIso_(fin)) + 1;

  if (payload.empresa_id) {
    const empresa = buscarPorId('empresas', payload.empresa_id);
    if (!empresa) fallar_('VALIDACION', 'La empresa no existe.');
    if (empresa.vigencia_hasta && String(empresa.vigencia_hasta) < hoyIso()) {
      fallar_('CONFLICTO', 'La empresa tiene el contrato vencido (RN-18). Habilítela o cambie de empresa.');
    }
  }

  let plantilla = null;
  if (payload.plantilla_id) {
    plantilla = plantillaConItems_(payload.plantilla_id, payload.plantilla_version);
    if (!plantilla) fallar_('VALIDACION', 'La plantilla no existe.');
  }

  const actividad = insertar('actividades', {
    id: newId('ACT'),
    titulo: titulo,
    descripcion: payload.descripcion ? String(payload.descripcion).slice(0, 2000) : '',
    nodo_id: nodoId,
    plantilla_id: plantilla ? plantilla.plantilla.id : '',
    plantilla_version: plantilla ? Number(plantilla.plantilla.version) : '',
    empresa_id: payload.empresa_id || '',
    responsable_id: payload.responsable_id || '',
    tipo: tipo,
    origen: payload.origen || 'PLAN',
    novedad_id: payload.novedad_id || '',
    recurrencia_id: payload.recurrencia_id || '',
    fecha_inicio_plan: inicio,
    fecha_fin_plan: fin,
    dias_plan: dias,
    prioridad: prioridad,
    estado: 'PROGRAMADA',
    vencida: false,
    en_riesgo: false,
    avance_reportado_pct: 0,
    avance_aprobado_pct: 0,
    obligatoria_legal: !!payload.obligatoria_legal,
    afecta_uso: !!payload.afecta_uso,
    publicable: payload.publicable !== false,
    activo: true,
  }, ctx.usuario.email);

  // Hitos opcionales para actividades de varios días.
  const hitos = Array.isArray(payload.hitos) ? payload.hitos : [];
  if (tipo === 'MULTIDIA' && hitos.length) {
    insertarVarias('hitos', hitos.map(function (h, i) {
      return {
        id: newId('HIT'),
        actividad_id: actividad.id,
        orden: i + 1,
        nombre: String(h.nombre || 'Hito ' + (i + 1)).slice(0, 120),
        peso: Number(h.peso) || 1,
        fecha_plan: h.fecha_plan || '',
        estado: 'PENDIENTE',
        activo: true,
      };
    }), ctx.usuario.email);
  }

  auditar(ctx.usuario.email, 'ACTIVIDAD_CREADA', 'actividad', actividad.id, null,
    { titulo: titulo, nodo: nodo.codigo, dias: dias });
  return { actividad: actividadResumen_(actividad), hitos: hitos.length };
}

/** Lista actividades visibles para el usuario. */
function actividadesListar(ctx, payload) {
  const estado = payload.estado ? String(payload.estado).toUpperCase() : null;
  const nodoId = payload.nodo_id || null;
  const empresaId = payload.empresa_id || null;
  const desde = payload.desde || null;
  const hasta = payload.hasta || null;

  let lista = filas('actividades').filter(function (a) {
    if (!bool(a.activo)) return false;
    if (estado && String(a.estado) !== estado) return false;
    if (empresaId && String(a.empresa_id) !== String(empresaId)) return false;
    if (desde && fechaIso_(a.fecha_fin_plan) < fechaIso_(desde)) return false;
    if (hasta && fechaIso_(a.fecha_inicio_plan) > fechaIso_(hasta)) return false;
    if (nodoId) {
      const nodo = buscarPorId('nodos', nodoId);
      if (!nodo) return false;
      const raiz = nodo.ruta_ids + '/' + nodo.id;
      const objetivo = buscarPorId('nodos', a.nodo_id);
      if (!objetivo) return false;
      const propia = objetivo.ruta_ids + '/' + objetivo.id;
      if (propia !== raiz && propia.indexOf(raiz + '/') !== 0) return false;
    }
    return true;
  });

  if (ctx.rol !== 'ADMIN' && ctx.rol !== 'SUPERVISOR') {
    lista = lista.filter(function (a) { return puedeVerActividad_(ctx, a); });
  }

  lista.sort(function (a, b) {
    const fa = String(a.fecha_fin_plan) + String(a.estado);
    const fb = String(b.fecha_fin_plan) + String(b.estado);
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });

  const tam = Math.min(Number(payload.tam) || 50, 100);
  const pagina = Math.max(Number(payload.pagina) || 1, 1);
  const inicioIdx = (pagina - 1) * tam;
  const paginaLista = lista.slice(inicioIdx, inicioIdx + tam);

  return {
    total: lista.length,
    pagina: pagina,
    tam: tam,
    actividades: paginaLista.map(actividadResumen_),
  };
}

/** Detalle de una actividad con su checklist. */
function actividadesGet(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const act = buscarPorId('actividades', id);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (!puedeVerActividad_(ctx, act)) {
    auditar(ctx.usuario.email, 'DENEGADO', 'actividad', id, null, null);
    fallar_('PROHIBIDO', 'No tienes acceso a esta actividad.');
  }

  const nodo = buscarPorId('nodos', act.nodo_id);
  const plantilla = plantillaConItems_(act.plantilla_id, act.plantilla_version);
  const hitos = filtrar('hitos', function (h) {
    return String(h.actividad_id) === String(act.id) && bool(h.activo);
  }).sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  const reportes = filtrar('reportes', function (r) {
    return String(r.actividad_id) === String(act.id);
  });
  const evidencias = filtrar('evidencias', function (e) {
    return String(e.actividad_id) === String(act.id) && bool(e.activo);
  }).map(function (e) {
    return {
      id: e.id, momento: e.momento, mime: e.mime, bytes: Number(e.bytes || 0),
      fecha_captura: e.fecha_captura, fecha_subida: e.fecha_subida,
      contiene_personas: bool(e.contiene_personas), publicable: bool(e.publicable),
    };
  });

  return {
    actividad: actividadResumen_(Object.assign({}, act, { estado: act.estado })),
    descripcion: act.descripcion || '',
    nodo: nodo ? { id: nodo.id, codigo: nodo.codigo, nombre: nodo.nombre, sensible: bool(nodo.sensible) } : null,
    plantilla: plantilla ? {
      id: plantilla.plantilla.id, nombre: plantilla.plantilla.nombre,
      version: plantilla.plantilla.version, metodo_avance: plantilla.plantilla.metodo_avance,
      items: plantilla.items.map(function (i) {
        return {
          id: i.id, orden: Number(i.orden), grupo: i.grupo, pregunta: i.pregunta,
          tipo_respuesta: i.tipo_respuesta, criterio: i.criterio_aceptacion,
          obligatorio: bool(i.obligatorio), peso: Number(i.peso || 1),
          requiere_foto: bool(i.requiere_foto), unidad: i.unidad,
          valor_min: i.valor_min === '' ? null : Number(i.valor_min),
          valor_max: i.valor_max === '' ? null : Number(i.valor_max),
        };
      }),
    } : null,
    hitos: hitos,
    reportes: reportes,
    evidencias: evidencias,
  };
}

/** Edita una actividad existente. Solo ADMIN. */
function actividadesEditar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const act = buscarPorId('actividades', id);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (['CERRADA', 'CANCELADA'].indexOf(String(act.estado)) >= 0) {
    fallar_('ESTADO_INVALIDO', 'Una actividad cerrada o cancelada ya no se edita.');
  }

  const cambios = {};
  if (payload.titulo !== undefined) cambios.titulo = exigirTexto(payload.titulo, 'titulo', 120);
  if (payload.descripcion !== undefined) cambios.descripcion = String(payload.descripcion || '').slice(0, 2000);
  if (payload.prioridad !== undefined) {
    cambios.prioridad = exigirEnEnum(payload.prioridad, 'prioridad', ['BAJA', 'MEDIA', 'ALTA', 'URGENTE']);
  }
  if (payload.afecta_uso !== undefined) cambios.afecta_uso = !!payload.afecta_uso;
  if (payload.publicable !== undefined) cambios.publicable = !!payload.publicable;
  if (payload.obligatoria_legal !== undefined) cambios.obligatoria_legal = !!payload.obligatoria_legal;

  const inicioNuevo = payload.fecha_inicio_plan ? String(payload.fecha_inicio_plan) : String(act.fecha_inicio_plan);
  const finNuevo = payload.fecha_fin_plan ? String(payload.fecha_fin_plan) : String(act.fecha_fin_plan);
  if (payload.fecha_inicio_plan !== undefined || payload.fecha_fin_plan !== undefined) {
    if (finNuevo < inicioNuevo) fallar_('VALIDACION', 'La fecha final no puede ser anterior a la inicial.');
    cambios.fecha_inicio_plan = inicioNuevo;
    cambios.fecha_fin_plan = finNuevo;
    cambios.dias_plan = diasEntre(inicioNuevo, finNuevo) + 1;
    cambios.vencida = finNuevo < hoyIso() && ['APROBADA', 'CERRADA', 'CANCELADA'].indexOf(String(act.estado)) < 0;
  }

  if (payload.empresa_id !== undefined) {
    const empresa = payload.empresa_id ? buscarPorId('empresas', payload.empresa_id) : null;
    if (payload.empresa_id && !empresa) fallar_('VALIDACION', 'La empresa no existe.');
    if (empresa && empresa.vigencia_hasta && String(empresa.vigencia_hasta) < hoyIso()) {
      fallar_('CONFLICTO', 'La empresa tiene el contrato vencido (RN-18).');
    }
    cambios.empresa_id = payload.empresa_id || '';
  }
  if (payload.responsable_id !== undefined) cambios.responsable_id = payload.responsable_id || '';

  if (!Object.keys(cambios).length) fallar_('VALIDACION', 'No hay cambios para guardar.');

  const despues = actualizar('actividades', id, cambios, ctx.usuario.email);
  auditar(ctx.usuario.email, 'ACTIVIDAD_EDITADA', 'actividad', id,
    { titulo: act.titulo, inicio: act.fecha_inicio_plan, fin: act.fecha_fin_plan, prioridad: act.prioridad },
    cambios);
  return { actividad: actividadResumen_(despues) };
}

/** Cancela una actividad con motivo obligatorio. No borra: deja el registro (RN-13). */
function actividadesCancelar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const motivo = exigirTexto(payload.motivo, 'motivo', 500);
  if (motivo.length < 10) fallar_('VALIDACION', 'Escribe el motivo de la cancelación (al menos 10 caracteres).');

  const act = buscarPorId('actividades', id);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (String(act.estado) === 'CANCELADA') fallar_('ESTADO_INVALIDO', 'Ya está cancelada.');
  if (String(act.estado) === 'CERRADA') fallar_('ESTADO_INVALIDO', 'Una actividad cerrada no se cancela.');

  const despues = actualizar('actividades', id, {
    estado: 'CANCELADA',
    en_riesgo: false,
    vencida: false,
  }, ctx.usuario.email);

  auditar(ctx.usuario.email, 'ACTIVIDAD_CANCELADA', 'actividad', id,
    { estado: act.estado }, { estado: 'CANCELADA', motivo: motivo });

  return { actividad: actividadResumen_(despues), motivo: motivo };
}
