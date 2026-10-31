/**
 * Hitos.gs — trabajos de varios días divididos en etapas con peso (SPEC v1.2, sec. 5.4).
 */

/** Reemplaza los hitos pendientes de una actividad. Solo ADMIN. */
function hitosGuardar(ctx, payload) {
  const actividadId = exigirTexto(payload.actividad_id, 'actividad_id');
  const act = buscarPorId('actividades', actividadId);
  if (!act) fallar_('NO_ENCONTRADO', 'La actividad no existe.');
  if (['APROBADA', 'CERRADA', 'CANCELADA'].indexOf(String(act.estado)) >= 0) {
    fallar_('ESTADO_INVALIDO', 'La actividad ya está cerrada.');
  }
  const lista = Array.isArray(payload.hitos) ? payload.hitos : [];
  if (!lista.length) fallar_('VALIDACION', 'Agrega al menos un hito.');

  const total = lista.reduce(function (s, h) { return s + (Number(h.peso) || 1); }, 0);
  if (total <= 0) fallar_('VALIDACION', 'Los pesos deben sumar más que cero.');

  return conBloqueo(function () {
    const previos = filtrar('hitos', function (h) {
      return String(h.actividad_id) === actividadId && bool(h.activo);
    });
    const aprobados = previos.filter(function (h) { return String(h.estado) === 'APROBADO'; });
    if (aprobados.length) {
      fallar_('CONFLICTO', 'Ya hay hitos aprobados: no se puede reemplazar el plan.');
    }
    previos.forEach(function (h) {
      actualizar('hitos', h.id, { activo: false, estado: 'CANCELADO' }, ctx.usuario.email);
    });

    const nuevos = insertarVarias('hitos', lista.map(function (h, i) {
      return {
        id: newId('HIT'),
        actividad_id: actividadId,
        orden: i + 1,
        nombre: String(h.nombre || 'Hito ' + (i + 1)).slice(0, 120),
        peso: Number(h.peso) || 1,
        fecha_plan: h.fecha_plan || '',
        estado: 'PENDIENTE',
        fecha_aprobacion: '',
        activo: true,
      };
    }), ctx.usuario.email);

    if (String(act.tipo) !== 'MULTIDIA') {
      actualizar('actividades', actividadId, { tipo: 'MULTIDIA' }, ctx.usuario.email);
    }
    auditar(ctx.usuario.email, 'HITOS_GUARDADOS', 'actividad', actividadId, { antes: previos.length }, { hitos: nuevos.length });
    return { hitos: nuevos.length, peso_total: total };
  });
}

/** Avance aprobado de una actividad con hitos: suma de pesos aprobados. */
function avancePorHitos_(actividadId) {
  const hitos = filtrar('hitos', function (h) {
    return String(h.actividad_id) === String(actividadId) && bool(h.activo);
  });
  if (!hitos.length) return null;
  const total = hitos.reduce(function (s, h) { return s + (Number(h.peso) || 1); }, 0);
  const aprobado = hitos.filter(function (h) { return String(h.estado) === 'APROBADO'; })
    .reduce(function (s, h) { return s + (Number(h.peso) || 1); }, 0);
  return { pct: total ? Math.round((aprobado / total) * 100) : 0, hitos: hitos.length, aprobados: hitos.filter(function (h) { return String(h.estado) === 'APROBADO'; }).length };
}

/**
 * Ritmo esperado de una actividad de varios días:
 * días transcurridos sobre el plan. Si el avance va muy por debajo, queda en riesgo.
 */
function calcularRitmo_(act) {
  const inicio = fechaIso_(act.fecha_inicio_plan);
  const fin = fechaIso_(act.fecha_fin_plan);
  if (!inicio || !fin) return null;
  const diasPlan = Math.max(1, Number(act.dias_plan) || (diasEntre(inicio, fin) + 1));
  const transcurridos = Math.max(0, Math.min(diasPlan, diasEntre(inicio, hoyIso()) + 1));
  const esperado = Math.round((transcurridos / diasPlan) * 100);
  const avance = Number(act.avance_aprobado_pct || 0);
  const umbral = configNumero('umbral_riesgo_pts', 20);
  return {
    esperado: esperado,
    avance: avance,
    dias_plan: diasPlan,
    dias_transcurridos: transcurridos,
    atraso: avance - esperado,
    en_riesgo: avance - esperado < -umbral && ['CERRADA', 'CANCELADA'].indexOf(String(act.estado)) < 0,
  };
}

/** Recalcula la bandera de riesgo de una actividad y la guarda si cambió. */
function actualizarRiesgo_(act, usuario) {
  const r = calcularRitmo_(act);
  if (!r) return null;
  if (bool(act.en_riesgo) !== r.en_riesgo) {
    actualizar('actividades', act.id, { en_riesgo: r.en_riesgo }, usuario || 'sistema');
  }
  return r;
}
