/**
 * Kpi.gs — indicadores del mes por conjunto y por empresa (SPEC v1.2, sec. 5.5).
 * Funciones de cálculo, sin pantalla: la presentación vive en el portal.
 */

function empresaKpi_(empresa, actividades, reportes, tolerancia, mes) {
  const propias = actividades.filter(function (a) { return String(a.empresa_id) === String(empresa.id); });
  const delMes = propias.filter(function (a) {
    return String(a.estado) !== 'CANCELADA' && mesDe_(a.fecha_fin_plan) === mes;
  });
  const cerradas = propias.filter(function (a) {
    return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0;
  });
  const cerradasMes = delMes.filter(function (a) {
    return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0;
  });

  const aTiempo = cerradasMes.filter(function (a) {
    const fin = fechaIso_(a.fecha_fin_plan);
    const rep = fechaIso_(a.fecha_reporte_final);
    if (!fin || !rep) return false;
    return rep <= sumarDias(fin, tolerancia);
  }).length;

  const vencidas = propias.filter(function (a) { return bool(a.vencida); }).length;

  // Reportes de sus actividades
  const ids = {};
  propias.forEach(function (a) { ids[a.id] = true; });
  const mios = reportes.filter(function (r) { return ids[r.actividad_id]; });
  const revisados = mios.filter(function (r) { return String(r.estado_revision) !== 'PENDIENTE'; });
  const rechazados = revisados.filter(function (r) { return String(r.estado_revision) === 'RECHAZADO'; }).length;

  // Tiempo medio de respuesta: de asignación a inicio
  const conInicio = propias.filter(function (a) { return a.fecha_inicio_real && a.fecha_inicio_plan; });
  const diasInicio = conInicio.map(function (a) {
    return Math.max(0, diasEntre(fechaIso_(a.fecha_inicio_plan), fechaIso_(a.fecha_inicio_real)));
  });

  // Tiempo medio de aprobación: de reporte final a aprobación
  const conApro = propias.filter(function (a) { return a.fecha_reporte_final && a.fecha_aprobacion; });
  const diasApro = conApro.map(function (a) {
    return Math.max(0, diasEntre(fechaIso_(a.fecha_reporte_final), fechaIso_(a.fecha_aprobacion)));
  });

  function promedio(lista) {
    if (!lista.length) return null;
    return Math.round((lista.reduce(function (s, n) { return s + n; }, 0) / lista.length) * 10) / 10;
  }

  const programadas = delMes.length;
  return {
    id: empresa.id,
    razon_social: empresa.razon_social,
    nit: empresa.nit || '',
    vigencia_hasta: fechaIso_(empresa.vigencia_hasta),
    vencida: !!(empresa.vigencia_hasta && fechaIso_(empresa.vigencia_hasta) < hoyIso()),
    programadas: programadas,
    cumplidas: cerradasMes.length,
    cumplimiento_pct: programadas ? Math.round((cerradasMes.length / programadas) * 100) : null,
    a_tiempo: aTiempo,
    a_tiempo_pct: cerradasMes.length ? Math.round((aTiempo / cerradasMes.length) * 100) : null,
    vencidas: vencidas,
    total_cerradas: cerradas.length,
    rechazo_pct: revisados.length ? Math.round((rechazados / revisados.length) * 100) : null,
    dias_para_iniciar: promedio(diasInicio),
    dias_para_aprobar: promedio(diasApro),
  };
}

/** Panel completo del mes: conjunto + empresas. */
function kpisMes(mes) {
  const tolerancia = configNumero('tolerancia_dias', 2);
  const m = mes || mesDe_(hoyIso());
  const actividades = filtrar('actividades', function (a) { return bool(a.activo); });
  const reportes = filas('reportes');
  // El mes en curso muestra solo las activas; los meses pasados incluyen las inactivas,
  // o su historial desaparecería del informe al desactivarlas.
  const mesActual = mesDe_(hoyIso());
  const empresas = filtrar('empresas', function (e) {
    return bool(e.activo) || String(m) !== mesActual;
  });

  const delMes = actividades.filter(function (a) {
    return String(a.estado) !== 'CANCELADA' && mesDe_(a.fecha_fin_plan) === m;
  });
  const cerradas = delMes.filter(function (a) {
    return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0;
  });

  const conjunto = {
    mes: m,
    programadas: delMes.length,
    ejecutadas: cerradas.length,
    cumplimiento_pct: delMes.length ? Math.round((cerradas.length / delMes.length) * 100) : null,
    vencidas: actividades.filter(function (a) { return bool(a.vencida); }).length,
    en_riesgo: actividades.filter(function (a) { return bool(a.en_riesgo); }).length,
    reportes_pendientes: reportes.filter(function (r) { return String(r.estado_revision) === 'PENDIENTE'; }).length,
  };

  const porEmpresa = empresas.map(function (e) {
    return empresaKpi_(e, actividades, reportes, tolerancia, m);
  }).sort(function (a, b) {
    return (b.programadas || 0) - (a.programadas || 0);
  });

  return { conjunto: conjunto, empresas: porEmpresa };
}
