/**
 * Demo.gs — datos de ejemplo para revisar el portal completo.
 * Se ejecuta UNA sola vez: crea un elemento con checklist y dos actividades con evidencia.
 * Todo va marcado como "Demostración" para poder identificarlo y borrarlo.
 */

const DEMO_IMG_ANTES = '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';
const DEMO_IMG_DESPUES = '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';

/** Ejecuta la demostración. Idempotente: solo corre si DEMO_HECHO está vacío. */
function crearDemo() {
  if (prop('DEMO_HECHO') === 'si') fallar_('CONFLICTO', 'La demostración ya fue creada.');

  const hoy = hoyIso();
  const usuario = 'demo@local';

  // 1. Elemento con tipo, para que traiga checklist.
  const tipoDvr = filtrar('tipos_elemento', function (t) { return t.nombre === 'DVR/NVR'; })[0];
  if (!tipoDvr) fallar_('SIN_CONFIGURAR', 'Falta el tipo DVR/NVR.');
  const padre = filtrar('nodos', function (n) { return n.codigo === 'CA-AC-CAM'; })[0];
  if (!padre) fallar_('SIN_CONFIGURAR', 'Falta la sección CA-AC-CAM.');

  const dvr = insertar('nodos', {
    id: newId('NOD'),
    parent_id: padre.id,
    clase: 'ELEMENTO',
    segmento: 'DVR01',
    nombre: 'DVR Torre 2 (demostración)',
    codigo: padre.codigo + '-DVR01',
    ruta_ids: padre.ruta_ids + '/' + padre.id,
    profundidad: Number(padre.profundidad) + 1,
    orden: 1,
    tipo_elemento_id: tipoDvr.id,
    sensible: true,
    visible_publico: true,
    criticidad: 3,
    ficha_json: toJson({ marca: 'Hikvision', modelo: 'DS-7216', serial: 'DEMO-0001', canales: 16, canales_uso: 11 }),
    salud_estado: 'SIN_DATOS',
    salud_puntaje: '',
    activo: true,
  }, usuario);

  const plantillaDvr = filtrar('plantillas', function (p) {
    return p.nombre === 'Revisión técnica — DVR/NVR';
  })[0];

  // 2. Actividad A: programada, con checklist, lista para iniciar.
  const actA = insertar('actividades', {
    id: newId('ACT'),
    titulo: 'Demostración — mantenimiento preventivo del DVR',
    descripcion: 'Revisión trimestral del grabador de la Torre 2: discos, hora, firmware, seguridad y UPS.',
    nodo_id: dvr.id,
    plantilla_id: plantillaDvr ? plantillaDvr.id : '',
    plantilla_version: plantillaDvr ? plantillaDvr.version : '',
    empresa_id: '',
    responsable_id: '',
    tipo: 'UNICA',
    origen: 'PLAN',
    fecha_inicio_plan: hoy,
    fecha_fin_plan: sumarDias(hoy, 2),
    dias_plan: 3,
    prioridad: 'ALTA',
    estado: 'PROGRAMADA',
    vencida: false,
    en_riesgo: false,
    avance_reportado_pct: 0,
    avance_aprobado_pct: 0,
    obligatoria_legal: false,
    afecta_uso: false,
    publicable: true,
    activo: true,
  }, usuario);

  // 3. Actividad B: reportada y con fotos, para ver la revisión del administrador.
  const actB = insertar('actividades', {
    id: newId('ACT'),
    titulo: 'Demostración — lavado de muro del pasillo',
    descripcion: 'Lavado y desinfección del muro del pasillo externo de la Torre 2.',
    nodo_id: padre.id,
    plantilla_id: '',
    plantilla_version: '',
    empresa_id: '',
    responsable_id: '',
    tipo: 'UNICA',
    origen: 'PLAN',
    fecha_inicio_plan: sumarDias(hoy, -3),
    fecha_fin_plan: sumarDias(hoy, -1),
    dias_plan: 3,
    prioridad: 'MEDIA',
    estado: 'REPORTADA',
    vencida: false,
    en_riesgo: false,
    avance_reportado_pct: 100,
    avance_aprobado_pct: 0,
    fecha_inicio_real: sumarDias(hoy, -3) + 'T08:00:00-05:00',
    fecha_reporte_final: ahoraIso(),
    obligatoria_legal: false,
    afecta_uso: false,
    publicable: true,
    activo: true,
  }, usuario);

  // 4. Evidencias de la actividad B.
  const carpeta = subcarpeta_(subcarpeta_(carpetaRaiz_(), CARPETA_EVIDENCIAS), hoy.slice(0, 4));
  const carpetaMes = subcarpeta_(carpeta, hoy.slice(5, 7));
  const carpetaAct = subcarpeta_(carpetaMes, actB.id);

  function subirDemo(base64, momento, nombre) {
    const bytes = Utilities.base64Decode(base64);
    const archivo = carpetaAct.createFile(Utilities.newBlob(bytes, 'image/png', nombre + '.png'));
    archivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    return insertar('evidencias', {
      id: newId('EVI'),
      reporte_id: '',
      actividad_id: actB.id,
      nodo_id: padre.id,
      momento: momento,
      drive_file_id: archivo.getId(),
      mini_file_id: '',
      mime: 'image/png',
      bytes: bytes.length,
      sha256: sha256Hex(nombre + actB.id),
      fecha_captura: '',
      fecha_subida: ahoraIso(),
      lat: '', lng: '',
      contiene_personas: false,
      publicable: true,
      public_file_id: '',
      activo: true,
    }, usuario);
  }

  subirDemo(DEMO_IMG_ANTES, 'ANTES', 'demostracion_antes');
  subirDemo(DEMO_IMG_DESPUES, 'DESPUES', 'demostracion_despues');

  // 5. Reporte final pendiente de revisión.
  insertar('reportes', {
    id: newId('REP'),
    actividad_id: actB.id,
    hito_id: '',
    usuario_id: '',
    fecha: ahoraIso(),
    tipo: 'FINAL',
    pct_declarado: 100,
    descripcion: 'Se lavó el muro con hidrolavadora y detergente neutro. Queda limpio y sin manchas.',
    horas: 6,
    estado_revision: 'PENDIENTE',
    comentario_admin: '',
    revisado_por: '',
    revisado_en: '',
    activo: true,
  }, usuario);

  recalcularSalud_(dvr.id, usuario);
  prop('DEMO_HECHO', 'si');

  return {
    elemento: dvr.codigo,
    actividad_programada: actA.id,
    actividad_reportada: actB.id,
    fotos: 2,
  };
}
