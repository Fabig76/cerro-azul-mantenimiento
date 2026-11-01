/**
 * Limpieza.gs — retira los datos de demostración del sistema.
 * Borrado lógico en cascada; queda en la auditoría qué se retiró.
 */

function limpiarDemostracion(usuario) {
  const quien = usuario || 'sistema';
  const resumen = { actividades: 0, reportes: 0, respuestas: 0, evidencias: 0, nodos: 0 };

  return conBloqueo(function () {
    const actividades = filtrar('actividades', function (a) {
      return bool(a.activo) && String(a.titulo).toLowerCase().indexOf('demostración') >= 0;
    });

    actividades.forEach(function (a) {
      const reportes = filtrar('reportes', function (r) {
        return String(r.actividad_id) === String(a.id) && bool(r.activo);
      });
      reportes.forEach(function (r) {
        const respuestas = filtrar('respuestas', function (x) {
          return String(x.reporte_id) === String(r.id) && bool(x.activo);
        });
        respuestas.forEach(function (x) {
          actualizar('respuestas', x.id, { activo: false }, quien);
          resumen.respuestas++;
        });
        actualizar('reportes', r.id, { activo: false }, quien);
        resumen.reportes++;
      });

      const evidencias = filtrar('evidencias', function (e) {
        return String(e.actividad_id) === String(a.id) && bool(e.activo);
      });
      evidencias.forEach(function (e) {
        actualizar('evidencias', e.id, { activo: false, publicable: false }, quien);
        resumen.evidencias++;
      });

      const hitos = filtrar('hitos', function (h) {
        return String(h.actividad_id) === String(a.id) && bool(h.activo);
      });
      hitos.forEach(function (h) { actualizar('hitos', h.id, { activo: false }, quien); });

      actualizar('actividades', a.id, { activo: false, publicable: false }, quien);
      resumen.actividades++;
    });

    // Elementos de demostración creados para colgar esas actividades.
    const nodos = filtrar('nodos', function (n) {
      return bool(n.activo) && (String(n.nombre).toLowerCase().indexOf('demostración') >= 0 ||
        String(n.nombre).toLowerCase().indexOf('demostracion') >= 0);
    });
    nodos.forEach(function (n) {
      actualizar('nodos', n.id, {
        activo: false,
        salud_puntaje: '',
        salud_estado: 'SIN_DATOS',
        salud_calculada_en: '',
        ultimo_mant_en: '',
      }, quien);
      resumen.nodos++;
    });

    // Huérfanos: la sección de cámaras recupera su estado limpio.
    filtrar('nodos', function (n) {
      return String(n.codigo) === 'CA-AC-CAM' && bool(n.activo);
    }).forEach(function (n) {
      actualizar('nodos', n.id, {
        salud_puntaje: '', salud_estado: 'SIN_DATOS', salud_calculada_en: '', ultimo_mant_en: '',
      }, quien);
    });

    limpiarCache('');
    prop('DEMO_HECHO', '');
    recalcularTodo(quien);
    regenerarSnapshot();
    auditar(quien, 'DEMOSTRACION_RETIRADA', 'sistema', 'demo', null, resumen);
    return resumen;
  });
}

/** Retira todas las actividades activas con su rastro, para empezar de cero. */
function borrarTodasActividades(usuario) {
  const quien = usuario || 'sistema';
  return conBloqueo(function () {
    const lista = filtrar('actividades', function (a) { return bool(a.activo); });
    const titulos = lista.map(function (a) { return a.titulo; });

    lista.forEach(function (a) {
      filtrar('reportes', function (r) {
        return String(r.actividad_id) === String(a.id) && bool(r.activo);
      }).forEach(function (r) {
        filtrar('respuestas', function (x) {
          return String(x.reporte_id) === String(r.id) && bool(x.activo);
        }).forEach(function (x) { actualizar('respuestas', x.id, { activo: false }, quien); });
        actualizar('reportes', r.id, { activo: false }, quien);
      });

      filtrar('evidencias', function (e) {
        return String(e.actividad_id) === String(a.id) && bool(e.activo);
      }).forEach(function (e) { actualizar('evidencias', e.id, { activo: false, publicable: false }, quien); });

      filtrar('hitos', function (h) {
        return String(h.actividad_id) === String(a.id) && bool(h.activo);
      }).forEach(function (h) { actualizar('hitos', h.id, { activo: false }, quien); });

      actualizar('actividades', a.id, { activo: false, publicable: false }, quien);
    });

    // Los equipos de demostración vuelven a quedar sin historial.
    filtrar('nodos', function (n) {
      return bool(n.activo) && String(n.nombre).toLowerCase().indexOf('demostraci') >= 0;
    }).forEach(function (n) {
      actualizar('nodos', n.id, {
        activo: false, salud_puntaje: '', salud_estado: 'SIN_DATOS',
        salud_calculada_en: '', ultimo_mant_en: '',
      }, quien);
    });

    limpiarCache('');
    recalcularTodo(quien);
    regenerarSnapshot();
    auditar(quien, 'ACTIVIDADES_RETIRADAS', 'sistema', 'todas', null, { cantidad: lista.length });
    return { borradas: lista.length, titulos: titulos };
  });
}
