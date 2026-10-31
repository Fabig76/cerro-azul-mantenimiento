/**
 * Salud.gs — semáforo y puntaje de cada elemento (SPEC v1.2, sec. 5).
 * Funciones puras para poder probarlas sin tocar hojas.
 */

/** Cumplimiento de un plan: d = días desde el último mantenimiento, I = intervalo en días. */
function cumplimientoPlan(dias, intervalo) {
  const d = Number(dias) || 0;
  const I = Number(intervalo) || 0;
  if (I <= 0) return 100;
  const exceso = Math.max(0, d - I);
  return Math.round(100 * Math.max(0, 1 - exceso / I));
}

/** Puntaje 0-100 repartiendo el peso entre las señales presentes (B4 de la revisión). */
function puntajeSalud(cPlan, cCondicion, cNovedades, pesos) {
  const p = pesos || { plan: 0.5, condicion: 0.3, novedades: 0.2 };
  const señales = [];
  if (cPlan !== null && cPlan !== undefined) señales.push([cPlan, p.plan]);
  if (cCondicion !== null && cCondicion !== undefined) señales.push([cCondicion, p.condicion]);
  if (cNovedades !== null && cNovedades !== undefined) señales.push([cNovedades, p.novedades]);
  if (!señales.length) return null;
  const pesoTotal = señales.reduce(function (s, x) { return s + x[1]; }, 0);
  const suma = señales.reduce(function (s, x) { return s + x[0] * x[1]; }, 0);
  return Math.round(suma / pesoTotal);
}

/** Semáforo por reglas, en el orden de la tabla 5.2. */
function semaforo(criterios) {
  const c = criterios || {};
  if (c.condicionFalla || c.novedadGrave || c.legalVencido || c.planMuyVencido) return 'CRITICO';
  if (c.condicionAtencion || c.novedadMedia || c.planVencido || c.enRiesgo) return 'ATENCION';
  if (c.algunaSenal) return 'AL_DIA';
  return 'SIN_DATOS';
}

function nivelCondicion_(condicion, condiciones) {
  const lista = condiciones || [];
  for (let i = 0; i < lista.length; i++) {
    if (String(lista[i].valor) === String(condicion)) return lista[i].nivel;
  }
  return null;
}

function valorCondicion_(nivel) {
  if (nivel === 'OK') return 100;
  if (nivel === 'ATENCION') return 60;
  if (nivel === 'FALLA') return 0;
  return null;
}

function valorNovedad_(gravedad) {
  const mapa = { BAJA: 90, MEDIA: 70, ALTA: 40, CRITICA: 0 };
  return mapa[String(gravedad)] !== undefined ? mapa[String(gravedad)] : null;
}

/** Recalcula un elemento y devuelve el resultado (sin escribir). */
function calcularSalud_(nodo) {
  const config = {
    plan: configNumero('peso_plan', 0.5),
    condicion: configNumero('peso_condicion', 0.3),
    novedades: configNumero('peso_novedades', 0.2),
  };
  const tolerancia = configNumero('tolerancia_dias', 2);

  // 1) Cumplimiento del plan
  const planes = filtrar('plan_tipo', function (p) {
    return String(p.tipo_elemento_id) === String(nodo.tipo_elemento_id) && bool(p.activo);
  });
  let cPlan = null;
  let legalVencido = false;
  let planVencido = false;
  let planMuyVencido = false;
  if (planes.length) {
    const valores = planes.map(function (p) {
      const intervalo = intervaloDias_(p.frecuencia);
      const dias = nodo.ultimo_mant_en ? diasEntre(String(nodo.ultimo_mant_en).slice(0, 10), hoyIso()) : intervalo * 2;
      if (intervalo && dias > intervalo + Number(p.dias_tolerancia || tolerancia)) {
        planVencido = true;
        if (dias > intervalo * 2) planMuyVencido = true;
        if (bool(p.obligatoria_legal)) legalVencido = true;
      }
      return cumplimientoPlan(dias, intervalo);
    });
    cPlan = Math.round(valores.reduce(function (a, b) { return a + b; }, 0) / valores.length);
  }

  // 2) Condición operativa
  const tipo = nodo.tipo_elemento_id ? buscarPorId('tipos_elemento', nodo.tipo_elemento_id) : null;
  const condiciones = tipo ? fromJson(tipo.condiciones_json, []) : [];
  const lecturas = filtrar('lecturas_estado', function (l) { return String(l.nodo_id) === String(nodo.id); });
  const ultima = lecturas.length ? lecturas[lecturas.length - 1] : null;
  const nivel = ultima ? nivelCondicion_(ultima.condicion_operativa, condiciones) : null;
  const cCond = valorCondicion_(nivel);

  // 3) Novedades abiertas
  const abiertas = filtrar('novedades', function (n) {
    return String(n.nodo_id) === String(nodo.id) &&
      ['ABIERTA', 'EN_ATENCION'].indexOf(String(n.estado)) >= 0;
  });
  const orden = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAJA: 1 };
  const peor = abiertas.sort(function (a, b) { return (orden[b.gravedad] || 0) - (orden[a.gravedad] || 0); })[0];
  const cNov = peor ? valorNovedad_(peor.gravedad) : (abiertas.length ? 90 : null);

  const puntaje = puntajeSalud(cPlan, cCond, cNov, config);
  const estado = semaforo({
    condicionFalla: nivel === 'FALLA',
    condicionAtencion: nivel === 'ATENCION',
    novedadGrave: peor && ['ALTA', 'CRITICA'].indexOf(String(peor.gravedad)) >= 0,
    novedadMedia: peor && String(peor.gravedad) === 'MEDIA',
    legalVencido: legalVencido,
    planMuyVencido: planMuyVencido,
    planVencido: planVencido,
    enRiesgo: false,
    algunaSenal: cPlan !== null || cCond !== null || cNov !== null,
  });

  return { puntaje: puntaje, estado: estado, senales: { plan: cPlan, condicion: cCond, novedades: cNov } };
}

function intervaloDias_(frecuencia) {
  const mapa = {
    SEMANAL: 7, QUINCENAL: 15, MENSUAL: 30, BIMESTRAL: 60, TRIMESTRAL: 90,
    SEMESTRAL: 180, ANUAL: 365, CADA_N_DIAS: 1,
  };
  return mapa[String(frecuencia)] || 0;
}

/** Recalcula el elemento y sus ancestros, y guarda el resultado. */
function recalcularSalud_(nodoId, usuario) {
  let actual = buscarPorId('nodos', nodoId);
  if (!actual) return null;
  const resultado = calcularSalud_(actual);
  actualizar('nodos', actual.id, {
    salud_estado: resultado.estado,
    salud_puntaje: resultado.puntaje === null ? '' : resultado.puntaje,
    salud_calculada_en: ahoraIso(),
  }, usuario || 'sistema');

  // Subir por los ancestros agregando.
  const ancestros = String(actual.ruta_ids || '').split('/').filter(Boolean);
  ancestros.reverse().forEach(function (idAncestro) {
    const padre = buscarPorId('nodos', idAncestro);
    if (!padre) return;
    const hijos = filtrar('nodos', function (n) {
      return String(n.parent_id) === String(padre.id) && bool(n.activo) && n.salud_puntaje !== '';
    });
    if (!hijos.length) {
      actualizar('nodos', padre.id, { salud_estado: 'SIN_DATOS', salud_puntaje: '', salud_calculada_en: ahoraIso() }, usuario || 'sistema');
      return;
    }
    const peso = hijos.reduce(function (s, h) { return s + (Number(h.criticidad) || 2); }, 0);
    const suma = hijos.reduce(function (s, h) { return s + Number(h.salud_puntaje) * (Number(h.criticidad) || 2); }, 0);
    const criticos = hijos.filter(function (h) { return String(h.salud_estado) === 'CRITICO'; }).length;
    const atencion = hijos.filter(function (h) { return String(h.salud_estado) === 'ATENCION'; }).length;
    const umbral = configNumero('umbral_rojo_pct', 20) / 100;
    const estado = criticos / hijos.length > umbral ? 'CRITICO'
      : (criticos > 0 || atencion / hijos.length > umbral) ? 'ATENCION'
      : 'AL_DIA';
    actualizar('nodos', padre.id, {
      salud_estado: estado,
      salud_puntaje: Math.round(suma / peso),
      salud_calculada_en: ahoraIso(),
    }, usuario || 'sistema');
  });

  return resultado;
}
