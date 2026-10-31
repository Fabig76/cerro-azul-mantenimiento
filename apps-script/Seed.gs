/**
 * Seed.gs — semilla del árbol, catálogo de tipos, plantillas y configuración.
 * SPEC v1.2: sec. 3.4 (árbol), Anexo A (tipos), Anexo B (plantillas), Anexo C (config).
 */

/** Árbol inicial: 1 raíz + áreas comunes con sus 10 secciones + 4 torres con 6 agrupadores. */
function semillaArbol() {
  const nodos = [];
  let orden = 0;

  function agregar(padre, segmento, nombre, sensible, tipoElemento) {
    orden += 1;
    const nodo = {
      id: newId('NOD'),
      parent_id: padre ? padre.id : '',
      clase: 'AGRUPADOR',
      segmento: segmento,
      nombre: nombre,
      codigo: padre ? padre.codigo + '-' + segmento : segmento,
      ruta_ids: padre ? padre.ruta_ids + '/' + padre.id : '',
      profundidad: padre ? padre.profundidad + 1 : 1,
      orden: orden,
      tipo_elemento_id: '',
      sensible: !!sensible,
      visible_publico: true,
      criticidad: padre && padre.profundidad === 1 ? 3 : 2,
      ficha_json: '',
      condicion_operativa: '',
      salud_estado: 'SIN_DATOS',
      salud_puntaje: '',
      activo: true,
    };
    nodos.push(nodo);
    return nodo;
  }

  const raiz = agregar(null, 'CA', 'Cerro Azul', false, null);

  const areas = agregar(raiz, 'AC', 'Áreas comunes', false, null);
  agregar(areas, 'CAM', 'Cámaras (CCTV)', true);
  agregar(areas, 'POR', 'Portería', true);
  agregar(areas, 'SS1', 'Salón social 1', false);
  agregar(areas, 'SS2', 'Salón social 2', false);
  agregar(areas, 'PIS', 'Piscinas', false);
  agregar(areas, 'RCI', 'Red contra incendios y sistema de alarmas', false);
  agregar(areas, 'TAN', 'Tanques de agua', false);
  agregar(areas, 'JAR', 'Jardines', false);
  agregar(areas, 'CIN', 'Sistemas de control de ingreso', true);
  agregar(areas, 'PAS', 'Pasillos y corredores externos', false);

  const torres = [
    ['T1', 'Torre 1'], ['T2', 'Torre 2'], ['T3', 'Torre 3'], ['TP', 'Torre parqueaderos'],
  ];
  const subSecciones = [
    ['ASC', 'Ascensores'], ['EQH', 'Equipos hidroneumáticos y bombas'], ['ELE', 'Sistema eléctrico'],
    ['RCI', 'Red contra incendios'], ['FAC', 'Fachada y cubierta'], ['ZCP', 'Zonas comunes de piso'],
  ];
  torres.forEach(function (t) {
    const torre = agregar(raiz, t[0], t[1], false, null);
    subSecciones.forEach(function (s) {
      agregar(torre, s[0], s[1], false, null);
    });
  });

  return nodos;
}

/** Catálogo de tipos de elemento (Anexo A). */
function semillaTipos() {
  function c(pares) {
    return pares.map(function (p) {
      const partes = String(p).split('|');
      return { valor: partes[0], nivel: partes[1] };
    });
  }
  function a(lista) {
    return lista.map(function (x) {
      const p = String(x).split('|');
      return { clave: p[0], etiqueta: p[1], tipo: p[2], opciones: p[3] ? p[3].split(',') : [], obligatorio: p[4] === '1' };
    });
  }

  return [
    {
      nombre: 'DVR/NVR', icono: 'hard-drive', sensible_default: true,
      descripcion: 'Grabador de videovigilancia',
      condiciones: c(['Operativo|OK', 'Con falla|FALLA', 'Intervenido|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['marca|Marca|texto||1', 'modelo|Modelo|texto||1', 'serial|Serial|texto||1',
        'canales|Canales totales|numero||0', 'canales_uso|Canales en uso|numero||0',
        'discos|Discos y capacidad|texto||0', 'retencion_dias|Días de retención medidos|numero||0',
        'ups|Tiene UPS|opcion|Sí,No|0']),
    },
    {
      nombre: 'Cámara', icono: 'camera', sensible_default: true,
      descripcion: 'Cámara de videovigilancia',
      condiciones: c(['Operativa|OK', 'Sin imagen|FALLA', 'Desenfocada|ATENCION', 'Sucia|ATENCION',
        'Obstruida|ATENCION', 'Reubicada|ATENCION']),
      atributos: a(['dvr|DVR al que pertenece|texto||1', 'canal|Canal|numero||1', 'zona|Zona que cubre|texto||1',
        'tipo|Tipo|opcion|Domo,Bala,Turret,PTZ,Box|1', 'marca|Marca|texto||0', 'modelo|Modelo|texto||0',
        'resolucion|Resolución|texto||0', 'graba|Graba|opcion|Sí,No|0',
        'angulo|Ángulo correcto|opcion|Sí,No|0']),
    },
    {
      nombre: 'Piscina', icono: 'waves', sensible_default: false,
      descripcion: 'Piscina o área húmeda',
      condiciones: c(['Habilitada|OK', 'Con restricción|ATENCION', 'Cerrada|FALLA']),
      atributos: a(['volumen|Volumen (m³)|numero||0', 'caudal|Caudal|numero||0',
        'filtro|Tipo de filtro|texto||0', 'desinfeccion|Sistema de desinfección|texto||0']),
    },
    {
      nombre: 'Bomba / equipo hidroneumático', icono: 'gauge', sensible_default: false,
      descripcion: 'Bomba o equipo de presión',
      condiciones: c(['Operativa|OK', 'Con ruido o vibración|ATENCION', 'Con fuga|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['marca|Marca|texto||0', 'modelo|Modelo|texto||0', 'potencia|Potencia (HP)|numero||0',
        'presion_arranque|Presión de arranque|numero||0', 'presion_parada|Presión de parada|numero||0']),
    },
    {
      nombre: 'Tanque de agua', icono: 'droplet', sensible_default: false,
      descripcion: 'Tanque de almacenamiento',
      condiciones: c(['Operativo|OK', 'Con filtración|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['capacidad|Capacidad (m³)|numero||1', 'ubicacion|Ubicación|texto||0', 'material|Material|texto||0']),
    },
    {
      nombre: 'Ascensor', icono: 'move-vertical', sensible_default: false,
      descripcion: 'Ascensor o equipo de transporte vertical',
      condiciones: c(['Operativo|OK', 'Con falla intermitente|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['marca|Marca|texto||0', 'capacidad|Capacidad|texto||0', 'paradas|Paradas|numero||0',
        'mantenedor|Empresa mantenedora|texto||0', 'certificado_vence|Vencimiento del certificado|fecha||0']),
    },
    {
      nombre: 'Panel de alarma / detección', icono: 'bell', sensible_default: false,
      descripcion: 'Central de alarma o detección',
      condiciones: c(['Normal|OK', 'En problema|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['marca|Marca|texto||0', 'modelo|Modelo|texto||0', 'zonas|Zonas|numero||0', 'baterias|Baterías|texto||0']),
    },
    {
      nombre: 'Bomba contra incendio', icono: 'flame', sensible_default: false,
      descripcion: 'Bomba del sistema contra incendio',
      condiciones: c(['Operativa|OK', 'Con novedad|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['tipo|Tipo|opcion|Eléctrica,Diésel|1', 'caudal|Caudal nominal|numero||0',
        'presion|Presión nominal|numero||0']),
    },
    {
      nombre: 'Extintor', icono: 'fire-extinguisher', sensible_default: false,
      descripcion: 'Extintor portátil',
      condiciones: c(['Vigente|OK', 'Próximo a vencer|ATENCION', 'Vencido o despresurizado|FALLA']),
      atributos: a(['tipo|Tipo|texto||1', 'capacidad|Capacidad|texto||0', 'recarga_vence|Vencimiento de recarga|fecha||0']),
    },
    {
      nombre: 'Salón / espacio común', icono: 'door-open', sensible_default: false,
      descripcion: 'Salón social u otro espacio de uso común',
      condiciones: c(['Disponible|OK', 'Con daños menores|ATENCION', 'No disponible|FALLA']),
      atributos: a(['aforo|Aforo|numero||0', 'dotacion|Dotación|texto||0']),
    },
    {
      nombre: 'Jardín / zona verde', icono: 'trees', sensible_default: false,
      descripcion: 'Zona verde',
      condiciones: c(['Buen estado|OK', 'Requiere intervención|ATENCION']),
      atributos: a(['area|Área (m²)|numero||0']),
    },
    {
      nombre: 'Control de acceso', icono: 'key-round', sensible_default: true,
      descripcion: 'Lector, talanquera o puerta vehicular',
      condiciones: c(['Operativo|OK', 'Falla intermitente|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['tipo|Tipo|texto||1', 'marca|Marca|texto||0', 'modelo|Modelo|texto||0']),
    },
    {
      nombre: 'Planta eléctrica', icono: 'zap', sensible_default: false,
      descripcion: 'Planta de emergencia',
      condiciones: c(['Operativa|OK', 'Con novedad|ATENCION', 'Fuera de servicio|FALLA']),
      atributos: a(['potencia|Potencia (kVA)|numero||0', 'horas|Horas de uso|numero||0']),
    },
    {
      nombre: 'Iluminación de emergencia', icono: 'lightbulb', sensible_default: false,
      descripcion: 'Luminarias de emergencia',
      condiciones: c(['Operativa|OK', 'Autonomía baja|ATENCION', 'No enciende|FALLA']),
      atributos: a(['zona|Zona|texto||1', 'cantidad|Cantidad de luminarias|numero||0']),
    },
    {
      nombre: 'Fachada / cubierta', icono: 'building', sensible_default: false,
      descripcion: 'Fachada, cubierta o impermeabilización',
      condiciones: c(['Buen estado|OK', 'Con fisuras o filtraciones|ATENCION', 'Riesgo|FALLA']),
      atributos: a(['area|Área|numero||0', 'material|Material|texto||0']),
    },
  ].map(function (t) {
    return {
      id: newId('TIP'),
      nombre: t.nombre,
      icono: t.icono,
      atributos_json: toJson(t.atributos),
      condiciones_json: toJson(t.condiciones),
      sensible_default: t.sensible_default,
      descripcion: t.descripcion,
      activo: true,
    };
  });
}

/**
 * Plantillas iniciales. Cubre el piloto de Cámaras y las obligaciones normativas
 * más citadas; el resto del Anexo B se carga desde el panel del administrador.
 */
function semillaPlantillas(tipos, nodos) {
  const porNombre = {};
  tipos.forEach(function (t) { porNombre[t.nombre] = t.id; });
  const plantillas = [];
  const items = [];

  function plantilla(nombre, tipoNombre, metodo, norma) {
    const p = {
      id: newId('PLA'),
      nombre: nombre,
      tipo_elemento_id: porNombre[tipoNombre] || '',
      version: 1,
      metodo_avance: metodo || 'CHECKLIST',
      norma_referencia: norma || '',
      activa: true,
    };
    plantillas.push(p);
    return p;
  }

  function item(p, orden, grupo, pregunta, tipoRespuesta, criterio, opts) {
    const o = opts || {};
    items.push({
      id: newId('ITM'),
      plantilla_id: p.id,
      version: p.version,
      orden: orden,
      grupo: grupo,
      pregunta: pregunta,
      tipo_respuesta: tipoRespuesta,
      opciones_json: o.opciones ? toJson(o.opciones) : '',
      criterio_aceptacion: criterio || '',
      valor_min: o.min !== undefined ? o.min : '',
      valor_max: o.max !== undefined ? o.max : '',
      unidad: o.unidad || '',
      obligatorio: o.obligatorio === undefined ? true : o.obligatorio,
      peso: o.peso === undefined ? 1 : o.peso,
      requiere_foto: !!o.foto,
      genera_novedad_si_falla: !!o.novedad,
      activo: true,
    });
  }

  // 1. Cámara · revisión CCTV mensual
  const cctv = plantilla('Revisión CCTV — cámara', 'Cámara', 'CHECKLIST', 'Buena práctica / manual del fabricante');
  item(cctv, 1, 'Limpieza', 'Domo y lente limpios, sin telarañas ni polvo', 'SI_NO',
    'Debe quedar limpio; se compara con la foto ANTES', { foto: true, peso: 2 });
  item(cctv, 2, 'Imagen', 'La imagen se ve nítida y con el ángulo correcto', 'SI_NO',
    'Sin desenfoque, sin obstrucción y con el encuadre previsto', { peso: 2, novedad: true });
  item(cctv, 3, 'Imagen', 'La cámara está grabando en el DVR', 'SI_NO',
    'Debe aparecer en grabación continua o por movimiento', { peso: 2, novedad: true });
  item(cctv, 4, 'Imagen', 'Cableado y conector sin humedad ni empalmes sueltos', 'SI_NO',
    'Sin empalmes a la intemperie', {});
  item(cctv, 5, 'Grabación', 'Días de retención efectivos', 'NUMERO',
    'Debe ser igual o mayor a los días configurados', { min: 1, max: 365, unidad: 'días', peso: 2 });

  // 2. DVR/NVR · revisión técnica trimestral
  const dvr = plantilla('Revisión técnica — DVR/NVR', 'DVR/NVR', 'CHECKLIST', 'Buena práctica / manual del fabricante');
  item(dvr, 1, 'Discos', 'Discos sin errores SMART ni sectores reasignados', 'SI_NO',
    'Sin fallos; anotar horas de uso', { novedad: true, peso: 2 });
  item(dvr, 2, 'Hora', 'Fecha y hora sincronizadas por NTP', 'SI_NO',
    'La hora del video es prueba: debe coincidir con la real', { peso: 2 });
  item(dvr, 3, 'Firmware', 'Firmware en la versión estable más reciente', 'SI_NO',
    'Anotar la versión instalada', {});
  item(dvr, 4, 'Seguridad', 'Contraseña de administrador distinta a la de fábrica', 'SI_NO',
    'No registrar la contraseña en el reporte', { novedad: true, peso: 2 });
  item(dvr, 5, 'Energía', 'UPS operativa y con autonomía comprobada', 'SI_NO',
    'Sin UPS el equipo se apaga en cada corte', {});

  // 3. Piscina · calidad del agua (diaria)
  const pis = plantilla('Calidad del agua — piscina', 'Piscina', 'CHECKLIST',
    'Resolución 234 de 2026 (MinSalud), art. 16 · rangos por confirmar');
  item(pis, 1, 'Química', 'pH del agua', 'NUMERO', 'Rango por confirmar con el Anexo Técnico I',
    { min: 7.2, max: 7.8, unidad: 'pH', peso: 2, novedad: true });
  item(pis, 2, 'Química', 'Cloro libre residual', 'NUMERO', 'Rango por confirmar con el Anexo Técnico I',
    { min: 1.0, max: 3.0, unidad: 'ppm', peso: 2, novedad: true });
  item(pis, 3, 'Agua', 'Agua transparente, se ve el fondo', 'SI_NO', 'Sin turbidez ni residuos', { foto: true });
  item(pis, 4, 'Agua', 'Temperatura del agua', 'NUMERO', 'Registrar la lectura', { unidad: '°C' });
  item(pis, 5, 'Operación', 'Retrolavado y nivel de los filtros', 'SI_NO', 'Según la programación del sistema', {});
  item(pis, 6, 'Obligación', 'Bitácora del día firmada y disponible', 'SI_NO', 'Exigible en visita de inspección', {});

  // 4. Tanque · lavado y desinfección semestral (norma)
  const tan = plantilla('Lavado y desinfección — tanque', 'Tanque de agua', 'CHECKLIST',
    'Decreto 1575 de 2007, art. 10 · semestral');
  item(tan, 1, 'Preparación', 'Vaciado y aislamiento del tanque', 'SI_NO', 'Sin servicio durante el trabajo', {});
  item(tan, 2, 'Lavado', 'Restregado de paredes, piso y techo interno', 'SI_NO', 'Incluye accesorios', { foto: true });
  item(tan, 3, 'Desinfección', 'Desinfección con solución de hipoclorito', 'SI_NO', 'Según dosis del protocolo', {});
  item(tan, 4, 'Enjuague', 'Enjuague y retiro de residuos', 'SI_NO', '', {});
  item(tan, 5, 'Verificación', 'Cloro residual después del lavado', 'NUMERO', 'Registrar la lectura', { unidad: 'ppm', peso: 2 });
  item(tan, 6, 'Verificación', 'pH después del lavado', 'NUMERO', 'Registrar la lectura', { unidad: 'pH' });
  item(tan, 7, 'Documento', 'Certificado del servicio adjunto', 'FOTO', 'Debe anexarse en PDF', { obligatorio: true });

  return { plantillas: plantillas, items: items };
}

/** Plan estándar por tipo (base para generar recurrencias). */
function semillaPlanTipo(plantillas, tipos) {
  const porTipo = {};
  tipos.forEach(function (t) { porTipo[t.nombre] = t.id; });
  const plan = [
    ['Cámara', 'Revisión CCTV — cámara', 'MENSUAL', false, '', 3],
    ['DVR/NVR', 'Revisión técnica — DVR/NVR', 'TRIMESTRAL', false, '', 3],
    ['Piscina', 'Calidad del agua — piscina', 'CADA_N_DIAS', true, 'Resolución 234 de 2026, art. 16', 0],
    ['Tanque de agua', 'Lavado y desinfección — tanque', 'SEMESTRAL', true, 'Decreto 1575 de 2007, art. 10', 15],
  ];
  return plan.map(function (p) {
    const plantilla = plantillas.filter(function (x) { return x.nombre === p[1]; })[0];
    return {
      id: newId('PLT'),
      tipo_elemento_id: porTipo[p[0]] || '',
      plantilla_id: plantilla ? plantilla.id : '',
      frecuencia: p[2],
      obligatoria_legal: p[3],
      norma_referencia: p[4],
      dias_tolerancia: p[5],
      activo: true,
    };
  });
}

/** Configuración por defecto (Anexo C, v1.2). */
function semillaConfig() {
  const valores = [
    ['nombre_conjunto', 'Urbanización Cerro Azul', 'Encabezados e informes'],
    ['max_profundidad', '8', 'Profundidad máxima del árbol'],
    ['peso_plan', '0.5', 'Peso de la señal de plan en el puntaje de salud'],
    ['peso_condicion', '0.3', 'Peso de la condición operativa'],
    ['peso_novedades', '0.2', 'Peso de las novedades abiertas'],
    ['umbral_rojo_pct', '20', 'Porcentaje de elementos en crítico para pintar un agrupador'],
    ['umbral_riesgo_pts', '20', 'Desviación de ritmo que marca una actividad en riesgo'],
    ['tolerancia_dias', '2', 'Días de tolerancia para contar a tiempo'],
    ['dias_proximo', '7', 'Días para el distintivo Próximo'],
    ['dias_aviso_programado', '2', 'Días de anticipación del aviso de mantenimiento programado'],
    ['auto_publicar_criticas', 'FALSE', 'Publicar automáticamente alertas críticas'],
    ['cierre_automatico', 'TRUE', 'Pasar de aprobada a cerrada sin acta pendiente'],
    ['version_politica_datos', '1.0', 'Versión de la política de tratamiento de datos'],
    ['snapshot_minutos', '60', 'Frecuencia de regeneración del snapshot público'],
    ['sesion_horas', '12', 'Vigencia de la sesión'],
    ['enlace_minutos', '15', 'Vigencia del enlace de ingreso por correo'],
    ['recordatorio_dias', '1', 'Días antes del vencimiento para recordar al contratista'],
    ['dias_aviso_poliza', '30', 'Días de anticipación del aviso de vencimiento de póliza'],
    ['retencion_inactivos_meses', '24', 'Meses antes de anonimizar a un contratista inactivo'],
  ];
  return valores.map(function (v) {
    return { clave: v[0], valor: v[1], descripcion: v[2] };
  });
}
