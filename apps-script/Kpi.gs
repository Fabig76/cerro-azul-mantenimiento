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

// ---------------------------------------------------------------------------
// Ficha de desempeño por empresa (SPEC v1.6, sección 5.6)
// ---------------------------------------------------------------------------

/**
 * Ficha de una empresa para un periodo. Reutiliza empresaKpi_ mes a mes: la misma
 * cuenta que el informe mensual, no una copia (CLAUDE.md, error 4).
 */
function fichaEmpresa_(empresaId, desde, hasta) {
  const empresa = buscarPorId('empresas', empresaId);
  if (!empresa) fallar_('NO_ENCONTRADO', 'La empresa no existe.');

  const hoy = hoyIso();
  const h = hasta ? fechaIso_(hasta) : hoy;
  const d = desde ? fechaIso_(desde) : sumarMeses_(h, -12);
  if (d > h) fallar_('VALIDACION', 'El periodo está al revés: «desde» es posterior a «hasta».');

  const tolerancia = configNumero('tolerancia_dias', 2);
  const actividades = filtrar('actividades', function (a) { return bool(a.activo); });
  const reportes = filas('reportes');

  // Meses del periodo
  const meses = [];
  let cursor = d.slice(0, 7);
  const fin = h.slice(0, 7);
  let guardia = 0;
  while (cursor <= fin && guardia < 60) {
    meses.push(cursor);
    const [anio, mes] = cursor.split('-').map(Number);
    const siguiente = mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
    cursor = siguiente[0] + '-' + ('0' + siguiente[1]).slice(-2);
    guardia++;
  }

  const tendencia = meses.map(function (m) {
    const k = empresaKpi_(empresa, actividades, reportes, tolerancia, m);
    return {
      mes: m,
      programadas: k.programadas,
      cumplidas: k.cumplidas,
      a_tiempo_pct: k.a_tiempo_pct,
      rechazo_pct: k.rechazo_pct,
      sin_datos: k.programadas === 0,
    };
  });

  const conDatos = tendencia.filter(function (t) { return !t.sin_datos; });
  const suma = function (campo) {
    return conDatos.reduce(function (s, t) { return s + Number(t[campo] || 0); }, 0);
  };
  const promedioDe = function (campo) {
    const validos = conDatos.filter(function (t) { return t[campo] !== null && t[campo] !== undefined; });
    if (!validos.length) return null;
    return Math.round(validos.reduce(function (s, t) { return s + Number(t[campo]); }, 0) / validos.length);
  };

  // Trabajos del periodo: los que terminan dentro, sin canceladas
  const delPeriodo = actividades.filter(function (a) {
    if (String(a.empresa_id) !== String(empresaId)) return false;
    if (String(a.estado) === 'CANCELADA') return false;
    const f = fechaIso_(a.fecha_fin_plan);
    return f && f >= d && f <= h;
  });
  const terminados = delPeriodo.filter(function (a) {
    return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0;
  });
  const aTiempo = terminados.filter(function (a) {
    const f = fechaIso_(a.fecha_fin_plan);
    const r = fechaIso_(a.fecha_reporte_final);
    return f && r && r <= sumarDias(f, tolerancia);
  }).length;

  // Propuestas y dinero (sección 1)
  const usuariosEmpresa = {};
  filtrar('usuarios', function (u) { return !u.suprimido_en && String(u.empresa_id) === String(empresaId); })
    .forEach(function (u) { usuariosEmpresa[u.id] = true; });
  const propuestas = filtrar('propuestas', function (p) {
    return bool(p.activo) && (String(p.empresa_id) === String(empresaId) || usuariosEmpresa[p.propuesta_por]);
  });
  const valorAprobado = propuestas.reduce(function (s, p) {
    return s + Number(p.valor_aprobado || 0);
  }, 0);

  // Novedades en los equipos donde trabajó
  const nodosPropios = {};
  actividades.filter(function (a) { return String(a.empresa_id) === String(empresaId); })
    .forEach(function (a) { nodosPropios[a.nodo_id] = true; });
  const novedades = filtrar('novedades', function (n) {
    return bool(n.activo) && nodosPropios[n.nodo_id];
  });

  const pctATiempo = terminados.length ? Math.round((aTiempo / terminados.length) * 100) : null;
  const pctDevueltos = suma('rechazo_pct') && conDatos.length
    ? Math.round(conDatos.reduce(function (s, t) { return s + Number(t.rechazo_pct || 0); }, 0) / conDatos.length)
    : null;

  return {
    empresa: {
      id: empresa.id, razon_social: empresa.razon_social, nit: empresa.nit || '',
      activa: bool(empresa.activo),
      contrato_numero: empresa.contrato_numero || '',
      vigencia_hasta: fechaIso_(empresa.vigencia_hasta),
      poliza_vence: fechaIso_(empresa.poliza_vence),
      dias_contrato: empresa.vigencia_hasta ? diasEntre(hoy, fechaIso_(empresa.vigencia_hasta)) : null,
      dias_poliza: empresa.poliza_vence ? diasEntre(hoy, fechaIso_(empresa.poliza_vence)) : null,
    },
    periodo: { desde: d, hasta: h, meses: meses.length },
    indicadores: {
      asignados: delPeriodo.length,
      terminados: terminados.length,
      a_tiempo: aTiempo,
      a_tiempo_pct: pctATiempo,
      devueltos_pct: pctDevueltos,
      vencidos_hoy: actividades.filter(function (a) {
        return String(a.empresa_id) === String(empresaId) && bool(a.vencida);
      }).length,
      dias_para_iniciar: promedioDe('a_tiempo_pct') === null ? null :
        empresaKpi_(empresa, actividades, reportes, tolerancia, meses[meses.length - 1]).dias_para_iniciar,
      novedades_abiertas: novedades.filter(function (n) {
        return String(n.estado) !== 'RESUELTA';
      }).length,
      novedades_resueltas: novedades.filter(function (n) {
        return String(n.estado) === 'RESUELTA';
      }).length,
      propuestas_enviadas: propuestas.length,
      propuestas_aprobadas: propuestas.filter(function (p) { return String(p.estado) === 'APROBADA'; }).length,
      valor_aprobado: valorAprobado,
    },
    tendencia: tendencia,
    meses_sin_datos: tendencia.filter(function (t) { return t.sin_datos; }).map(function (t) { return t.mes; }),
    semaforo: semaforoFicha_(terminados.length, pctATiempo, pctDevueltos),
  };
}

/** Decisión D: los umbrales viven en config y se pueden ajustar sin tocar código. */
function semaforoFicha_(terminados, pctATiempo, pctDevueltos) {
  const verdeA = configNumero('ficha_verde_a_tiempo', 90);
  const verdeR = configNumero('ficha_verde_devueltos', 10);
  const rojoA = configNumero('ficha_rojo_a_tiempo', 70);
  const rojoR = configNumero('ficha_rojo_devueltos', 25);

  // RN-45: con pocos trabajos no se juzga.
  if (terminados < 5) {
    return { estado: 'POCOS_DATOS', etiqueta: 'Pocos datos',
      motivo: 'Menos de 5 trabajos terminados en el periodo.' };
  }
  const a = pctATiempo === null ? 0 : pctATiempo;
  const r = pctDevueltos === null ? 0 : pctDevueltos;

  if (a >= verdeA && r <= verdeR) return { estado: 'VERDE', etiqueta: 'Buen desempeño' };
  if (a < rojoA || r > rojoR) return { estado: 'ROJO', etiqueta: 'Para revisar el contrato' };
  return { estado: 'NARANJA', etiqueta: 'Con cosas por mejorar' };
}

/** Suma meses a una fecha ISO, sin líos de fin de mes. */
function sumarMeses_(iso, meses) {
  const partes = String(iso).slice(0, 10).split('-').map(Number);
  let anio = partes[0];
  let mes = partes[1] + Number(meses || 0);
  while (mes <= 0) { mes += 12; anio--; }
  while (mes > 12) { mes -= 12; anio++; }
  return anio + '-' + ('0' + mes).slice(-2) + '-' + ('0' + partes[2]).slice(-2);
}

/** Acción: la ficha de una empresa. */
function empresasFicha(ctx, payload) {
  const id = exigirTexto(payload.empresa_id, 'empresa_id');
  return fichaEmpresa_(id, payload.desde, payload.hasta);
}

/** Acción: los seis indicadores del inicio del consejo, en una sola llamada. */
function consejoResumen(ctx) {
  const hoy = hoyIso();
  const mes = mesDe_(hoy);
  const kpis = kpisMes(mes);

  const abiertas = filtrar('actividades', function (a) {
    return bool(a.activo) && ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA', 'RECHAZADA'].indexOf(String(a.estado)) >= 0;
  });
  const vencidas = abiertas.filter(function (a) { return bool(a.vencida); });

  // Reportes esperando revisión y hace cuántos días el más viejo
  const pendientes = filtrar('reportes', function (r) {
    return bool(r.activo) && String(r.estado_revision) === 'PENDIENTE';
  });
  const masViejo = pendientes.reduce(function (max, r) {
    const dias = Math.floor((Date.now() - new Date(String(r.fecha)).getTime()) / 86400000);
    return dias > max ? dias : max;
  }, 0);

  // Tiempo medio de revisión del administrador (últimos 30 días)
  const desde30 = sumarDias(hoy, -30);
  const revisados = filtrar('reportes', function (r) {
    return bool(r.activo) && r.revisado_en && fechaIso_(r.revisado_en) >= desde30;
  });
  const diasRevision = revisados.map(function (r) {
    const a = new Date(String(r.fecha)).getTime();
    const b = new Date(String(r.revisado_en)).getTime();
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, (b - a) / 86400000);
  }).filter(function (v) { return v !== null; });

  // Semáforo de cada empresa con ficha
  const empresas = filtrar('empresas', function (e) { return bool(e.activo); });
  const semaforos = empresas.map(function (e) {
    const f = fichaEmpresa_(e.id, sumarMeses_(hoy, -12), hoy);
    return {
      id: e.id, razon_social: e.razon_social,
      semaforo: f.semaforo.estado, etiqueta: f.semaforo.etiqueta,
      terminados: f.indicadores.terminados,
      valor_aprobado: f.indicadores.valor_aprobado,
    };
  });

  return {
    mes: mes,
    cumplimiento_pct: kpis.conjunto ? kpis.conjunto.cumplimiento_pct : null,
    vencidos: vencidas.length,
    por_revisar: pendientes.length,
    dias_el_mas_viejo: masViejo,
    revision_promedio_dias: diasRevision.length
      ? Math.round((diasRevision.reduce(function (s, v) { return s + v; }, 0) / diasRevision.length) * 10) / 10
      : null,
    valor_anio_por_empresa: semaforos.map(function (s) {
      return { id: s.id, razon_social: s.razon_social, valor_aprobado: s.valor_aprobado };
    }),
    empresas: semaforos,
  };
}
