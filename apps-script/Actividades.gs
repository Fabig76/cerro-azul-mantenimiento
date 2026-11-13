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
  const porHitos = null;
  return actividadResumenBase_(a);
}

function actividadResumenBase_(a) {
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
  desdePortal_(payload);
  if (payload.propuesta_id || String(payload.origen || '').toUpperCase() === 'PROPUESTA') {
    fallar_('VALIDACION', 'Una actividad de propuesta solo nace al aprobarla.');
  }
  return conBloqueo(function () { return crearActividad_(ctx, payload, {}); });
}

/**
 * Crea una actividad. La usan la acción pública y la aprobación de propuestas.
 * No toma el bloqueo: quien llama decide (conBloqueo no se anida).
 * `opciones.origen`, `opciones.propuesta_id` y `opciones.avisar` mandan sobre el payload.
 */
function crearActividad_(ctx, payload, opciones) {
  const opciones_ = opciones || {};
  // Si el esquema cambió, la columna propuesta_id debe existir antes de insertar.
  asegurarEsquema_();
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

  // Si no se indica plantilla y la sección es un elemento, se toma la del tipo (Anexo B).
  let plantillaId = payload.plantilla_id || '';
  if (!plantillaId && String(nodo.clase) === 'ELEMENTO' && nodo.tipo_elemento_id) {
    const plan = filtrar('plan_tipo', function (p) {
      return String(p.tipo_elemento_id) === String(nodo.tipo_elemento_id) && bool(p.activo);
    })[0];
    if (plan) plantillaId = plan.plantilla_id;
  }

  let plantilla = null;
  if (plantillaId) {
    plantilla = plantillaConItems_(plantillaId, payload.plantilla_version);
    if (!plantilla) fallar_('VALIDACION', 'La plantilla no existe.');
  }

  // Sin etapas propias, se heredan las de la plantilla del tipo (se pueden ajustar después).
  let etapasBase = Array.isArray(payload.hitos) ? payload.hitos : [];
  if (!etapasBase.length && plantilla) {
    etapasBase = fromJson(plantilla.plantilla.etapas_json, []);
    if (etapasBase.length) {
      etapasBase = etapasBase.map(function (e) {
        return { nombre: e.nombre, peso: e.peso, fecha_plan: '' };
      });
    }
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
    origen: opciones_.origen || payload.origen || 'PLAN',
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
    obligatoria_legal: payload.obligatoria_legal !== undefined
      ? !!payload.obligatoria_legal
      : !!(plantilla && !!filtrar('plan_tipo', function (p) {
        return String(p.plantilla_id) === String(plantilla.plantilla.id) && bool(p.obligatoria_legal);
      }).length),
    afecta_uso: !!payload.afecta_uso,
    publicable: payload.publicable !== false,
    propuesta_id: opciones_.propuesta_id || '',
    activo: true,
  }, ctx.usuario.email);

  // Etapas: las que trajo la petición o, si no, las de la plantilla del tipo.
  const hitos = etapasBase;
  if (hitos.length) {
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

  if (payload.responsable_id && opciones_.avisar !== false) {
    encolar_(payload.responsable_id, 'ACTIVIDAD_ASIGNADA', actividad.id);
  }
  auditar(ctx.usuario.email, 'ACTIVIDAD_CREADA', 'actividad', actividad.id, null,
    { titulo: titulo, nodo: nodo.codigo, dias: dias });
  return { actividad: actividadResumen_(actividad), hitos: hitos.length };
}

/** Lista actividades visibles para el usuario. */
/** Grupos de la lista: qué estados entran y cómo se ordenan. */
const GRUPOS_ACTIVIDAD = {
  PENDIENTES: ['PROGRAMADA', 'EN_EJECUCION', 'RECHAZADA'],
  POR_REVISAR: ['REPORTADA'],
  TERMINADAS: ['APROBADA', 'CERRADA'],
  CANCELADAS: ['CANCELADA'],
};

/** Quita tildes y mayúsculas para buscar sin exigir que escriban igual. */
function sinTildes_(texto) {
  return String(texto || '').toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n');
}

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

  // Búsqueda por título o por código y nombre de la sección.
  const texto = payload.texto ? sinTildes_(payload.texto).trim() : '';
  if (texto) {
    lista = lista.filter(function (a) {
      const nodo = buscarPorId('nodos', a.nodo_id) || {};
      const heno = sinTildes_([a.titulo, nodo.codigo, nodo.nombre].join(' '));
      return heno.indexOf(texto) >= 0;
    });
  }

  // Conteos por grupo sobre lo que este usuario puede ver, antes de paginar.
  const conteos = {};
  Object.keys(GRUPOS_ACTIVIDAD).forEach(function (g) {
    conteos[g] = lista.filter(function (a) {
      return GRUPOS_ACTIVIDAD[g].indexOf(String(a.estado)) >= 0;
    }).length;
  });

  const grupo = payload.grupo && GRUPOS_ACTIVIDAD[String(payload.grupo).toUpperCase()]
    ? String(payload.grupo).toUpperCase() : null;

  if (grupo) {
    const admitidos = GRUPOS_ACTIVIDAD[grupo];
    lista = lista.filter(function (a) { return admitidos.indexOf(String(a.estado)) >= 0; });
  }

  const hoy = hoyIso();
  lista.sort(function (a, b) {
    if (grupo === 'PENDIENTES') {
      // Lo vencido primero; después, lo que empieza antes.
      const va = fechaIso_(a.fecha_fin_plan) < hoy ? 0 : 1;
      const vb = fechaIso_(b.fecha_fin_plan) < hoy ? 0 : 1;
      if (va !== vb) return va - vb;
      return String(a.fecha_inicio_plan) < String(b.fecha_inicio_plan) ? -1 : 1;
    }
    if (grupo === 'POR_REVISAR') {
      const fa = String(a.fecha_reporte_final || a.actualizado_en || '');
      const fb = String(b.fecha_reporte_final || b.actualizado_en || '');
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    }
    if (grupo === 'TERMINADAS') {
      return String(b.fecha_fin_plan) < String(a.fecha_fin_plan) ? -1 : 1;
    }
    if (grupo === 'CANCELADAS') {
      return String(b.actualizado_en || '') < String(a.actualizado_en || '') ? -1 : 1;
    }
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
    conteos: conteos,
    grupo: grupo || '',
    pagina: pagina,
    tam: tam,
    actividades: paginaLista.map(function (a) {
      const r = actividadResumenBase_(a);
      const ritmo = calcularRitmo_(a);
      if (ritmo) r.ritmo = ritmo;
      return r;
    }),
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

  asegurarEsquema_();
  const nodo = buscarPorId('nodos', act.nodo_id);
  const plantilla = plantillaConItems_(act.plantilla_id, act.plantilla_version);
  const hitos = filtrar('hitos', function (h) {
    return String(h.actividad_id) === String(act.id) && bool(h.activo);
  }).sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  const reportes = filtrar('reportes', function (r) {
    return String(r.actividad_id) === String(act.id) && bool(r.activo);
  }).sort(function (a, b) { return String(a.fecha) < String(b.fecha) ? 1 : -1; });

  // Lo que el contratista reportó: la revisión necesita verlo, no solo el resumen.
  const finales = reportes.filter(function (r) { return String(r.tipo) === 'FINAL'; });
  const ultimoFinal = finales[0] || null;
  const respuestasUltimo = ultimoFinal
    ? filtrar('respuestas', function (x) {
        return String(x.reporte_id) === String(ultimoFinal.id) && bool(x.activo);
      }).map(function (x) {
        return {
          item_id: x.item_id,
          valor: x.valor,
          cumple: x.cumple === '' ? null : bool(x.cumple),
          observacion: x.observacion || '',
        };
      })
    : [];
  const evidencias = filtrar('evidencias', function (e) {
    return String(e.actividad_id) === String(act.id) && bool(e.activo);
  }).map(function (e) {
    return {
      id: e.id, momento: e.momento, mime: e.mime, bytes: Number(e.bytes || 0),
      fecha_captura: e.fecha_captura, fecha_subida: e.fecha_subida,
      contiene_personas: bool(e.contiene_personas), publicable: bool(e.publicable),
    };
  });

  const resumen = actividadResumenBase_(act);
  const ritmo = calcularRitmo_(act);
  if (ritmo) resumen.ritmo = ritmo;
  const porHitos = avancePorHitos_(act.id);
  if (porHitos) resumen.avance_por_hitos = porHitos;

  return {
    actividad: resumen,
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
    ultimo_final: ultimoFinal ? {
      id: ultimoFinal.id,
      fecha: ultimoFinal.fecha,
      descripcion: ultimoFinal.descripcion || '',
      // La condición vive en lecturas_estado, ligada al reporte que la declaró.
      condicion_operativa: (function () {
        const lectura = filtrar('lecturas_estado', function (l) {
          return String(l.reporte_id) === String(ultimoFinal.id) && bool(l.activo);
        })[0];
        if (lectura) return lectura.condicion_operativa;
        return nodo ? (nodo.condicion_operativa || '') : '';
      })(),
      estado_revision: ultimoFinal.estado_revision,
      comentario_admin: ultimoFinal.comentario_admin || '',
      revisado_en: ultimoFinal.revisado_en || '',
    } : null,
    respuestas: respuestasUltimo,
    propuesta: (function () {
      if (!act.propuesta_id) return null;
      const p = buscarPorId('propuestas', act.propuesta_id);
      if (!p) return null;
      const autor = p.propuesta_por ? buscarPorId('usuarios', p.propuesta_por) : null;
      return {
        id: p.id,
        hallazgo: p.hallazgo || '',
        alcance_original: p.alcance || '',
        propuesta_por_nombre: autor ? (autor.nombre || autor.email) : '',
        creado_en: p.creado_en || '',
        fotos: fromJson(p.fotos_json, []).map(function (f) { return f.id; }),
        ajustes: fromJson(p.ajustes_json, {}),
      };
    })(),
    evidencias: evidencias,
  };
}

/** Edita una actividad existente. Solo ADMIN. */
function actividadesEditar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  return conBloqueo(function () { return editarActividad_(ctx, payload, id); });
}

function editarActividad_(ctx, payload, id) {
  limpiarCache('actividades');
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
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const motivo = exigirTexto(payload.motivo, 'motivo', 500);
  if (motivo.length < 10) fallar_('VALIDACION', 'Escribe el motivo de la cancelación (al menos 10 caracteres).');

  return conBloqueo(function () { return cancelarActividad_(ctx, payload, id, motivo); });
}

function cancelarActividad_(ctx, payload, id, motivo) {
  limpiarCache('actividades');
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
