/**
 * Schema.gs — encabezados exactos de cada hoja (SPEC v1.2, sec. 4, 4.7).
 * Db.gs accede por nombre de columna; este es el único lugar donde se define el orden.
 */

const CAMPOS_AUDITORIA = ['creado_en', 'creado_por', 'actualizado_en', 'actualizado_por', 'activo'];

// Sube este número cada vez que cambie el esquema: la app lo compara con la
// propiedad de script y crea las pestañas o columnas nuevas sin exigir setup().
const ESQUEMA_VERSION = 4;

const SCHEMA = {
  nodos: [
    'id', 'parent_id', 'clase', 'segmento', 'nombre', 'descripcion', 'codigo', 'ruta_ids', 'profundidad', 'orden',
    'tipo_elemento_id', 'sensible', 'visible_publico', 'criticidad', 'ficha_json', 'condicion_operativa',
    'salud_estado', 'salud_puntaje', 'salud_calculada_en', 'ultimo_mant_en', 'proximo_mant_en',
    'foto_portada_id',
  ].concat(CAMPOS_AUDITORIA),

  tipos_elemento: [
    'id', 'nombre', 'icono', 'atributos_json', 'condiciones_json', 'sensible_default', 'descripcion',
  ].concat(CAMPOS_AUDITORIA),

  plan_tipo: [
    'id', 'tipo_elemento_id', 'plantilla_id', 'frecuencia', 'obligatoria_legal', 'norma_referencia',
    'dias_tolerancia',
  ].concat(CAMPOS_AUDITORIA),

  plantillas: [
    'id', 'nombre', 'tipo_elemento_id', 'version', 'metodo_avance', 'norma_referencia', 'activa',
    'etapas_json',
  ].concat(CAMPOS_AUDITORIA),

  plantilla_items: [
    'id', 'plantilla_id', 'version', 'orden', 'grupo', 'pregunta', 'tipo_respuesta', 'opciones_json',
    'criterio_aceptacion', 'valor_min', 'valor_max', 'unidad', 'obligatorio', 'peso', 'requiere_foto',
    'genera_novedad_si_falla',
  ].concat(CAMPOS_AUDITORIA),

  usuarios: [
    'id', 'email', 'nombre', 'telefono', 'rol', 'empresa_id', 'estado', 'acepto_datos_en',
    'acepto_datos_version', 'ultimo_acceso', 'inactivo_desde', 'suprimido_en',
  ].concat(CAMPOS_AUDITORIA),

  empresas: [
    'id', 'razon_social', 'nit', 'contacto', 'email', 'telefono', 'contrato_numero', 'vigencia_desde',
    'vigencia_hasta', 'poliza_vence', 'estado', 'aviso_vencimiento_en',
  ].concat(CAMPOS_AUDITORIA),

  asignaciones: ['id', 'usuario_id', 'nodo_id', 'desde', 'hasta'].concat(CAMPOS_AUDITORIA),

  recurrencias: [
    'id', 'nodo_id', 'plantilla_id', 'empresa_id', 'responsable_id', 'frecuencia', 'n_dias', 'dia_preferido',
    'duracion_dias', 'anticipacion_dias', 'obligatoria_legal', 'proxima_fecha', 'activa',
  ].concat(CAMPOS_AUDITORIA),

  actividades: [
    'id', 'titulo', 'descripcion', 'nodo_id', 'plantilla_id', 'plantilla_version', 'empresa_id',
    'responsable_id', 'tipo', 'origen', 'novedad_id', 'recurrencia_id', 'fecha_inicio_plan',
    'fecha_fin_plan', 'dias_plan', 'prioridad', 'estado', 'vencida', 'en_riesgo', 'avance_reportado_pct',
    'avance_aprobado_pct', 'fecha_inicio_real', 'fecha_reporte_final', 'fecha_aprobacion',
    'obligatoria_legal', 'afecta_uso', 'publicable', 'acta_file_id', 'inicio_sin_foto_motivo',
    'propuesta_id',
    // v1.6: el valor aprobado y su cotización viven también en la actividad.
    'valor_aprobado', 'cotizacion_file_id',
  ].concat(CAMPOS_AUDITORIA),

  hitos: ['id', 'actividad_id', 'orden', 'nombre', 'peso', 'fecha_plan', 'estado', 'fecha_aprobacion']
    .concat(CAMPOS_AUDITORIA),

  reportes: [
    'id', 'actividad_id', 'hito_id', 'usuario_id', 'fecha', 'tipo', 'pct_declarado', 'descripcion', 'horas',
    'estado_revision', 'comentario_admin', 'revisado_por', 'revisado_en',
  ].concat(CAMPOS_AUDITORIA),

  respuestas: ['id', 'reporte_id', 'item_id', 'valor', 'cumple', 'observacion'].concat(CAMPOS_AUDITORIA),

  evidencias: [
    'id', 'reporte_id', 'actividad_id', 'nodo_id', 'momento', 'drive_file_id', 'mini_file_id', 'mime',
    'bytes', 'sha256', 'fecha_captura', 'fecha_subida', 'lat', 'lng', 'contiene_personas', 'publicable',
    'public_file_id',
  ].concat(CAMPOS_AUDITORIA),

  lecturas_estado: ['id', 'nodo_id', 'fecha', 'condicion_operativa', 'origen', 'reporte_id', 'usuario_id', 'nota']
    .concat(CAMPOS_AUDITORIA),

  novedades: [
    'id', 'nodo_id', 'titulo', 'descripcion', 'tipo', 'gravedad', 'estado', 'reportada_por', 'origen',
    'actividad_origen_id', 'actividad_correctiva_id', 'fecha_deteccion', 'fecha_compromiso',
    'fecha_resolucion', 'publicable', 'texto_publico',
  ].concat(CAMPOS_AUDITORIA),

  alertas: [
    'id', 'nivel', 'categoria', 'titulo', 'mensaje_publico', 'nodo_id', 'novedad_id', 'actividad_id',
    'inicio', 'fin', 'estado', 'fijada', 'origen', 'actualizaciones_json',
  ].concat(CAMPOS_AUDITORIA),

  auditoria: ['id', 'fecha', 'usuario_email', 'accion', 'entidad', 'entidad_id', 'antes_json', 'despues_json', 'ip_hint'],

  config: ['clave', 'valor', 'descripcion'],

  public_snapshot: ['clave', 'json', 'generado_en'],

  sesiones: ['id', 'token_hash', 'usuario_id', 'email', 'origen', 'creada_en', 'expira_en', 'ultimo_uso', 'revocada'],

  propuestas: [
    'id', 'nodo_id', 'titulo', 'hallazgo', 'alcance', 'fecha_inicio_sugerida', 'fecha_fin_sugerida',
    'prioridad_sugerida', 'afecta_uso', 'propuesta_por', 'empresa_id', 'estado', 'fotos_json',
    'revisado_por', 'revisado_en', 'motivo_rechazo', 'ajustes_json', 'actividad_id',
    'fotos_purgadas_en',
    // v1.6: la cotización del contratista y el valor que aprueba la administración.
    'valor_cotizado', 'cotizacion_file_id', 'cotizacion_nombre', 'cotizacion_bytes',
    'cotizacion_sha256', 'cotizacion_subida_en', 'cotizacion_vigente_hasta', 'valor_aprobado',
  ].concat(CAMPOS_AUDITORIA),

  notificaciones: ['id', 'fecha', 'usuario_id', 'tipo', 'entidad_id', 'estado', 'intentos', 'enviado_en', 'error'],
};

/** Anchos de columna razonables para revisar el libro a mano. */
const ANCHOS = {
  id: 120, titulo: 220, nombre: 200, descripcion: 260, pregunta: 260, codigo: 90, email: 180,
  json: 180, creado_en: 150, actualizado_en: 150,
};

function anchosPara(campo) {
  if (ANCHOS[campo]) return ANCHOS[campo];
  if (campo.indexOf('_json') > 0) return 200;
  if (campo.indexOf('fecha') === 0 || campo.indexOf('_en') > 0) return 150;
  return 110;
}
