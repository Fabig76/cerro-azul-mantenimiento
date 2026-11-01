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
    // Cuenta las actividades de todo el subárbol y del mes, no solo las colgadas del nodo.
    const propios = actividades.filter(function (a) {
      const n = porId[a.nodo_id];
      if (!n) return false;
      const suyo = n.ruta_ids + '/' + n.id;
      const enSubarbol = suyo === prefijo || suyo.indexOf(prefijo + '/') === 0;
      return enSubarbol && mesDe_(a.fecha_fin_plan) === mesActual;
    });
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
      const sensible = n ? esSensible(n) : false;
      return {
        fecha: fechaIso_(a.fecha_inicio_plan),
        nodo_codigo: sensible ? '' : (n ? n.codigo : ''),
        nodo_nombre: sensible ? '' : (n ? n.nombre : ''),
        // Un nodo sensible nunca publica el título: diría qué equipo es y cuándo queda solo.
        titulo: sensible ? 'Mantenimiento programado en sistema sensible' : a.titulo,
        afecta_uso: bool(a.afecta_uso),
        sensible: sensible,
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
        nodo_codigo: sensible ? '' : (n ? n.codigo : ''),
        titulo: sensible ? 'Trabajo terminado en sistema sensible' : a.titulo,
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

  // --- Alertas vigentes ---
  const alertas = filtrar('alertas', function (a) {
    return bool(a.activo) && ['PUBLICADA', 'ACTUALIZADA'].indexOf(String(a.estado)) >= 0;
  }).sort(function (a, b) {
    const orden = { CRITICA: 0, URGENTE: 1, AVISO: 2, INFO: 3 };
    if (bool(a.fijada) !== bool(b.fijada)) return bool(a.fijada) ? -1 : 1;
    return (orden[a.nivel] || 9) - (orden[b.nivel] || 9);
  }).map(function (a) {
    const nodo = a.nodo_id ? porId[a.nodo_id] : null;
    const sensible = nodo ? esSensible(nodo) : false;
    return {
      id: a.id,
      nivel: a.nivel,
      categoria: a.categoria,
      titulo: a.titulo,
      mensaje: a.mensaje_publico || '',
      nodo_codigo: sensible ? '' : (nodo ? nodo.codigo : ''),
      inicio: fechaIso_(a.inicio),
      fin: fechaIso_(a.fin),
      fijada: bool(a.fijada),
      actualizaciones: fromJson(a.actualizaciones_json, []),
    };
  });

  return {
    generado_en: ahoraIso(),
    alertas: alertas,
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

/**
 * Snapshot para el público. Se refresca solo cuando el visitante lo pide y el guardado
 * está viejo, así no hace falta un disparador ni permisos adicionales.
 */
function snapshotPublico_() {
  const minutos = configNumero('snapshot_minutos', 60);
  let texto = cacheGet('snap');

  if (!texto) {
    const guardado = filas('public_snapshot');
    if (guardado.length && guardado[0].json) texto = String(guardado[0].json);
  }

  let edadMin = Infinity;
  if (texto) {
    try {
      const generado = JSON.parse(texto).generado_en;
      edadMin = (Date.now() - new Date(generado).getTime()) / 60000;
    } catch (e) { edadMin = Infinity; }
  }

  if (texto && edadMin <= minutos) {
    if (!cacheGet('snap')) cachePut('snap', texto, 600);
    return texto;
  }

  try {
    const nuevo = JSON.stringify(construirSnapshot());
    const hoja_ = hoja('public_snapshot');
    hoja_.clearContents();
    hoja_.appendRow(['snapshot', nuevo, ahoraIso()]);
    cachePut('snap', nuevo, 3600);
    return nuevo;
  } catch (e) {
    console.error('snapshot: ' + e.message);
    return texto || JSON.stringify({ generado_en: ahoraIso(), resumen: { salud: { puntaje: null, estado: 'SIN_DATOS', distribucion: {} } }, arbol: [], meses: [], proximos: [], recientes: [], novedades: [], alertas: [], normativo: [] });
  }
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
