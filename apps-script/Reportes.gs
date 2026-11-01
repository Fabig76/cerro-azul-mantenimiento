/**
 * Reportes.gs — inicio de actividad, reporte final y revisión del administrador
 * (SPEC v1.2, sec. 7.3, 10 y RN-03, RN-03a, RN-04).
 */

/** Inicia la actividad exigiendo 1-2 fotos ANTES (RN-03a). El admin puede justificar la excepción. */
function actividadesIniciar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  const act = buscarPorId('actividades', id);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (!puedeEjecutarActividad_(ctx, act)) fallar_('PROHIBIDO', 'No puedes ejecutar actividades en esa sección.');
  if (['EN_EJECUCION', 'REPORTADA', 'APROBADA', 'CERRADA'].indexOf(String(act.estado)) >= 0) {
    fallar_('ESTADO_INVALIDO', 'La actividad ya fue iniciada o cerrada.');
  }
  if (String(act.estado) === 'CANCELADA') fallar_('ESTADO_INVALIDO', 'La actividad está cancelada.');

  const antes = evidenciasDe_(id).antes;
  const ids = Array.isArray(payload.evidencia_ids) ? payload.evidencia_ids : [];
  const vinculadas = antes.filter(function (e) { return ids.indexOf(e.id) >= 0; });
  const total = vinculadas.length || antes.length;
  const motivo = payload.motivo_sin_foto ? String(payload.motivo_sin_foto).slice(0, 300) : '';

  if (total === 0) {
    if (ctx.rol !== 'ADMIN' || !motivo) {
      fallar_('VALIDACION', 'Sube al menos una foto de ANTES para poder iniciar (RN-03a).');
    }
    if (motivo.length < 10) fallar_('VALIDACION', 'Explica con al menos 10 caracteres por qué se inicia sin foto.');
  }
  if (total > 2) fallar_('VALIDACION', 'Máximo dos fotos de ANTES.');

  // Las fotos deben ser de ahora, no de la semana pasada (4.3 / M1).
  if (total > 0) {
    const minutos = configNumero('minutos_inicio_antes', 30);
    const recientes = vinculadas.length ? vinculadas : antes;
    const vieja = recientes.filter(function (e) {
      const subida = new Date(String(e.fecha_subida));
      return isNaN(subida.getTime()) || (Date.now() - subida.getTime()) > minutos * 60000;
    })[0];
    if (vieja) {
      fallar_('VALIDACION', 'La foto de ANTES debe tomarse al iniciar (máximo ' + minutos +
        ' minutos antes). Vuelve a tomarla y reintenta.');
    }
  }

  const cambios = {
    estado: 'EN_EJECUCION',
    fecha_inicio_real: ahoraIso(),
  };
  if (total === 0) cambios.inicio_sin_foto_motivo = motivo;

  return conBloqueo(function () {
    limpiarCache('actividades');
    const act = buscarPorId('actividades', id);
    if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
    if (!puedeEjecutarActividad_(ctx, act)) fallar_('PROHIBIDO', 'No tienes acceso a esta actividad.');
    if (['EN_EJECUCION', 'REPORTADA', 'APROBADA', 'CERRADA'].indexOf(String(act.estado)) >= 0) {
      fallar_('ESTADO_INVALIDO', 'La actividad ya fue iniciada o cerrada.');
    }
    if (String(act.estado) === 'CANCELADA') fallar_('ESTADO_INVALIDO', 'La actividad está cancelada.');

    const despues = actualizar('actividades', id, cambios, ctx.usuario.email);
    auditar(ctx.usuario.email, 'ACTIVIDAD_INICIADA', 'actividad', id,
      { estado: act.estado }, { estado: 'EN_EJECUCION', fotos_antes: total, motivo: motivo || null });
    return { actividad: actividadResumen_(despues), fotos_antes: total };
  });
}

/** Calcula el cumplimiento de un ítem según su tipo y su criterio (RN-17). */
function evaluarItem_(item, valor) {
  const tipo = String(item.tipo_respuesta);
  if (tipo === 'SI_NO') {
    const v = String(valor || '').trim().toUpperCase();
    if (!v) return null;
    return v === 'SI' || v === 'SÍ';
  }
  if (tipo === 'NUMERO') {
    const n = Number(String(valor).replace(',', '.'));
    if (isNaN(n)) return null;
    const min = item.valor_min === '' || item.valor_min === null ? null : Number(item.valor_min);
    const max = item.valor_max === '' || item.valor_max === null ? null : Number(item.valor_max);
    if (min === null && max === null) return null; // sin rango: se registra y no penaliza
    if (min !== null && n < min) return false;
    if (max !== null && n > max) return false;
    return true;
  }
  return null;
}

/** Reporte final del contratista. */
function reportesCrear(ctx, payload) {
  desdePortal_(payload);
  const actividadId = exigirTexto(payload.actividad_id, 'actividad_id');
  const act = buscarPorId('actividades', actividadId);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (!puedeEjecutarActividad_(ctx, act)) fallar_('PROHIBIDO', 'No puedes ejecutar actividades en esa sección.');
  if (['APROBADA', 'CERRADA', 'CANCELADA'].indexOf(String(act.estado)) >= 0) {
    fallar_('ESTADO_INVALIDO', 'La actividad ya está cerrada.');
  }

  const tipo = exigirEnEnum(payload.tipo || 'FINAL', 'tipo', ['AVANCE', 'FINAL']);
  const plantilla = plantillaConItems_(act.plantilla_id, act.plantilla_version);
  const items = plantilla ? plantilla.items : [];
  const respuestas = Array.isArray(payload.respuestas) ? payload.respuestas : [];
  const porItem = {};
  respuestas.forEach(function (r) {
    if (r && r.item_id) porItem[String(r.item_id)] = r;
  });

  // RN-03: obligatorios respondidos y fotos suficientes.
  if (tipo === 'FINAL') {
    const faltantes = items.filter(function (i) {
      return bool(i.obligatorio) && !porItem[String(i.id)];
    });
    if (faltantes.length) {
      fallar_('VALIDACION', 'Faltan ' + faltantes.length + ' ítem(s) obligatorios del checklist.');
    }

    const ev = evidenciasDe_(actividadId);
    const vinculo = Array.isArray(payload.evidencia_ids) ? payload.evidencia_ids : [];
    const despues = ev.despues.filter(function (e) { return !vinculo.length || vinculo.indexOf(e.id) >= 0; });
    if (!ev.antes.length && String(act.estado) !== 'EN_EJECUCION') {
      fallar_('VALIDACION', 'No hay foto de ANTES: inicia la actividad con evidencia primero.');
    }
    if (!despues.length) fallar_('VALIDACION', 'Falta al menos una foto de DESPUÉS.');
    if (despues.length > 2) fallar_('VALIDACION', 'Máximo dos fotos de DESPUÉS.');

    const conFotoObligatoria = items.filter(function (i) { return bool(i.requiere_foto); });
    if (conFotoObligatoria.length && !despues.length) {
      fallar_('VALIDACION', 'Este checklist exige foto de evidencia en algunos ítems.');
    }

    const nodo = buscarPorId('nodos', act.nodo_id);
    if (nodo && String(nodo.clase) === 'ELEMENTO' && !payload.condicion_operativa) {
      falarEstadoCondicion_();
    }
  }

  // Pesos y cumplimiento.
  let pesoTotal = 0;
  let pesoCumple = 0;
  const filasRespuestas = [];
  items.forEach(function (i) {
    const r = porItem[String(i.id)];
    if (!r) return;
    const cumple = evaluarItem_(i, r.valor);
    const peso = Number(i.peso || 1);
    pesoTotal += peso;
    if (cumple === true) pesoCumple += peso;
    filasRespuestas.push({
      id: newId('RES'),
      reporte_id: '',
      item_id: i.id,
      valor: r.valor === undefined ? '' : String(r.valor),
      cumple: cumple === null ? '' : cumple,
      observacion: r.observacion ? String(r.observacion).slice(0, 500) : '',
      activo: true,
    });
  });
  // Sin checklist no hay pesos: un reporte FINAL significa trabajo terminado.
  let avance;
  if (tipo === 'AVANCE') {
    // Mientras se ejecuta: cuenta lo avanzado, no lo aprobado.
    const porEtapas = avancePorHitos_(actividadId, true);
    if (porEtapas && porEtapas.hitos) avance = porEtapas.pct;
    else if (pesoTotal || items.length) avance = Math.round((pesoCumple / pesoTotal) * 100);
    else avance = Number(payload.pct_declarado || 0);
  } else {
    avance = pesoTotal ? Math.round((pesoCumple / pesoTotal) * 100) : 100;
  }

  const reporte = conBloqueo(function () {
    const cabecera = insertar('reportes', {
      id: newId('REP'),
      actividad_id: actividadId,
      hito_id: payload.hito_id || '',
      usuario_id: ctx.usuario.id,
      fecha: ahoraIso(),
      tipo: tipo,
      pct_declarado: Number(payload.pct_declarado || avance),
      descripcion: payload.descripcion ? String(payload.descripcion).slice(0, 2000) : '',
      horas: Number(payload.horas || 0),
      estado_revision: 'PENDIENTE',
      comentario_admin: '',
      revisado_por: '',
      revisado_en: '',
      activo: true,
    }, ctx.usuario.email);

    filasRespuestas.forEach(function (f) { f.reporte_id = cabecera.id; });
    if (filasRespuestas.length) insertarVarias('respuestas', filasRespuestas, ctx.usuario.email);

    if (payload.hito_id) {
      const hito = buscarPorId('hitos', payload.hito_id);
      if (!hito || String(hito.actividad_id) !== String(actividadId)) {
        fallar_('VALIDACION', 'El hito no pertenece a esta actividad.');
      }
      actualizar('hitos', payload.hito_id, { estado: 'REPORTADO' }, ctx.usuario.email);
    }

    const cambiosAct = {
      avance_reportado_pct: avance,
      estado: tipo === 'FINAL' ? 'REPORTADA' : 'EN_EJECUCION',
    };
    if (tipo === 'FINAL') cambiosAct.fecha_reporte_final = ahoraIso();
    actualizar('actividades', actividadId, cambiosAct, ctx.usuario.email);

    // La condición operativa es del equipo, no de la actividad.
    if (payload.condicion_operativa) {
      const nodoAct = buscarPorId('nodos', act.nodo_id);
      if (nodoAct) {
        const condicion = String(payload.condicion_operativa).slice(0, 80);
        insertar('lecturas_estado', {
          id: newId('LEC'),
          nodo_id: nodoAct.id,
          fecha: hoyIso(),
          condicion_operativa: condicion,
          origen: 'REPORTE',
          reporte_id: cabecera.id,
          usuario_id: ctx.usuario.id,
          nota: '',
          activo: true,
        }, ctx.usuario.email);
        actualizar('nodos', nodoAct.id, { condicion_operativa: condicion }, ctx.usuario.email);
      }
    }
    return cabecera;
  });

  auditar(ctx.usuario.email, tipo === 'FINAL' ? 'REPORTE_FINAL' : 'REPORTE_AVANCE',
    'reporte', reporte.id, null, { actividad: actividadId, avance: avance });

  return { reporte_id: reporte.id, avance_reportado_pct: avance, estado: tipo === 'FINAL' ? 'REPORTADA' : 'EN_EJECUCION' };
}

function falarEstadoCondicion_() {
  fallar_('VALIDACION', 'Indica en qué condición queda el elemento (RN-03).');
}

/** Revisión del administrador: aprobar o rechazar con motivo (RN-04). */
function reportesRevisar(ctx, payload) {
  desdePortal_(payload);
  const reporteId = exigirTexto(payload.reporte_id, 'reporte_id');
  const decision = exigirEnEnum(payload.decision, 'decision', ['APROBAR', 'RECHAZAR']);
  const comentario = payload.comentario ? String(payload.comentario).slice(0, 1000) : '';
  if (decision === 'RECHAZAR' && comentario.length < 5) {
    fallar_('VALIDACION', 'Para rechazar escribe el motivo.');
  }

  return conBloqueo(function () {
    limpiarCache('reportes');
    const reporte = buscarPorId('reportes', reporteId);
    if (!reporte) fallar_('NO_ENCONTRADO', 'El reporte no existe.');
    if (String(reporte.estado_revision) !== 'PENDIENTE') fallar_('ESTADO_INVALIDO', 'Ese reporte ya fue revisado.');
    const act = buscarPorId('actividades', reporte.actividad_id);
    if (!act) fallar_('NO_ENCONTRADO', 'La actividad del reporte no existe.');
    actualizar('reportes', reporteId, {
      estado_revision: decision === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
      comentario_admin: comentario,
      revisado_por: ctx.usuario.email,
      revisado_en: ahoraIso(),
    }, ctx.usuario.email);

    const cambios = {};
    if (decision === 'RECHAZAR') encolar_(reporte.usuario_id, 'REPORTE_RECHAZADO', reporteId);
    if (decision === 'APROBAR' && reporte.hito_id) {
      actualizar('hitos', reporte.hito_id, { estado: 'APROBADO', fecha_aprobacion: hoyIso() }, ctx.usuario.email);
    }

    if (decision === 'APROBAR') {
      let avance = Number(reporte.pct_declarado || 0);
      const porHitos = avancePorHitos_(act.id);
      if (porHitos && reporte.hito_id) {
        avance = porHitos.pct;
      } else if (!filtrar('respuestas', function (r) {
        return String(r.reporte_id) === String(reporteId) && bool(r.activo);
      }).length) {
        // Sin checklist respondido no hay pesos: aprobar equivale a trabajo terminado.
        avance = 100;
      }
      // Antes se calculaba y no se guardaba: la actividad quedaba en 0 %.
      cambios.avance_aprobado_pct = avance;
      cambios.fecha_aprobacion = ahoraIso();
      cambios.vencida = false;
      cambios.ultimo_mant_en = hoyIso();
      if (bool(config('cierre_automatico'))) cambios.estado = 'CERRADA';
    } else {
      cambios.estado = 'RECHAZADA';
    }
    const actActualizada = actualizar('actividades', act.id, cambios, ctx.usuario.email);

    // La condición reportada queda como lectura del elemento (RN-15).
    if (decision === 'APROBAR' && actActualizada.condicion_operativa) {
      insertar('lecturas_estado', {
        id: newId('LEC'),
        nodo_id: actActualizada.nodo_id,
        fecha: hoyIso(),
        condicion_operativa: actActualizada.condicion_operativa,
        origen: 'REPORTE',
        reporte_id: reporteId,
        usuario_id: ctx.usuario.id,
        nota: comentario,
        activo: true,
      }, ctx.usuario.email);
    }
    if (decision === 'APROBAR') recalcularSalud_(actActualizada.nodo_id, ctx.usuario.email);

    auditar(ctx.usuario.email, decision === 'APROBAR' ? 'REPORTE_APROBADO' : 'REPORTE_RECHAZADO',
      'reporte', reporteId, { estado: reporte.estado_revision }, { estado: cambios.estado, comentario: comentario });

    return {
      actividad: actividadResumen_(actActualizada),
      estado_revision: decision === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
    };
  });
}
