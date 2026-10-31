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
