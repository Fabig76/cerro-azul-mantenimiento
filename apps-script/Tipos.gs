/**
 * Tipos.gs — catálogo de tipos de elemento y sus plantillas (SPEC v1.2, sec. 3.3).
 */

function tiposListar(ctx) {
  const tipos = filtrar('tipos_elemento', function (t) { return bool(t.activo); });
  const planes = filas('plan_tipo');
  const plantillas = filas('plantillas');

  return {
    tipos: tipos.map(function (t) {
      const plan = planes.filter(function (p) { return String(p.tipo_elemento_id) === String(t.id); })[0];
      const plantilla = plan ? plantillas.filter(function (p) { return String(p.id) === String(plan.plantilla_id); })[0] : null;
      return {
        id: t.id,
        nombre: t.nombre,
        descripcion: t.descripcion || '',
        sensible: bool(t.sensible_default),
        atributos: fromJson(t.atributos_json, []),
        condiciones: fromJson(t.condiciones_json, []),
        plan: plan ? {
          frecuencia: plan.frecuencia,
          obligatoria_legal: bool(plan.obligatoria_legal),
          norma: plan.norma_referencia || '',
          plantilla: plantilla ? plantilla.nombre : '',
          plantilla_id: plantilla ? plantilla.id : '',
        } : null,
      };
    }),
  };
}

function plantillasListar(ctx, payload) {
  const tipoId = payload.tipo_elemento_id || null;
  const lista = filtrar('plantillas', function (p) {
    if (!bool(p.activo)) return false;
    if (tipoId && String(p.tipo_elemento_id) !== String(tipoId)) return false;
    return true;
  });
  const items = filas('plantilla_items');
  return {
    plantillas: lista.map(function (p) {
      return {
        id: p.id,
        nombre: p.nombre,
        version: Number(p.version),
        metodo_avance: p.metodo_avance,
        norma: p.norma_referencia || '',
        items: items.filter(function (i) {
          return String(i.plantilla_id) === String(p.id) && Number(i.version) === Number(p.version);
        }).length,
      };
    }),
  };
}

/** Crea o actualiza un tipo de elemento. */
function tiposGuardar(ctx, payload) {
  const nombre = exigirTexto(payload.nombre, 'nombre', 80);
  const datos = {
    nombre: nombre,
    icono: payload.icono || 'box',
    atributos_json: toJson(Array.isArray(payload.atributos) ? payload.atributos : []),
    condiciones_json: toJson(Array.isArray(payload.condiciones) ? payload.condiciones : []),
    sensible_default: !!payload.sensible_default,
    descripcion: payload.descripcion ? String(payload.descripcion).slice(0, 300) : '',
  };

  if (payload.id) {
    const t = buscarPorId('tipos_elemento', payload.id);
    if (!t) fallar_('NO_ENCONTRADO', 'El tipo no existe.');
    const despues = actualizar('tipos_elemento', payload.id, datos, ctx.usuario.email);
    auditar(ctx.usuario.email, 'TIPO_EDITADO', 'tipo', payload.id, null, { nombre: nombre });
    return { tipo: despues };
  }

  const repetido = filtrar('tipos_elemento', function (t) {
    return String(t.nombre).toLowerCase() === nombre.toLowerCase() && bool(t.activo);
  })[0];
  if (repetido) fallar_('CONFLICTO', 'Ya existe un tipo con ese nombre.');

  const nuevo = insertar('tipos_elemento', Object.assign({ id: newId('TIP'), activo: true }, datos), ctx.usuario.email);
  auditar(ctx.usuario.email, 'TIPO_CREADO', 'tipo', nuevo.id, null, { nombre: nombre });
  return { tipo: nuevo };
}

/** Plantilla vigente con sus ítems. */
function plantillasGet(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const p = buscarPorId('plantillas', id);
  if (!p) fallar_('NO_ENCONTRADO', 'La plantilla no existe.');
  const items = filtrar('plantilla_items', function (i) {
    return String(i.plantilla_id) === String(p.id) && Number(i.version) === Number(p.version);
  }).sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  return { plantilla: p, items: items, etapas: fromJson(p.etapas_json, []) };
}

/**
 * Guarda una plantilla. Si ya existe, crea una versión nueva (RN-12):
 * las actividades en curso conservan la versión con la que nacieron.
 */
function plantillasGuardar(ctx, payload) {
  const nombre = exigirTexto(payload.nombre, 'nombre', 120);
  const tipoId = exigirTexto(payload.tipo_elemento_id, 'tipo_elemento_id');
  if (!buscarPorId('tipos_elemento', tipoId)) fallar_('VALIDACION', 'El tipo no existe.');

  const metodo = exigirEnEnum(payload.metodo_avance || 'CHECKLIST', 'metodo_avance', ['CHECKLIST', 'HITOS']);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) fallar_('VALIDACION', 'La plantilla necesita al menos un ítem.');

  // Etapas sugeridas: cada actividad de este tipo nace con ellas y las ajusta.
  const etapas = (Array.isArray(payload.etapas) ? payload.etapas : [])
    .filter(function (e) { return e && String(e.nombre || '').trim(); })
    .map(function (e) {
      return { nombre: String(e.nombre).trim().slice(0, 120), peso: Math.max(1, Math.min(10, Number(e.peso) || 1)) };
    });

  // Asegura que la hoja tenga la columna de etapas antes de escribirla.
  asegurarPestañas(hojaCalculo());

  return conBloqueo(function () {
    let plantilla;
    let version = 1;

    if (payload.id) {
      const anterior = buscarPorId('plantillas', payload.id);
      if (!anterior) fallar_('NO_ENCONTRADO', 'La plantilla no existe.');
      version = Number(anterior.version) + 1;
      actualizar('plantillas', payload.id, { activa: false }, ctx.usuario.email);
      plantilla = insertar('plantillas', {
        id: newId('PLA'),
        nombre: nombre,
        tipo_elemento_id: tipoId,
        version: version,
        metodo_avance: metodo,
        norma_referencia: payload.norma_referencia || '',
        activa: true,
        activo: true,
        etapas_json: toJson(etapas),
      }, ctx.usuario.email);
    } else {
      plantilla = insertar('plantillas', {
        id: newId('PLA'),
        nombre: nombre,
        tipo_elemento_id: tipoId,
        version: 1,
        metodo_avance: metodo,
        norma_referencia: payload.norma_referencia || '',
        activa: true,
        activo: true,
        etapas_json: toJson(etapas),
      }, ctx.usuario.email);
    }

    insertarVarias('plantilla_items', items.map(function (i, indice) {
      return {
        id: newId('ITM'),
        plantilla_id: plantilla.id,
        version: version,
        orden: indice + 1,
        grupo: i.grupo || 'General',
        pregunta: String(i.pregunta || 'Ítem ' + (indice + 1)).slice(0, 200),
        tipo_respuesta: ['SI_NO', 'OPCION', 'NUMERO', 'TEXTO', 'FOTO'].indexOf(String(i.tipo_respuesta)) >= 0
          ? String(i.tipo_respuesta) : 'SI_NO',
        opciones_json: i.opciones ? toJson(i.opciones) : '',
        criterio_aceptacion: i.criterio ? String(i.criterio).slice(0, 300) : '',
        valor_min: i.valor_min === undefined || i.valor_min === null ? '' : Number(i.valor_min),
        valor_max: i.valor_max === undefined || i.valor_max === null ? '' : Number(i.valor_max),
        unidad: i.unidad || '',
        obligatorio: i.obligatorio === undefined ? true : !!i.obligatorio,
        peso: i.peso === undefined ? 1 : Number(i.peso),
        requiere_foto: !!i.requiere_foto,
        genera_novedad_si_falla: !!i.genera_novedad_si_falla,
        activo: true,
      };
    }), ctx.usuario.email);

    // K2 · Un cambio de plantilla no toca lo que ya está en la calle: se dice cuántos
    // trabajos abiertos siguen con la versión anterior.
    const abiertas = filtrar('actividades', function (a) {
      return bool(a.activo) && String(a.plantilla_id) === String(plantilla.id) &&
        ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA'].indexOf(String(a.estado)) >= 0;
    }).length;

    auditar(ctx.usuario.email, 'PLANTILLA_GUARDADA', 'plantilla', plantilla.id, null,
      { nombre: nombre, version: version, items: items.length, etapas: etapas.length, abiertas: abiertas });
    return {
      plantilla: plantilla, version: version, items: items.length, etapas: etapas.length,
      abiertas_anteriores: abiertas,
    };
  });
}

/** Desactiva un nodo y todo su subárbol (no borra). */
function nodosDesactivar(ctx, payload) {
  desdePortal_(payload);
  const id = exigirTexto(payload.id, 'id');
  return conBloqueo(function () {
    limpiarCache('nodos');
    const nodo = buscarPorId('nodos', id);
    if (!nodo) fallar_('NO_ENCONTRADO', 'El nodo no existe.');
    if (!nodo.parent_id) fallar_('VALIDACION', 'No se puede desactivar la raíz del conjunto.');

    const prefijo = nodo.ruta_ids + '/' + nodo.id;
    const subarbol = filtrar('nodos', function (n) {
      const suyo = n.ruta_ids + '/' + n.id;
      return bool(n.activo) && (suyo === prefijo || suyo.indexOf(prefijo + '/') === 0);
    });
    const ids = subarbol.map(function (n) { return String(n.id); });

    // S1 · Antes de retirar, se mira qué cuelga: un equipo con trabajos abiertos o con
    // planes activos no se puede retirar sin decidir qué pasa con eso.
    const abiertos = filtrar('actividades', function (a) {
      return bool(a.activo) && ids.indexOf(String(a.nodo_id)) >= 0 &&
        ['PROGRAMADA', 'EN_EJECUCION', 'REPORTADA'].indexOf(String(a.estado)) >= 0;
    });
    const planes = filtrar('recurrencias', function (r) {
      return bool(r.activo) && bool(r.activa) && ids.indexOf(String(r.nodo_id)) >= 0;
    });
    const novedades = filtrar('novedades', function (n) {
      return bool(n.activo) && ids.indexOf(String(n.nodo_id)) >= 0 &&
        ['ABIERTA', 'EN_ATENCION'].indexOf(String(n.estado)) >= 0;
    });

    const pausar = !!payload.pausar_planes;
    if ((abiertos.length || novedades.length) && !payload.confirmar) {
      fallar_('VALIDACION',
        '«' + nodo.nombre + '» tiene ' + abiertos.length + ' trabajo(s) abierto(s) y ' +
        novedades.length + ' novedad(es) sin resolver. Ciérrelos primero, o confirme que se retira igual.');
    }
    if (planes.length && !pausar && !payload.confirmar) {
      fallar_('VALIDACION',
        '«' + nodo.nombre + '» tiene ' + planes.length + ' plan(es) activo(s). Páuselos o confirme que se retiran con la sección.');
    }

    if (pausar) {
      planes.forEach(function (r) {
        actualizar('recurrencias', r.id, { activa: false }, ctx.usuario.email);
      });
    }

    ids.forEach(function (nodoId) {
      actualizar('nodos', nodoId, { activo: false }, ctx.usuario.email);
    });

    // S3 · Los ancestros tienen que recalcular su semáforo ahora, no en la noche.
    if (typeof recalcularSalud_ === 'function') {
      ids.forEach(function (nodoId) {
        try { recalcularSalud_(nodoId, ctx.usuario.email); } catch (e) { /* la salud no frena el retiro */ }
      });
    }
    regenerarSnapshot();

    auditar(ctx.usuario.email, 'NODO_DESACTIVADO', 'nodo', id, null,
      { nodos: subarbol.length, codigo: nodo.codigo, planes_pausados: pausar ? planes.length : 0 });
    return {
      desactivados: subarbol.length, codigo: nodo.codigo,
      planes_pausados: pausar ? planes.length : 0,
    };
  });
}
