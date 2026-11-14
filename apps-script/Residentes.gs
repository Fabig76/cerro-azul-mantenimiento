/**
 * Residentes.gs — reporte de daños por residentes desde el portal público (SPEC v1.6, 8.6).
 *
 * Es la única puerta de escritura sin sesión del portal. Todo lo que entra por aquí
 * es de un desconocido: se guarda aparte, no se publica nada y se limita el abuso.
 */

const RESIDENTES_FOTO_MAX = 2 * 1024 * 1024;
const RESIDENTES_DESCRIPCION_MIN = 15;
const RESIDENTES_DESCRIPCION_MAX = 500;
const RESIDENTES_CODIGO_LARGO = 6;
const RESIDENTES_ESPERA_MINIMA = 8000;

/** Código de consulta sin letras que se confunden al dictarlo (sin 0, O, 1, I, L). */
function codigoConsulta_() {
  const alfabeto = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let salida = '';
  for (let i = 0; i < RESIDENTES_CODIGO_LARGO; i++) {
    salida += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  }
  return salida;
}

/** Texto sin enlaces: un reporte no puede ser un anuncio. */
function textoLimpioResidente_(texto) {
  return String(texto || '').trim().replace(/\s+/g, ' ');
}

function tieneEnlace_(texto) {
  return /https?:\/\/|www\.|\.com\/|\.net\/|\.org\//i.test(String(texto || ''));
}

/**
 * Acción pública: un residente reporta un daño. Devuelve solo el código de consulta.
 */
function residentesReportar(ctx, payload) {
  const nodoId = exigirTexto(payload.nodo_id, 'nodo_id');
  const nodo = buscarPorId('nodos', nodoId);
  if (!nodo || !bool(nodo.activo)) fallar_('NO_ENCONTRADO', 'Esa sección no existe.');

  // Campo trampa: una persona no lo llena. Al robot se le responde como si hubiera
  // funcionado, con un código que no existe, para no enseñarle el detector.
  if (!esVacio(payload.trampa)) {
    return { codigo_consulta: codigoConsulta_() };
  }

  const abierto = Number(payload.abierto_en || 0);
  if (abierto && Date.now() - abierto < RESIDENTES_ESPERA_MINIMA) {
    fallar_('CONFLICTO', 'El formulario se envió demasiado rápido. Intente otra vez.');
  }

  const descripcion = textoLimpioResidente_(payload.descripcion);
  if (descripcion.length < RESIDENTES_DESCRIPCION_MIN) {
    fallar_('VALIDACION', 'Cuente un poco más qué pasó (al menos ' + RESIDENTES_DESCRIPCION_MIN + ' caracteres).');
  }
  if (descripcion.length > RESIDENTES_DESCRIPCION_MAX) {
    fallar_('VALIDACION', 'El texto es muy largo. Resúmalo en ' + RESIDENTES_DESCRIPCION_MAX + ' caracteres.');
  }
  if (tieneEnlace_(descripcion)) fallar_('VALIDACION', 'El texto no puede llevar enlaces.');

  // La foto es obligatoria (decisión C): sin ella no hay forma de verificar.
  if (!payload.base64) fallar_('VALIDACION', 'Falta la foto del daño.');

  if (!esVacio(payload.dispositivo)) {
    const dispositivo = sha256Hex(String(payload.dispositivo).slice(0, 200));
    const hoy = Number(cacheGet('res:d:' + dispositivo) || 0);
    if (hoy >= 3) fallar_('CONFLICTO', 'Ya enviaste 3 reportes hoy. Si es urgente, avisa en la portería.');
  }

  const maxHora = configNumero('residentes_max_hora', 20);
  const maxDia = configNumero('residentes_max_dia', 60);
  if (Number(cacheGet('res:total:hora') || 0) >= maxHora ||
      Number(cacheGet('res:total:dia') || 0) >= maxDia) {
    fallar_('CONFLICTO', 'Recibimos muchos reportes en este momento. Intente más tarde o avise en la portería.');
  }

  const bytes = decodificarBase64_(payload.base64);
  if (bytes.length > RESIDENTES_FOTO_MAX) fallar_('ARCHIVO_GRANDE', 'La foto supera 2 MB.');
  const miniBytes = payload.base64_mini ? decodificarBase64_(payload.base64_mini) : [];
  const sha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');

  // La misma foto dos veces es un reintento, no otro reporte.
  const repetido = filtrar('reportes_residentes', function (r) {
    return String(r.foto_sha256) === sha && bool(r.activo);
  })[0];
  if (repetido) return { codigo_consulta: repetido.codigo_consulta };

  const hoy = hoyIso();
  const carpeta = subcarpeta_(subcarpeta_(carpetaRaiz_(), 'Residentes'), hoy.slice(0, 4));
  const delMes = subcarpeta_(carpeta, hoy.slice(5, 7));
  const principal = delMes.createFile(Utilities.newBlob(bytes, 'image/jpeg', 'residente_' + Date.now() + '.jpg'));
  principal.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  let miniId = '';
  if (miniBytes.length) {
    miniId = delMes.createFile(Utilities.newBlob(miniBytes, 'image/jpeg', 'residente_mini_' + Date.now() + '.jpg')).getId();
  }

  const codigo = codigoConsulta_();
  const fila = insertar('reportes_residentes', {
    id: newId('RES'),
    codigo_consulta: codigo,
    nodo_id: nodoId,
    descripcion: descripcion,
    foto_file_id: principal.getId(),
    foto_mini_file_id: miniId,
    foto_sha256: sha,
    estado: 'POR_REVISAR',
    dispositivo_hash: esVacio(payload.dispositivo) ? '' : sha256Hex(String(payload.dispositivo).slice(0, 200)),
    revisado_por: '',
    revisado_en: '',
    motivo_descarte: '',
    novedad_id: '',
    foto_purgada_en: '',
    activo: true,
  }, 'residente');

  if (!esVacio(payload.dispositivo)) cacheContar('res:d:' + sha256Hex(String(payload.dispositivo).slice(0, 200)), 24 * 3600);
  cacheContar('res:total:hora', 3600);
  cacheContar('res:total:dia', 24 * 3600);

  // Al administrador le llega por la cola normal de correo.
  adminsEmails_().forEach(function (correo) {
    const u = usuarioPorEmail_(correo);
    if (u) encolar_(u.id, 'REPORTE_RESIDENTE', fila.id);
  });

  return { codigo_consulta: codigo };
}

/**
 * Acción pública de consulta: solo el estado y la fecha. Nunca el texto, la foto
 * ni el motivo del descarte (RN-52).
 */
function publicReporteEstado(p) {
  const codigo = String((p && p.codigo) || '').trim().toUpperCase();
  if (!codigo) return { estado: 'NO_ENCONTRADO' };

  const r = filtrar('reportes_residentes', function (x) {
    return bool(x.activo) && String(x.codigo_consulta).toUpperCase() === codigo;
  })[0];
  if (!r) return { estado: 'NO_ENCONTRADO' };

  let estado = 'RECIBIDO';
  if (String(r.estado) === 'DESCARTADO') estado = 'REVISADO';
  else if (String(r.estado) === 'CONVERTIDO') {
    const n = r.novedad_id ? buscarPorId('novedades', r.novedad_id) : null;
    estado = n && String(n.estado) === 'RESUELTA' ? 'ATENDIDO' : 'EN_ATENCION';
  }
  return { estado: estado, fecha: fechaIso_(r.creado_en) };
}

/** Lista para el panel del administrador. */
function residentesListar(ctx, payload) {
  const estado = payload.estado ? String(payload.estado).toUpperCase() : '';
  return {
    reportes: filtrar('reportes_residentes', function (r) {
      if (!bool(r.activo)) return false;
      return !estado || String(r.estado) === estado;
    }).sort(function (a, b) {
      return String(b.creado_en) < String(a.creado_en) ? -1 : 1;
    }).map(function (r) {
      const nodo = buscarPorId('nodos', r.nodo_id);
      return {
        id: r.id, nodo_id: r.nodo_id,
        nodo_codigo: nodo ? nodo.codigo : '',
        nodo_nombre: nodo ? (esSensible(nodo) ? 'Sistema de seguridad' : nodo.nombre) : '',
        descripcion: r.descripcion,
        estado: r.estado,
        creado_en: r.creado_en,
        motivo_descarte: r.motivo_descarte || '',
        novedad_id: r.novedad_id || '',
        tiene_foto: !!r.foto_file_id,
      };
    }),
  };
}

/** La foto del reporte. Nunca es pública. */
function residentesFotoGet(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const r = buscarPorId('reportes_residentes', id);
  if (!r || !bool(r.activo)) fallar_('NO_ENCONTRADO', 'Ese reporte no existe.');

  const archivoId = String(payload.tam) === 'mini' ? (r.foto_mini_file_id || r.foto_file_id) : r.foto_file_id;
  if (!archivoId) fallar_('NO_ENCONTRADO', 'Ese reporte no tiene foto.');
  try {
    const archivo = DriveApp.getFileById(archivoId);
    return { base64: Utilities.base64Encode(archivo.getBlob().getBytes()), mime: 'image/jpeg' };
  } catch (e) {
    fallar_('NO_ENCONTRADO', 'La foto de ese reporte ya no está disponible.');
  }
}

/**
 * Convierte el reporte en una novedad. La foto solo se adjunta si el administrador
 * confirma que no muestra personas ni placas (RN-49).
 */
function residentesConvertir(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const r = buscarPorId('reportes_residentes', id);
  if (!r || !bool(r.activo)) fallar_('NO_ENCONTRADO', 'Ese reporte no existe.');
  if (String(r.estado) !== 'POR_REVISAR') fallar_('ESTADO_INVALIDO', 'Ese reporte ya fue revisado.');

  const nodoId = payload.nodo_id || r.nodo_id;
  const titulo = exigirTexto(payload.titulo || 'Daño reportado por un residente', 'titulo', 120);
  const tipo = exigirEnEnum(payload.tipo || 'DANO', 'tipo', ['DANO', 'FALLA', 'RIESGO', 'OBSERVACION']);
  const gravedad = exigirEnEnum(payload.gravedad || 'MEDIA', 'gravedad', ['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

  const creada = crearNovedad_(ctx, {
    nodo_id: nodoId,
    titulo: titulo,
    descripcion: r.descripcion,
    tipo: tipo,
    gravedad: gravedad,
    origen: 'RESIDENTE',
    reportada_por: '',
    publicable: !!payload.publicable,
  });

  const novedad = creada.novedad;
  let publicable = false;
  if (payload.adjuntar_foto && r.foto_file_id) {
    // Sin la confirmación expresa, la foto no se publica.
    publicable = !!payload.foto_sin_personas;
  }

  actualizar('reportes_residentes', id, {
    estado: 'CONVERTIDO',
    novedad_id: novedad.id,
    revisado_por: ctx.usuario.email,
    revisado_en: ahoraIso(),
  }, ctx.usuario.email);
  auditar(ctx.usuario.email, 'REPORTE_RESIDENTE_CONVERTIDO', 'reporte_residente', id, null,
    { novedad: novedad.id, foto_publicable: publicable });

  return { novedad: { id: novedad.id, titulo: novedad.titulo } };
}

function residentesDescartar(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const motivo = exigirTexto(payload.motivo, 'motivo', 500);
  if (motivo.trim().length < 10) fallar_('VALIDACION', 'Escribe el motivo (al menos 10 caracteres).');

  const r = buscarPorId('reportes_residentes', id);
  if (!r || !bool(r.activo)) fallar_('NO_ENCONTRADO', 'Ese reporte no existe.');
  if (String(r.estado) !== 'POR_REVISAR') fallar_('ESTADO_INVALIDO', 'Ese reporte ya fue revisado.');

  actualizar('reportes_residentes', id, {
    estado: 'DESCARTADO',
    motivo_descarte: motivo,
    revisado_por: ctx.usuario.email,
    revisado_en: ahoraIso(),
  }, ctx.usuario.email);
  auditar(ctx.usuario.email, 'REPORTE_RESIDENTE_DESCARTADO', 'reporte_residente', id, null, { motivo: motivo });
  return { descartado: true };
}

/** A los 30 días de descartado, la foto se va; el texto y el motivo quedan (RN-50). */
function purgarReportesResidentes_() {
  const dias = configNumero('residentes_dias_borrado', 30);
  const corte = new Date(Date.now() - dias * 86400000);
  let archivos = 0;

  const viejos = filtrar('reportes_residentes', function (r) {
    if (!bool(r.activo)) return false;
    if (String(r.estado) !== 'DESCARTADO') return false;
    if (r.foto_purgada_en) return false;
    const fecha = new Date(String(r.revisado_en || r.creado_en));
    return !isNaN(fecha.getTime()) && fecha < corte;
  });
  if (!viejos.length) return { purgados: 0, archivos: 0 };

  viejos.forEach(function (r) {
    [r.foto_file_id, r.foto_mini_file_id].forEach(function (id) {
      if (!id) return;
      try { DriveApp.getFileById(id).setTrashed(true); archivos++; } catch (e) { /* ya no está */ }
    });
  });

  viejos.forEach(function (r) {
    actualizar('reportes_residentes', r.id, {
      foto_file_id: '', foto_mini_file_id: '', foto_purgada_en: hoyIso(),
    }, 'sistema');
  });
  return { purgados: viejos.length, archivos: archivos };
}
