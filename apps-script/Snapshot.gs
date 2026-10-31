/**
 * Snapshot.gs — lo único que ve el público (SPEC v1.2, sec. 9.1 y RN-08).
 * Regla de oro: nada de correos, teléfonos, nombres de personas, fichas técnicas,
 * ids de Drive privados ni hijos de nodos sensibles.
 */

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesDe_(fecha) {
  const iso = fechaIso_(fecha);
  return iso ? iso.slice(0, 7) : '';
}

function ultimosMeses_(n) {
  const hoy = new Date();
  const salida = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    salida.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2));
  }
  return salida;
}

/** Construye el snapshot completo. Solo datos agregados y publicables. */
function construirSnapshot() {
  const nodos = filtrar('nodos', function (n) { return bool(n.activo); });
  const porId = {};
  nodos.forEach(function (n) { porId[n.id] = n; });

  const elementos = nodos.filter(function (n) {
    return String(n.clase) === 'ELEMENTO' && n.salud_estado && String(n.salud_estado) !== '';
  });

  function esSensible(nodo) {
    let actual = nodo;
    while (actual) {
      if (bool(actual.sensible)) return true;
      actual = actual.parent_id ? porId[actual.parent_id] : null;
    }
    return false;
  }

  // --- Resumen ---
  const distribucion = { AL_DIA: 0, ATENCION: 0, CRITICO: 0, SIN_DATOS: 0 };
  elementos.forEach(function (e) {
    const k = String(e.salud_estado);
    if (distribucion[k] !== undefined) distribucion[k] += 1;
  });
  const conPuntaje = elementos.filter(function (e) { return e.salud_puntaje !== ''; });
  const saludPuntaje = conPuntaje.length
    ? Math.round(conPuntaje.reduce(function (s, e) { return s + Number(e.salud_puntaje); }, 0) / conPuntaje.length)
    : null;

  const actividades = filtrar('actividades', function (a) { return bool(a.activo); });
  const mesActual = mesDe_(hoyIso());
  const delMes = actividades.filter(function (a) { return mesDe_(a.fecha_fin_plan) === mesActual; });
  const programadas = delMes.filter(function (a) { return String(a.estado) !== 'CANCELADA'; }).length;
  const ejecutadas = delMes.filter(function (a) {
    return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0;
  }).length;

  const novedadesAbiertas = filtrar('novedades', function (n) {
    return ['ABIERTA', 'EN_ATENCION'].indexOf(String(n.estado)) >= 0 && bool(n.publicable);
  });

  const en7 = sumarDias(hoyIso(), 7);
  const proximos7 = actividades.filter(function (a) {
    const f = fechaIso_(a.fecha_inicio_plan);
    return f >= hoyIso() && f <= en7 && ['PROGRAMADA', 'EN_EJECUCION'].indexOf(String(a.estado)) >= 0 && bool(a.publicable);
  }).length;

  // --- Árbol (solo nivel 1 y 2, y solo agregados) ---
  const raiz = nodos.filter(function (n) { return !n.parent_id; })[0];
  const nivel1 = nodos.filter(function (n) { return raiz && String(n.parent_id) === String(raiz.id); });

  function agregadoDe(nodo) {
    const prefijo = nodo.ruta_ids + '/' + nodo.id;
    const hijos = elementos.filter(function (e) {
      const p = e.ruta_ids + '/' + e.id;
      return p === prefijo || p.indexOf(prefijo + '/') === 0;
    });
    const dist = { AL_DIA: 0, ATENCION: 0, CRITICO: 0, SIN_DATOS: 0 };
    hijos.forEach(function (h) {
      const k = String(h.salud_estado);
      if (dist[k] !== undefined) dist[k] += 1;
    });
    const conP = hijos.filter(function (h) { return h.salud_puntaje !== ''; });
    const puntaje = conP.length
      ? Math.round(conP.reduce(function (s, h) { return s + Number(h.salud_puntaje); }, 0) / conP.length)
      : null;
    const propios = actividades.filter(function (a) { return String(a.nodo_id) === String(nodo.id); });
    return {
      puntaje: puntaje,
      estado: dist.CRITICO > 0 ? 'CRITICO' : (dist.ATENCION > 0 ? 'ATENCION' : (hijos.length ? 'AL_DIA' : 'SIN_DATOS')),
      distribucion: dist,
      elementos: hijos.length,
      programadas: propios.filter(function (a) { return String(a.estado) !== 'CANCELADA'; }).length,
      ejecutadas: propios.filter(function (a) { return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0; }).length,
      novedades: novedadesAbiertas.filter(function (n) { return String(n.nodo_id) === String(nodo.id); }).length,
    };
  }

  const arbol = nivel1.map(function (n) {
    const ag = agregadoDe(n);
    return {
      id: n.id, codigo: n.codigo, nombre: n.nombre,
      sensible: bool(n.sensible),
      salud: { puntaje: ag.puntaje, estado: ag.estado, distribucion: ag.distribucion, elementos: ag.elementos },
      mes: { programadas: ag.programadas, ejecutadas: ag.ejecutadas },
      novedades: ag.novedades,
      ultimo_mant: fechaIso_(n.ultimo_mant_en),
      proximo_mant: fechaIso_(n.proximo_mant_en),
    };
  });

  // --- Serie mensual (12 meses) ---
  const meses = ultimosMeses_(12).map(function (m) {
    const delMesM = actividades.filter(function (a) { return mesDe_(a.fecha_fin_plan) === m; });
    const prog = delMesM.filter(function (a) { return String(a.estado) !== 'CANCELADA'; }).length;
    const ej = delMesM.filter(function (a) { return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0; }).length;
    return {
      mes: m,
      etiqueta: MESES_CORTOS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4),
      programadas: prog,
      ejecutadas: ej,
      cumplimiento_pct: prog ? Math.round((ej / prog) * 100) : null,
    };
  });

  // --- Próximos 30 días ---
  const en30 = sumarDias(hoyIso(), 30);
  const proximos = actividades
    .filter(function (a) {
      const f = fechaIso_(a.fecha_inicio_plan);
      return f >= hoyIso() && f <= en30 && ['PROGRAMADA', 'EN_EJECUCION'].indexOf(String(a.estado)) >= 0 && bool(a.publicable);
    })
    .sort(function (a, b) { return String(a.fecha_inicio_plan) < String(b.fecha_inicio_plan) ? -1 : 1; })
    .slice(0, 20)
    .map(function (a) {
      const n = porId[a.nodo_id];
      return {
        fecha: fechaIso_(a.fecha_inicio_plan),
        nodo_codigo: n ? n.codigo : '',
        nodo_nombre: n ? n.nombre : '',
        titulo: a.titulo,
        afecta_uso: bool(a.afecta_uso),
        sensible: n ? esSensible(n) : false,
      };
    });

  // --- Recientes (aprobadas o cerradas) ---
  const empresas = {};
  filas('empresas').forEach(function (e) { empresas[e.id] = e.razon_social; });

  const recientes = actividades
    .filter(function (a) {
      return ['APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0 && bool(a.publicable);
    })
    .sort(function (a, b) {
      return String(b.fecha_aprobacion || b.fecha_reporte_final) > String(a.fecha_aprobacion || a.fecha_reporte_final) ? 1 : -1;
    })
    .slice(0, 20)
    .map(function (a) {
      const n = porId[a.nodo_id];
      const sensible = n ? esSensible(n) : false;
      const fotos = sensible ? [] : filtrar('evidencias', function (e) {
        return String(e.actividad_id) === String(a.id) && bool(e.publicable) && bool(e.activo);
      }).map(function (e) { return { id: e.id, momento: e.momento }; });
      return {
        fecha: fechaIso_(a.fecha_aprobacion || a.fecha_reporte_final),
        nodo_codigo: n ? n.codigo : '',
        titulo: a.titulo,
        empresa: empresas[a.empresa_id] || '',
        sensible: sensible,
        fotos: fotos,
      };
    });

  // --- Novedades públicas ---
  const novedades = novedadesAbiertas.map(function (n) {
    const nodo = porId[n.nodo_id];
    const sensible = nodo ? esSensible(nodo) : false;
    return {
      nodo_codigo: sensible ? (nodo ? nodo.codigo.split('-').slice(0, 2).join('-') : '') : (nodo ? nodo.codigo : ''),
      texto: sensible ? 'Novedad en sistema sensible — en atención' : (n.texto_publico || n.titulo),
      gravedad: n.gravedad,
      estado: n.estado,
      fecha_compromiso: fechaIso_(n.fecha_compromiso),
    };
  });

  // --- Normativo (planes obligatorios) ---
  const planesLegales = filtrar('plan_tipo', function (p) { return bool(p.obligatoria_legal); });
  const normativo = planesLegales.map(function (p) {
    const tipo = buscarPorId('tipos_elemento', p.tipo_elemento_id);
    const plantilla = buscarPorId('plantillas', p.plantilla_id);
    return {
      nombre: plantilla ? plantilla.nombre : (tipo ? tipo.nombre : ''),
      tipo: tipo ? tipo.nombre : '',
      frecuencia: p.frecuencia,
      norma: p.norma_referencia || '',
    };
  });

  return {
    generado_en: ahoraIso(),
    resumen: {
      salud: { puntaje: saludPuntaje, estado: distribucion.CRITICO > 0 ? 'CRITICO' : (distribucion.ATENCION > 0 ? 'ATENCION' : 'AL_DIA'), distribucion: distribucion },
      mes: { etiqueta: mesActual, programadas: programadas, ejecutadas: ejecutadas, cumplimiento_pct: programadas ? Math.round((ejecutadas / programadas) * 100) : null },
      novedades_abiertas: novedadesAbiertas.length,
      proximos_7d: proximos7,
      elementos: elementos.length,
    },
    arbol: arbol,
    meses: meses,
    proximos: proximos,
    recientes: recientes,
    novedades: novedades,
    normativo: normativo,
  };
}

/** Guarda el snapshot en hoja y caché. */
function regenerarSnapshot() {
  const snap = construirSnapshot();
  const texto = JSON.stringify(snap);
  const hoja_ = hoja('public_snapshot');
  hoja_.clearContents();
  hoja_.appendRow(['snapshot', texto, ahoraIso()]);
  cachePut('snap', texto, 3600);
  return { generado_en: snap.generado_en, bytes: texto.length };
}

/** Snapshot para el público: de caché o de la hoja. */
function snapshotPublico_() {
  const enCache = cacheGet('snap');
  if (enCache) return enCache;
  const filas_ = filas('public_snapshot');
  if (filas_.length && filas_[0].json) {
    cachePut('snap', filas_[0].json, 600);
    return filas_[0].json;
  }
  const recien = JSON.stringify(construirSnapshot());
  cachePut('snap', recien, 600);
  return recien;
}

/** GET ?action=public.snapshot — devuelve el JSON tal cual, sin envoltura de la API. */
function publicSnapshot() {
  return ContentService.createTextOutput(snapshotPublico_())
    .setMimeType(ContentService.MimeType.JSON);
}

/** GET ?action=public.foto&id=… — miniatura publicable en base64. */
function publicFoto(param) {
  const id = param.id;
  if (!id) return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
  const clave = 'foto:' + id;
  const enCache = cacheGet(clave);
  if (enCache) {
    return ContentService.createTextOutput(enCache).setMimeType(ContentService.MimeType.JSON);
  }
  const ev = buscarPorId('evidencias', id);
  let json = '{"error":"no encontrada"}';
  if (ev && bool(ev.publicable) && bool(ev.activo)) {
    const archivo = DriveApp.getFileById(ev.mini_file_id || ev.drive_file_id);
    const blob = archivo.getBlob();
    json = JSON.stringify({ mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) });
    if (json.length < 95000) cachePut(clave, json, 21600);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
