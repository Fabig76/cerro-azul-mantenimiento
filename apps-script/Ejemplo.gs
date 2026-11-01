/**
 * Ejemplo.gs — datos de demostración completos, con borrado limpio.
 * Todo lo creado queda registrado en la propiedad EJEMPLO_IDS para poder retirarlo.
 */

function ejemploIds_() {
  try {
    return JSON.parse(prop('EJEMPLO_IDS') || '{}');
  } catch (e) {
    return {};
  }
}

function registrarEjemplo_(tabla, id) {
  const ids = ejemploIds_();
  ids[tabla] = ids[tabla] || [];
  if (ids[tabla].indexOf(id) < 0) ids[tabla].push(id);
  prop('EJEMPLO_IDS', JSON.stringify(ids));
}

function nodoPorCodigo_(codigo) {
  return filtrar('nodos', function (n) { return String(n.codigo) === codigo && bool(n.activo); })[0] || null;
}

function empresaDemo_() {
  return filtrar('empresas', function (e) { return bool(e.activo); })[0] || null;
}

/** Crea el catálogo de ejemplo, actividades en todos los estados, novedad y alerta. */
function poblarEjemplo() {
  if (prop('EJEMPLO_HECHO') === 'si') {
    return { hecho: false, mensaje: 'El ejemplo ya estaba creado.' };
  }

  // Asegura que existan todas las pestañas del esquema antes de escribir.
  asegurarPestañas(hojaCalculo());
  limpiarCache('');

  return conBloqueo(function () {
    const hoy = hoyIso();
    const empresa = empresaDemo_();
    const resumen = { tipo: null, plantilla: null, elemento: null, actividades: 0, novedades: 0, alertas: 0 };

    // --- 1. Tipo «Panel solar» con sus campos y estados ---
    const tipo = insertar('tipos_elemento', {
      id: newId('TIP'),
      nombre: 'Panel solar',
      icono: 'sol',
      atributos_json: toJson([
        { clave: 'marca', etiqueta: 'Marca', tipo: 'texto', obligatorio: false },
        { clave: 'paneles', etiqueta: 'Número de paneles', tipo: 'numero', obligatorio: false },
        { clave: 'potencia', etiqueta: 'Potencia (kW)', tipo: 'numero', obligatorio: false },
      ]),
      condiciones_json: toJson([
        { valor: 'Operativo', nivel: 'OK' },
        { valor: 'Con suciedad', nivel: 'ATENCION' },
        { valor: 'Fuera de servicio', nivel: 'FALLA' },
      ]),
      sensible_default: false,
      descripcion: 'Sistema de generación solar de la cubierta',
      activo: true,
    }, 'ejemplo');
    registrarEjemplo_('tipos_elemento', tipo.id);
    resumen.tipo = tipo.nombre;

    // --- 2. Plantilla con cinco ítems ---
    const plantilla = insertar('plantillas', {
      id: newId('PLA'),
      nombre: 'Revisión de panel solar',
      tipo_elemento_id: tipo.id,
      version: 1,
      metodo_avance: 'CHECKLIST',
      norma_referencia: 'Fabricante · RETIE',
      activa: true,
      activo: true,
    }, 'ejemplo');
    registrarEjemplo_('plantillas', plantilla.id);
    resumen.plantilla = plantilla.nombre;

    const items = [
      ['Limpieza', 'Paneles limpios y sin sombras', 'SI_NO', 2],
      ['Limpieza', 'Canaletas de la cubierta despejadas', 'SI_NO', 1],
      ['Eléctrico', 'Voltaje de salida del inversor', 'NUMERO', 2],
      ['Estructural', 'Soportes y tornillería sin corrosión', 'SI_NO', 2],
      ['Documento', 'Certificado del inversor vigente', 'FOTO', 1],
    ];
    insertarVarias('plantilla_items', items.map(function (i, indice) {
      const creado = {
        id: newId('ITM'),
        plantilla_id: plantilla.id,
        version: 1,
        orden: indice + 1,
        grupo: i[0],
        pregunta: i[1],
        tipo_respuesta: i[2],
        opciones_json: '',
        criterio_aceptacion: '',
        valor_min: '',
        valor_max: '',
        unidad: '',
        obligatorio: true,
        peso: i[3],
        requiere_foto: i[2] === 'FOTO',
        genera_novedad_si_falla: i[2] === 'SI_NO',
        activo: true,
      };
      registrarEjemplo_('plantilla_items', creado.id);
      return creado;
    }), 'ejemplo');

    // --- 3. Elemento de ese tipo, colgado de Áreas comunes ---
    const areaComun = nodoPorCodigo_('CA-AC');
    if (areaComun) {
      const elemento = insertar('nodos', {
        id: newId('NOD'),
        parent_id: areaComun.id,
        ruta_ids: areaComun.ruta_ids + '/' + areaComun.id,
        nivel: Number(areaComun.nivel) + 1,
        codigo: 'CA-AC-SOL',
        nombre: 'Paneles solares de cubierta',
        clase: 'ELEMENTO',
        tipo_elemento_id: tipo.id,
        orden: 99,
        descripcion: 'Generación solar sobre la cubierta del edificio de parqueaderos',
        critico: false,
        sensible: false,
        condicion_operativa: 'Operativo',
        ultimo_mant_en: '',
        salud_puntaje: '',
        salud_estado: 'SIN_DATOS',
        salud_calculada_en: '',
        activo: true,
      }, 'ejemplo');
      registrarEjemplo_('nodos', elemento.id);
      resumen.elemento = elemento.nombre;

      // --- 4. Actividad programada con esa plantilla ---
      const actSolar = insertar('actividades', {
        id: newId('ACT'),
        titulo: 'Revisión de paneles solares',
        descripcion: 'Revisión semestral del sistema de generación de la cubierta.',
        nodo_id: elemento.id,
        plantilla_id: plantilla.id,
        plantilla_version: 1,
        empresa_id: empresa ? empresa.id : '',
        responsable_id: '',
        tipo: 'UNICA',
        origen: 'MANUAL',
        novedad_id: '',
        recurrencia_id: '',
        fecha_inicio_plan: sumarDias(hoy, 7),
        fecha_fin_plan: sumarDias(hoy, 8),
        dias_plan: 2,
        prioridad: 'MEDIA',
        estado: 'PROGRAMADA',
        vencida: false,
        en_riesgo: false,
        avance_reportado_pct: 0,
        avance_aprobado_pct: 0,
        fecha_inicio_real: '',
        fecha_reporte_final: '',
        fecha_aprobacion: '',
        obligatoria_legal: false,
        afecta_uso: false,
        publicable: true,
        acta_file_id: '',
        inicio_sin_foto_motivo: '',
        activo: true,
      }, 'ejemplo');
      registrarEjemplo_('actividades', actSolar.id);
      resumen.actividades++;

      // El checklist sale de la plantilla; las respuestas se guardan en «respuestas».
    }

    // --- 5. Actividades en otros estados ---
    const programadas = [
      { codigo: 'CA-T1', titulo: 'Mantenimiento preventivo de bombas', prio: 'ALTA', dias: 3, afecta: true },
      { codigo: 'CA-PIS', titulo: 'Limpieza de piscina semiolímpica', prio: 'MEDIA', dias: 5, afecta: false },
      { codigo: 'CA-JAR', titulo: 'Poda de jardines del bloque 2', prio: 'BAJA', dias: 12, afecta: false },
    ];
    programadas.forEach(function (p) {
      const nodo = nodoPorCodigo_(p.codigo);
      if (!nodo) return;
      const act = insertar('actividades', {
        id: newId('ACT'),
        titulo: p.titulo,
        descripcion: '',
        nodo_id: nodo.id,
        plantilla_id: '',
        plantilla_version: '',
        empresa_id: empresa ? empresa.id : '',
        responsable_id: '',
        tipo: 'UNICA',
        origen: 'MANUAL',
        novedad_id: '',
        recurrencia_id: '',
        fecha_inicio_plan: sumarDias(hoy, p.dias),
        fecha_fin_plan: sumarDias(hoy, p.dias + 1),
        dias_plan: 2,
        prioridad: p.prio,
        estado: 'PROGRAMADA',
        vencida: false,
        en_riesgo: false,
        avance_reportado_pct: 0,
        avance_aprobado_pct: 0,
        fecha_inicio_real: '',
        fecha_reporte_final: '',
        fecha_aprobacion: '',
        obligatoria_legal: false,
        afecta_uso: p.afecta,
        publicable: true,
        acta_file_id: '',
        inicio_sin_foto_motivo: '',
        activo: true,
      }, 'ejemplo');
      registrarEjemplo_('actividades', act.id);
      resumen.actividades++;
    });

    // Una en ejecución y una aprobada del mes pasado
    const tanque = nodoPorCodigo_('CA-TAN');
    if (tanque) {
      const enCurso = insertar('actividades', {
        id: newId('ACT'),
        titulo: 'Lavado y desinfección del tanque',
        descripcion: 'Proceso semestral obligatorio.',
        nodo_id: tanque.id,
        plantilla_id: '', plantilla_version: '',
        empresa_id: empresa ? empresa.id : '',
        responsable_id: '',
        tipo: 'MULTIDIA', origen: 'MANUAL', novedad_id: '', recurrencia_id: '',
        fecha_inicio_plan: sumarDias(hoy, -1),
        fecha_fin_plan: sumarDias(hoy, 1),
        dias_plan: 3,
        prioridad: 'ALTA',
        estado: 'EN_EJECUCION',
        vencida: false, en_riesgo: true,
        avance_reportado_pct: 40, avance_aprobado_pct: 20,
        fecha_inicio_real: sumarDias(hoy, -1) + 'T08:20:00-05:00',
        fecha_reporte_final: '', fecha_aprobacion: '',
        obligatoria_legal: true, afecta_uso: true, publicable: true,
        acta_file_id: '', inicio_sin_foto_motivo: '', activo: true,
      }, 'ejemplo');
      registrarEjemplo_('actividades', enCurso.id);
      resumen.actividades++;
    }

    const torre3 = nodoPorCodigo_('CA-T3');
    if (torre3) {
      const pasada = insertar('actividades', {
        id: newId('ACT'),
        titulo: 'Cambio de luminarias del pasillo',
        descripcion: '',
        nodo_id: torre3.id,
        plantilla_id: '', plantilla_version: '',
        empresa_id: empresa ? empresa.id : '',
        responsable_id: '',
        tipo: 'UNICA', origen: 'MANUAL', novedad_id: '', recurrencia_id: '',
        fecha_inicio_plan: sumarDias(hoy, -16),
        fecha_fin_plan: sumarDias(hoy, -15),
        dias_plan: 2,
        prioridad: 'MEDIA',
        estado: 'APROBADA',
        vencida: false, en_riesgo: false,
        avance_reportado_pct: 100, avance_aprobado_pct: 100,
        fecha_inicio_real: sumarDias(hoy, -16) + 'T09:00:00-05:00',
        fecha_reporte_final: sumarDias(hoy, -15) + 'T16:30:00-05:00',
        fecha_aprobacion: sumarDias(hoy, -14) + 'T10:00:00-05:00',
        obligatoria_legal: false, afecta_uso: false, publicable: true,
        acta_file_id: '', inicio_sin_foto_motivo: '', activo: true,
      }, 'ejemplo');
      registrarEjemplo_('actividades', pasada.id);
      resumen.actividades++;
    }

    // --- 6. Novedad abierta ---
    const torre1 = nodoPorCodigo_('CA-T1');
    if (torre1) {
      const novedad = insertar('novedades', {
        id: newId('NOV'),
        nodo_id: torre1.id,
        titulo: 'Filtración en el cuarto de bombas',
        descripcion: 'Se observa humedad en el muro sur del cuarto de bombas, junto a la bomba 2.',
        tipo: 'FALLA',
        gravedad: 'ALTA',
        estado: 'ABIERTA',
        reportada_por: 'ejemplo@urbcerroazul.com',
        origen: 'ADMIN',
        actividad_origen_id: '',
        actividad_correctiva_id: '',
        fecha_deteccion: sumarDias(hoy, -2),
        fecha_compromiso: sumarDias(hoy, 5),
        fecha_resolucion: '',
        texto_publico: 'Humedad detectada en el cuarto de bombas. Se está revisando la impermeabilización.',
        publicable: true,
        activo: true,
      }, 'ejemplo');
      registrarEjemplo_('novedades', novedad.id);
      resumen.novedades++;
    }

    // --- 7. Alerta publicada ---
    const alerta = insertar('alertas', {
      id: newId('ALE'),
      estado: 'PUBLICADA',
      origen: 'MANUAL',
      nivel: 'URGENTE',
      categoria: 'MANTENIMIENTO_PROGRAMADO',
      titulo: 'Corte de agua por lavado de tanques',
      mensaje_publico: 'El sábado de 8:00 a 14:00 se lavará el tanque principal. Guarda agua para el día.',
      nodo_id: tanque ? tanque.id : '',
      novedad_id: '',
      actividad_id: '',
      inicio: hoy,
      fin: sumarDias(hoy, 7),
      fijada: true,
      actualizaciones_json: toJson([
        { fecha: ahoraIso(), texto: 'Programado con la empresa contratista.' },
      ]),
      activo: true,
    }, 'ejemplo');
    registrarEjemplo_('alertas', alerta.id);
    resumen.alertas++;

    // --- 8. Aprobar la actividad de demostración que ya existía ---
    const demo = filtrar('actividades', function (a) {
      return String(a.titulo).toLowerCase().indexOf('lavado de muro') >= 0 && String(a.estado) === 'REPORTADA';
    })[0];
    if (demo) {
      actualizar('actividades', demo.id, {
        estado: 'APROBADA',
        avance_reportado_pct: 100,
        avance_aprobado_pct: 100,
        fecha_aprobacion: ahoraIso(),
        publicable: true,
      }, 'ejemplo');
      registrarEjemplo_('actividades', demo.id);

      filtrar('reportes', function (r) { return String(r.actividad_id) === String(demo.id); })
        .forEach(function (r) {
          actualizar('reportes', r.id, {
            estado_revision: 'APROBADO',
            comentario_admin: 'Trabajo verificado en sitio.',
            revisado_por: 'ejemplo@urbcerroazul.com',
            revisado_en: ahoraIso(),
          }, 'ejemplo');
          registrarEjemplo_('reportes', r.id);
        });

      filtrar('evidencias', function (e) { return String(e.actividad_id) === String(demo.id); })
        .forEach(function (e) {
          actualizar('evidencias', e.id, {
            publicable: true,
            contiene_personas: false,
            mini_file_id: e.mini_file_id || e.drive_file_id,
          }, 'ejemplo');
          registrarEjemplo_('evidencias', e.id);
        });
      resumen.actividades++;
    }

    limpiarCache('');
    recalcularTodo('ejemplo');
    regenerarSnapshot();
    prop('EJEMPLO_HECHO', 'si');

    return { hecho: true, resumen: resumen };
  });
}

/** Retira todo lo creado por el ejemplo (borrado lógico). */
function limpiarEjemplo(usuario) {
  const ids = ejemploIds_();
  const tablas = Object.keys(ids);
  if (!tablas.length) return { borrados: 0, mensaje: 'No hay ejemplo creado.' };

  let total = 0;
  tablas.forEach(function (tabla) {
    ids[tabla].forEach(function (id) {
      try {
        const fila = buscarPorId(tabla, id);
        if (fila) {
          const cambios = { activo: false };
          // Al retirar un elemento de ejemplo, su salud vuelve a quedar vacía.
          if (tabla === 'nodos') {
            cambios.ultimo_mant_en = '';
            cambios.salud_puntaje = '';
            cambios.salud_estado = 'SIN_DATOS';
            cambios.salud_calculada_en = '';
          }
          actualizar(tabla, id, cambios, usuario || 'sistema');
          total++;
        }
      } catch (e) {
        console.error('limpiar ' + tabla + ' ' + id + ': ' + e.message);
      }
    });
  });

  prop('EJEMPLO_IDS', '[]');
  prop('EJEMPLO_HECHO', '');
  prop('EJEMPLO_FOTOS', '');
  limpiarCache('');
  recalcularTodo(usuario || 'sistema');
  regenerarSnapshot();
  auditar(usuario || 'sistema', 'EJEMPLO_RETIRADO', 'sistema', 'ejemplo', null, { borrados: total });
  return { borrados: total };
}

/** Completa el ejemplo con una actividad aprobada y publicable en una sección no sensible. */
function completarEjemplo() {
  if (prop('EJEMPLO_FOTOS') === 'si') return { hecho: false, mensaje: 'ya estaba' };

  return conBloqueo(function () {
    const hoy = hoyIso();
    const nodo = nodoPorCodigo_('CA-T3');
    if (!nodo) fallar_('SIN_CONFIGURAR', 'Falta CA-T3.');
    const empresa = empresaDemo_();

    // Se reutilizan los archivos de evidencia ya subidos, apuntando a la nueva actividad.
    const origen = filtrar('evidencias', function (e) {
      return bool(e.activo) && e.drive_file_id && e.momento === 'ANTES';
    })[0];
    const origen2 = filtrar('evidencias', function (e) {
      return bool(e.activo) && e.drive_file_id && e.momento === 'DESPUES';
    })[0];
    if (!origen) fallar_('SIN_CONFIGURAR', 'No hay evidencias para reutilizar.');

    const act = insertar('actividades', {
      id: newId('ACT'),
      titulo: 'Lavado de muros del pasillo exterior',
      descripcion: 'Lavado y desinfección del muro del pasillo exterior de la Torre 3.',
      nodo_id: nodo.id,
      plantilla_id: '', plantilla_version: '',
      empresa_id: empresa ? empresa.id : '',
      responsable_id: '',
      tipo: 'UNICA', origen: 'MANUAL', novedad_id: '', recurrencia_id: '',
      fecha_inicio_plan: sumarDias(hoy, -7),
      fecha_fin_plan: sumarDias(hoy, -6),
      dias_plan: 2,
      prioridad: 'MEDIA',
      estado: 'APROBADA',
      vencida: false, en_riesgo: false,
      avance_reportado_pct: 100, avance_aprobado_pct: 100,
      fecha_inicio_real: sumarDias(hoy, -7) + 'T07:40:00-05:00',
      fecha_reporte_final: sumarDias(hoy, -6) + 'T15:10:00-05:00',
      fecha_aprobacion: sumarDias(hoy, -5) + 'T09:00:00-05:00',
      obligatoria_legal: false, afecta_uso: false, publicable: true,
      acta_file_id: '', inicio_sin_foto_motivo: '', activo: true,
    }, 'ejemplo');
    registrarEjemplo_('actividades', act.id);

    const reporte = insertar('reportes', {
      id: newId('REP'),
      actividad_id: act.id,
      hito_id: '',
      usuario_id: '',
      fecha: sumarDias(hoy, -6) + 'T15:10:00-05:00',
      tipo: 'FINAL',
      pct_declarado: 100,
      descripcion: 'Trabajo terminado y verificado en sitio.',
      horas: 6,
      estado_revision: 'APROBADO',
      comentario_admin: 'Conforme.',
      revisado_por: 'ejemplo@urbcerroazul.com',
      revisado_en: ahoraIso(),
      activo: true,
    }, 'ejemplo');
    registrarEjemplo_('reportes', reporte.id);

    [origen, origen2].forEach(function (base) {
      if (!base) return;
      const copia = insertar('evidencias', {
        id: newId('EVI'),
        reporte_id: reporte.id,
        actividad_id: act.id,
        nodo_id: nodo.id,
        momento: base.momento,
        drive_file_id: base.drive_file_id,
        mini_file_id: base.drive_file_id,
        mime: base.mime,
        bytes: base.bytes,
        sha256: base.sha256,
        fecha_captura: base.fecha_captura,
        fecha_subida: sumarDias(hoy, -6) + 'T15:05:00-05:00',
        lat: '', lng: '',
        contiene_personas: false,
        publicable: true,
        public_file_id: '',
        activo: true,
      }, 'ejemplo');
      registrarEjemplo_('evidencias', copia.id);
    });

    actualizar('nodos', nodo.id, { ultimo_mant_en: fechaIso_(act.fecha_aprobacion), condicion_operativa: 'Operativo' }, 'ejemplo');
    limpiarCache('');
    recalcularTodo('ejemplo');
    regenerarSnapshot();
    prop('EJEMPLO_FOTOS', 'si');
    return { hecho: true, actividad: act.titulo };
  });
}
