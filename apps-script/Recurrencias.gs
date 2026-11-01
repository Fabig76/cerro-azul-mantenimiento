/**
 * Recurrencias.gs — planes de mantenimiento que generan actividades solas
 * (SPEC v1.2, RN-06 y RN-07).
 */

const FRECUENCIAS = ['SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CADA_N_DIAS'];

function recurrenciaResumen_(r) {
  const nodo = buscarPorId('nodos', r.nodo_id);
  const plantilla = r.plantilla_id ? buscarPorId('plantillas', r.plantilla_id) : null;
  const empresa = r.empresa_id ? buscarPorId('empresas', r.empresa_id) : null;
  return {
    id: r.id,
    nodo: nodo ? { id: nodo.id, codigo: nodo.codigo, nombre: nodo.nombre } : null,
    plantilla: plantilla ? plantilla.nombre : '',
    plantilla_id: r.plantilla_id || '',
    empresa: empresa ? empresa.razon_social : '',
    empresa_id: r.empresa_id || '',
    frecuencia: r.frecuencia,
    n_dias: Number(r.n_dias || 0),
    duracion_dias: Number(r.duracion_dias || 1),
    anticipacion_dias: Number(r.anticipacion_dias || 0),
    obligatoria_legal: bool(r.obligatoria_legal),
    proxima_fecha: fechaIso_(r.proxima_fecha),
    activa: bool(r.activa),
  };
}

function recurrenciasListar(ctx, payload) {
  const nodoId = payload.nodo_id || null;
  let lista = filtrar('recurrencias', function (r) {
    if (!bool(r.activo)) return false;
    if (nodoId && String(r.nodo_id) !== String(nodoId)) return false;
    return true;
  });
  if (ctx.rol === 'CONTRATISTA') {
    const asignados = nodosAsignados_(ctx.usuario.id);
    lista = lista.filter(function (r) {
      const n = buscarPorId('nodos', r.nodo_id);
      if (!n) return false;
      const propio = n.ruta_ids + '/' + n.id;
      return asignados.some(function (a) {
        const raiz = a.ruta_ids + '/' + a.id;
        return propio === raiz || propio.indexOf(raiz + '/') === 0;
      });
    });
  }
  lista.sort(function (a, b) { return fechaIso_(a.proxima_fecha) < fechaIso_(b.proxima_fecha) ? -1 : 1; });
  return { recurrencias: lista.map(recurrenciaResumen_) };
}

function recurrenciasGuardar(ctx, payload) {
  desdePortal_(payload);
  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) fallar_('NO_ENCONTRADO', 'La sección no existe.');

  const frecuencia = exigirEnEnum(payload.frecuencia || 'MENSUAL', 'frecuencia', FRECUENCIAS);
  const nDias = frecuencia === 'CADA_N_DIAS' ? Math.max(1, Number(payload.n_dias || 30)) : 0;
  const inicio = payload.proxima_fecha ? String(payload.proxima_fecha) : hoyIso();

  const datos = {
    nodo_id: nodoId,
    plantilla_id: payload.plantilla_id || '',
    empresa_id: payload.empresa_id || '',
    responsable_id: payload.responsable_id || '',
    frecuencia: frecuencia,
    n_dias: nDias,
    dia_preferido: payload.dia_preferido || '',
    duracion_dias: Math.max(1, Number(payload.duracion_dias || 1)),
    anticipacion_dias: Math.max(0, Number(payload.anticipacion_dias || 0)),
    obligatoria_legal: !!payload.obligatoria_legal,
    proxima_fecha: inicio,
    activa: true,
  };

  if (payload.id) {
    const r = buscarPorId('recurrencias', payload.id);
    if (!r) fallar_('NO_ENCONTRADO', 'La recurrencia no existe.');
    const despues = actualizar('recurrencias', payload.id, datos, ctx.usuario.email);
    auditar(ctx.usuario.email, 'RECURRENCIA_EDITADA', 'recurrencia', payload.id, r, datos);
    return { recurrencia: recurrenciaResumen_(despues) };
  }

  const nueva = insertar('recurrencias', Object.assign({ id: newId('REC'), activo: true }, datos), ctx.usuario.email);
  auditar(ctx.usuario.email, 'RECURRENCIA_CREADA', 'recurrencia', nueva.id, null,
    { nodo: nodo.codigo, frecuencia: frecuencia });
  return { recurrencia: recurrenciaResumen_(nueva) };
}

/** Pausa o reactiva una recurrencia. */
function recurrenciasPausar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const r = buscarPorId('recurrencias', id);
  if (!r) fallar_('NO_ENCONTRADO', 'La recurrencia no existe.');
  const activa = payload.activa === undefined ? !bool(r.activa) : !!payload.activa;
  const despues = actualizar('recurrencias', id, { activa: activa }, ctx.usuario.email);
  auditar(ctx.usuario.email, activa ? 'RECURRENCIA_REACTIVADA' : 'RECURRENCIA_PAUSADA', 'recurrencia', id, null, null);
  return { recurrencia: recurrenciaResumen_(despues) };
}

/** Crea las recurrencias que propone el tipo del elemento (Anexo B). */
function recurrenciasDesdeTipo(ctx, payload) {
  desdePortal_(payload);
  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo) fallar_('NO_ENCONTRADO', 'La sección no existe.');
  if (String(nodo.clase) !== 'ELEMENTO') fallar_('VALIDACION', 'Solo un elemento tiene plan por tipo.');
  if (!nodo.tipo_elemento_id) fallar_('VALIDACION', 'El elemento no tiene tipo asignado.');

  const planes = filtrar('plan_tipo', function (p) {
    return String(p.tipo_elemento_id) === String(nodo.tipo_elemento_id) && bool(p.activo);
  });
  if (!planes.length) fallar_('NO_ENCONTRADO', 'Ese tipo no tiene plan estándar configurado.');

  const creadas = [];
  planes.forEach(function (p) {
    const yaExiste = filtrar('recurrencias', function (r) {
      return String(r.nodo_id) === String(nodo.id) && String(r.plantilla_id) === String(p.plantilla_id) && bool(r.activo);
    })[0];
    if (yaExiste) return;
    const nueva = insertar('recurrencias', {
      id: newId('REC'),
      nodo_id: nodo.id,
      plantilla_id: p.plantilla_id,
      empresa_id: '',
      responsable_id: '',
      frecuencia: p.frecuencia,
      n_dias: p.frecuencia === 'CADA_N_DIAS' ? 1 : 0,
      dia_preferido: '',
      duracion_dias: 1,
      anticipacion_dias: p.frecuencia === 'CADA_N_DIAS' ? 0 : configNumero('dias_aviso_programado', 2),
      obligatoria_legal: bool(p.obligatoria_legal),
      proxima_fecha: hoyIso(),
      activa: true,
      activo: true,
    }, ctx.usuario.email);
    creadas.push(recurrenciaResumen_(nueva));
  });

  auditar(ctx.usuario.email, 'PLAN_DESDE_TIPO', 'nodo', nodo.id, null, { creadas: creadas.length });
  return { creadas: creadas, total: creadas.length };
}

/** Genera las actividades que ya tocan (RN-06 y RN-07). */
function generarActividadesPendientes(usuario) {
  const hoy = hoyIso();
  const creadas = [];
  const omitidas = [];

  filtrar('recurrencias', function (r) { return bool(r.activo) && bool(r.activa); }).forEach(function (r) {
    const proxima = fechaIso_(r.proxima_fecha);
    if (!proxima) return;
    const anticipacion = Number(r.anticipacion_dias || 0);
    const limite = sumarDias(hoy, anticipacion);
    if (proxima > limite) return;

    const abierta = filtrar('actividades', function (a) {
      return String(a.recurrencia_id) === String(r.id) &&
        ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA'].indexOf(String(a.estado)) >= 0;
    })[0];
    if (abierta) {
      // No se duplica (RN-06); si ya pasó, se marca vencida.
      if (proxima < hoy && !bool(abierta.vencida)) {
        actualizar('actividades', abierta.id, { vencida: true }, usuario || 'sistema');
      }
      omitidas.push({ recurrencia: r.id, motivo: 'ya tiene una instancia abierta' });
      return;
    }

    const nodo = buscarPorId('nodos', r.nodo_id);
    const plantilla = r.plantilla_id ? buscarPorId('plantillas', r.plantilla_id) : null;
    const duracion = Math.max(1, Number(r.duracion_dias || 1));
    const actividad = insertar('actividades', {
      id: newId('ACT'),
      titulo: (plantilla ? plantilla.nombre : 'Mantenimiento') + ' — ' + (nodo ? nodo.nombre : ''),
      descripcion: 'Generada automáticamente por el plan de mantenimiento.',
      nodo_id: r.nodo_id,
      plantilla_id: r.plantilla_id || '',
      plantilla_version: plantilla ? plantilla.version : '',
      empresa_id: r.empresa_id || '',
      responsable_id: r.responsable_id || '',
      tipo: duracion > 1 ? 'MULTIDIA' : 'RECURRENTE',
      origen: 'PLAN',
      novedad_id: '',
      recurrencia_id: r.id,
      fecha_inicio_plan: proxima,
      fecha_fin_plan: sumarDias(proxima, duracion - 1),
      dias_plan: duracion,
      prioridad: 'MEDIA',
      estado: 'PROGRAMADA',
      vencida: false,
      en_riesgo: false,
      avance_reportado_pct: 0,
      avance_aprobado_pct: 0,
      obligatoria_legal: bool(r.obligatoria_legal),
      afecta_uso: false,
      publicable: true,
      activo: true,
    }, usuario || 'sistema');

    const intervalo = Number(r.n_dias) > 0 ? Number(r.n_dias) : intervaloDias_(r.frecuencia) || 30;
    actualizar('recurrencias', r.id, { proxima_fecha: sumarDias(proxima, intervalo) }, usuario || 'sistema');
    creadas.push({ actividad: actividad.id, titulo: actividad.titulo, fecha: proxima });
  });

  return { creadas: creadas.length, detalle: creadas, omitidas: omitidas.length };
}
