/**
 * Auth.gs — identidad, sesiones y permisos (SPEC v1.2, sec. 6).
 *
 * La sesión identifica al usuario y nada más: el rol y las asignaciones se leen de las
 * hojas en cada petición (RN-24). Cambiar el rol o desactivar revoca de inmediato (RN-19).
 */

const ORIGEN_POR_DEFECTO = 'https://fabig76.github.io/cerro-azul-mantenimiento';

/** Identificador público del cliente OAuth (viaja en la página: no es un secreto). */
const OAUTH_CLIENT_ID_PUBLICO = '37422559984-nm58njlvomjhlsfiajvjibl6b636snk9.apps.googleusercontent.com';

function origenPortal() {
  return prop('ORIGEN') || config('origen_portal') || ORIGEN_POR_DEFECTO;
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

/** Crea una sesión y devuelve el token en claro (solo se guarda su SHA-256). */
function crearSesion_(usuario, origen) {
  const token = tokenAleatorioHex(32);
  const hash = sha256Hex(token);
  const horas = configNumero('sesion_horas', 12);
  const expira = new Date(Date.now() + horas * 3600 * 1000);
  insertar('sesiones', {
    id: newId('SES'),
    token_hash: hash,
    usuario_id: usuario.id,
    email: usuario.email,
    origen: origen || 'GOOGLE',
    creada_en: ahoraIso(),
    expira_en: ahoraIso(expira),
    ultimo_uso: ahoraIso(),
    revocada: false,
  });
  cachePut('ses:' + hash, String(usuario.id), horas * 3600);
  marcarUltimoAcceso_(usuario.id);
  return { sessionToken: token, expira_en: ahoraIso(expira) };
}

/** Valida el token y devuelve el contexto de la petición. */
function autenticar_(token) {
  if (esVacio(token)) return { ok: false, respuesta: err('NO_AUTENTICADO', 'Falta el token de sesión.') };
  const hash = sha256Hex(String(token));

  let usuarioId = cacheGet('ses:' + hash);
  let sesion = null;
  if (!usuarioId) {
    sesion = filtrar('sesiones', function (s) { return String(s.token_hash) === hash; })[0] || null;
    if (!sesion) return { ok: false, respuesta: err('SESION_VENCIDA', 'Tu sesión terminó, ingresa de nuevo.') };
    usuarioId = sesion.usuario_id;
  }
  if (sesion && bool(sesion.revocada)) {
    return { ok: false, respuesta: err('SESION_VENCIDA', 'Tu sesión fue revocada.') };
  }
  if (sesion && sesion.expira_en && new Date(String(sesion.expira_en)).getTime() < Date.now()) {
    return { ok: false, respuesta: err('SESION_VENCIDA', 'Tu sesión terminó, ingresa de nuevo.') };
  }

  const usuario = buscarPorId('usuarios', usuarioId);
  if (!usuario) return { ok: false, respuesta: err('SESION_VENCIDA', 'Tu usuario ya no existe.') };
  if (String(usuario.estado) === 'PENDIENTE') {
    return { ok: false, respuesta: err('PENDIENTE', 'Tu cuenta está en revisión.') };
  }
  if (String(usuario.estado) !== 'ACTIVO') {
    return { ok: false, respuesta: err('INACTIVO', 'Tu cuenta está inactiva.') };
  }

  const rol = String(usuario.rol || 'CONTRATISTA');
  return { ok: true, ctx: { usuario: usuario, rol: rol, token_hash: hash } };
}

function revocarSesiones_(usuarioId, usuarioActor) {
  const abiertas = filtrar('sesiones', function (s) {
    return String(s.usuario_id) === String(usuarioId) && !bool(s.revocada);
  });
  abiertas.forEach(function (s) {
    actualizar('sesiones', s.id, { revocada: true }, usuarioActor || 'sistema');
    cacheDel('ses:' + s.token_hash);
  });
  return abiertas.length;
}

function marcarUltimoAcceso_(usuarioId) {
  try {
    actualizar('usuarios', usuarioId, { ultimo_acceso: ahoraIso() }, 'sistema');
  } catch (e) { /* no es crítico */ }
}

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------

/** Lista de correos administradores: config.admin_emails (coma) o propiedad del script. */
function adminsEmails_() {
  const deConfig = String(config('admin_emails') || '');
  const deProp = String(prop('ADMIN_EMAILS') || '');
  return (deConfig + ',' + deProp).split(',')
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e) { return e.indexOf('@') > 0; });
}

function esAdminPorEmail_(email) {
  return adminsEmails_().indexOf(String(email || '').toLowerCase()) >= 0;
}

/** Nodos asignados a un usuario (solo asignaciones vigentes). */
function nodosAsignados_(usuarioId) {
  const hoy = hoyIso();
  const asignaciones = filtrar('asignaciones', function (a) {
    if (String(a.usuario_id) !== String(usuarioId)) return false;
    if (a.desde && fechaIso_(a.desde) > hoy) return false;
    if (a.hasta && fechaIso_(a.hasta) <= hoy) return false;
    return bool(a.activo);
  });
  return asignaciones.map(function (a) { return buscarPorId('nodos', a.nodo_id); })
    .filter(function (n) { return !!n; });
}

/**
 * Permiso de ejecución: distinto de "puede ver". El supervisor nunca ejecuta y un
 * contratista solo ejecuta en sus secciones asignadas, no en toda la empresa.
 */
function puedeEjecutarActividad_(ctx, act) {
  if (ctx.rol === 'ADMIN') return true;
  if (ctx.rol !== 'CONTRATISTA') return false;
  const nodo = buscarPorId('nodos', act.nodo_id);
  if (!nodo) return false;
  const asignados = nodosAsignados_(ctx.usuario.id);
  const propio = nodo.ruta_ids + '/' + nodo.id;
  return asignados.some(function (a) {
    const raiz = a.ruta_ids + '/' + a.id;
    return propio === raiz || propio.indexOf(raiz + '/') === 0;
  });
}

/** Exige que el usuario tenga acceso al nodo (o a un ancestro suyo). */
function requireNodo_(ctx, nodo) {
  if (ctx.rol === 'ADMIN' || ctx.rol === 'SUPERVISOR') return true;
  const asignados = nodosAsignados_(ctx.usuario.id);
  const propio = nodo.ruta_ids + '/' + nodo.id;
  const permitido = asignados.some(function (a) {
    const raiz = a.ruta_ids + '/' + a.id;
    return propio === raiz || propio.indexOf(raiz + '/') === 0;
  });
  if (!permitido) {
    auditar(ctx.usuario.email, 'DENEGADO', 'nodo', nodo.id, null, { codigo: nodo.codigo });
    fallar_('PROHIBIDO', 'No tienes acceso a esta sección.');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Ingreso
// ---------------------------------------------------------------------------

/** Ingreso con Google Identity Services: valida el ID token una sola vez. */
function authGoogle(ctx, payload) {
  const idToken = exigirTexto(payload.idToken, 'idToken');
  const clientId = prop('OAUTH_CLIENT_ID') || config('oauth_client_id') || OAUTH_CLIENT_ID_PUBLICO;
  if (!clientId) fallar_('VALIDACION', 'Falta configurar el Client ID de Google (SECRETO: OAUTH_CLIENT_ID).');

  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    fallar_('NO_AUTENTICADO', 'El token de Google no es válido.');
  }
  const info = JSON.parse(resp.getContentText());
  const emisor = String(info.iss || '');
  if (String(info.aud) !== String(clientId)) fallar_('NO_AUTENTICADO', 'El token no es para esta aplicación.');
  if (emisor !== 'accounts.google.com' && emisor !== 'https://accounts.google.com') {
    fallar_('NO_AUTENTICADO', 'Emisor de token no reconocido.');
  }
  if (Number(info.exp) * 1000 < Date.now()) fallar_('NO_AUTENTICADO', 'El token de Google venció.');
  if (String(info.email_verified) !== 'true') fallar_('NO_AUTENTICADO', 'El correo de Google no está verificado.');

  const email = String(info.email || '').toLowerCase();
  const usuario = asegurarAdmin_(email, info.name || email, 'GOOGLE');
  if (!usuario || sinConsentimiento_(usuario)) {
    return { estado: 'NO_REGISTRADO', registro_token: crearTokenRegistro_(email), email: email,
      motivo: usuario ? 'CONSENTIMIENTO' : 'NUEVO' };
  }
  return continuarIngreso_(usuario, 'GOOGLE');
}

/** Enlace de un solo uso al correo, para quien no tiene cuenta Google. */
function authEnlaceSolicitar(ctx, payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) fallar_('VALIDACION', 'El correo no es válido.');

  // Límites: 3 por correo y 50 en total por hora. Solo cuentan los envíos exitosos.
  if (Number(cacheGet('lim:v2:' + email) || 0) >= 3) {
    fallar_('CONFLICTO', 'Ya pediste 3 enlaces en la última hora. Espera un poco.');
  }
  if (Number(cacheGet('lim:v2:total') || 0) >= 50) {
    fallar_('CONFLICTO', 'Demasiadas solicitudes en este momento. Intenta más tarde.');
  }

  const minutos = configNumero('enlace_minutos', 15);
  const token = tokenAleatorioHex(24);
  cachePut('enl:' + sha256Hex(token), email, minutos * 60);

  const enlace = origenPortal() + '/app.html#/enlace?t=' + token;
  const asunto = 'Ingreso al Portal de Mantenimientos — Cerro Azul';
  const cuerpo = [
    'Hola.',
    '',
    'Para ingresar al Portal de Control de Mantenimientos de Cerro Azul, abre este enlace:',
    '',
    enlace,
    '',
    'El enlace sirve una sola vez y vence en ' + minutos + ' minutos.',
    'Si no solicitaste este ingreso, ignora este mensaje.',
    '',
    'Administración — Urbanización Cerro Azul',
  ].join('\n');
  MailApp.sendEmail({ to: email, subject: asunto, body: cuerpo, name: 'Cerro Azul — Mantenimientos' });
  cacheContar('lim:v2:' + email, 3600);
  cacheContar('lim:v2:total', 3600);

  auditar(email, 'ENLACE_SOLICITADO', 'usuario', '', null, { email: email });
  return { enviado: true };
}

/** Canjea el enlace del correo por una sesión. */
function authEnlaceCanjear(ctx, payload) {
  const token = exigirTexto(payload.token_enlace, 'token_enlace');
  const clave = 'enl:' + sha256Hex(token);
  const email = cacheGet(clave);
  if (!email) fallar_('NO_ENCONTRADO', 'El enlace venció o ya fue usado. Solicita uno nuevo.');
  cacheDel(clave);

  const correo = String(email).toLowerCase();
  const usuario = asegurarAdmin_(correo, correo, 'ENLACE');
  if (!usuario || sinConsentimiento_(usuario)) {
    return { estado: 'NO_REGISTRADO', registro_token: crearTokenRegistro_(correo), email: correo,
      motivo: usuario ? 'CONSENTIMIENTO' : 'NUEVO' };
  }
  return continuarIngreso_(usuario, 'ENLACE');
}

/** Decide si la persona puede entrar y devuelve su estado. */
function continuarIngreso_(usuario, origen) {
  const estado = String(usuario.estado || 'PENDIENTE');
  if (estado === 'PENDIENTE') {
    return { estado: 'PENDIENTE', sessionToken: null, usuario: { email: usuario.email, nombre: usuario.nombre } };
  }
  if (estado !== 'ACTIVO') {
    return { estado: 'INACTIVO', sessionToken: null, usuario: { email: usuario.email, nombre: usuario.nombre } };
  }
  const sesion = crearSesion_(usuario, origen);
  auditar(usuario.email, 'INGRESO', 'usuario', usuario.id, null, { origen: origen });
  return {
    estado: 'ACTIVO',
    sessionToken: sesion.sessionToken,
    expira_en: sesion.expira_en,
    usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
  };
}

/** Busca el usuario por correo. No lo crea: el alta pasa por el registro con autorización. */
function usuarioPorEmail_(email) {
  return filtrar('usuarios', function (u) {
    return String(u.email || '').toLowerCase() === email && !bool(u.suprimido_en);
  })[0] || null;
}

/**
 * Solo los correos de administración se crean solos (necesitan entrar para activar a los demás).
 * Cualquier otra persona pasa por auth.registrar, que guarda la autorización de datos.
 */
function asegurarAdmin_(email, nombre, origen) {
  const existente = usuarioPorEmail_(email);
  if (existente) {
    if (esAdminPorEmail_(email) && String(existente.rol) !== 'ADMIN') {
      const actualizado = actualizar('usuarios', existente.id, { rol: 'ADMIN', estado: 'ACTIVO' }, 'sistema');
      auditar('sistema', 'ROL_ADMIN_POR_CONFIG', 'usuario', existente.id, null, { email: email });
      return actualizado;
    }
    return existente;
  }
  if (!esAdminPorEmail_(email) && filas('usuarios').length > 0) return null;

  const usuario = insertar('usuarios', {
    id: newId('USU'),
    email: email,
    nombre: nombre || email,
    telefono: '',
    rol: 'ADMIN',
    empresa_id: '',
    estado: 'ACTIVO',
    acepto_datos_en: ahoraIso(),
    acepto_datos_version: 'admin',
    ultimo_acceso: '',
    inactivo_desde: '',
    suprimido_en: '',
    activo: true,
  }, origen);
  auditar('sistema', 'USUARIO_CREADO', 'usuario', usuario.id, null, { email: email, rol: 'ADMIN' });
  return usuario;
}

/** Un usuario activo sin autorización de datos no puede entrar (Ley 1581). */
function sinConsentimiento_(usuario) {
  if (!usuario) return true;
  if (String(usuario.rol) === 'ADMIN') return false;
  return !String(usuario.acepto_datos_en || '').trim();
}

/** Token de un solo uso para completar el registro. */
function crearTokenRegistro_(email) {
  const token = tokenAleatorioHex(24);
  cachePut('reg:' + sha256Hex(token), String(email).toLowerCase(), 1800);
  return token;
}

// ---------------------------------------------------------------------------
// Acciones de sesión
// ---------------------------------------------------------------------------

function authMe(ctx) {
  const asignados = ctx.rol === 'ADMIN' || ctx.rol === 'SUPERVISOR' ? [] : nodosAsignados_(ctx.usuario.id);
  return {
    usuario: {
      id: ctx.usuario.id,
      email: ctx.usuario.email,
      nombre: ctx.usuario.nombre,
      rol: ctx.rol,
      empresa_id: ctx.usuario.empresa_id || '',
    },
    asignaciones: asignados.map(function (n) {
      return { nodo_id: n.id, codigo: n.codigo, nombre: n.nombre };
    }),
    config_ui: {
      nombre_conjunto: config('nombre_conjunto'),
      origen: origenPortal(),
    },
  };
}

function authSalir(ctx) {
  revocarSesiones_(ctx.usuario.id, ctx.usuario.email);
  return { ok: true };
}

/**
 * Ejecutar una vez desde el editor para que Google conceda todos los permisos
 * de una sola vez (Sheets, Drive, correo y llamadas externas).
 */
function autorizar() {
  const r = {
    hoja: hojaCalculo().getName(),
    carpetas: DriveApp.getFolderById(prop('ROOT_FOLDER_ID')).getName(),
    correos_disponibles: MailApp.getRemainingDailyQuota(),
    red: UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true }).getResponseCode(),
    disparadores: ScriptApp.getProjectTriggers().length,
  };
  console.log(JSON.stringify(r));
  return r;
}


/**
 * Registro con autorización de tratamiento de datos (Ley 1581 de 2012).
 * Exige casilla marcada y guarda fecha y versión de la política aceptada.
 */
function authRegistrar(ctx, payload) {
  const token = exigirTexto(payload.registro_token, 'registro_token');
  if (payload.acepta_datos !== true) {
    fallar_('VALIDACION', 'Debes autorizar el tratamiento de tus datos para registrarte.');
  }

  const clave = 'reg:' + sha256Hex(token);
  const email = cacheGet(clave);
  if (!email) fallar_('NO_ENCONTRADO', 'El registro venció. Vuelve a ingresar con tu correo.');

  const nombre = exigirTexto(payload.nombre, 'nombre', 120);
  const telefono = payload.telefono ? String(payload.telefono).slice(0, 30) : '';

  let empresaId = payload.empresa_id || '';
  if (!empresaId && payload.empresa_nueva && payload.empresa_nueva.razon_social) {
    const nueva = insertar('empresas', {
      id: newId('EMP'),
      razon_social: String(payload.empresa_nueva.razon_social).slice(0, 160),
      nit: payload.empresa_nueva.nit ? String(payload.empresa_nueva.nit).slice(0, 30) : '',
      contacto: '', email: '', telefono: '',
      contrato_numero: '', vigencia_desde: '', vigencia_hasta: '', poliza_vence: '',
      estado: 'ACTIVA', aviso_vencimiento_en: '', activo: true,
    }, email);
    empresaId = nueva.id;
  }

  const previo = usuarioPorEmail_(email);
  let usuario;

  if (previo) {
    // Ya existía sin autorización: se completa el consentimiento, no se duplica la cuenta.
    usuario = actualizar('usuarios', previo.id, {
      nombre: nombre || previo.nombre,
      telefono: telefono || previo.telefono,
      empresa_id: empresaId || previo.empresa_id,
      acepto_datos_en: ahoraIso(),
      acepto_datos_version: String(config('version_politica_datos') || '1.0'),
    }, email);
  } else {
    usuario = insertar('usuarios', {
      id: newId('USU'),
      email: email,
      nombre: nombre,
      telefono: telefono,
      rol: 'CONTRATISTA',
      empresa_id: empresaId,
      estado: 'PENDIENTE',
      acepto_datos_en: ahoraIso(),
      acepto_datos_version: String(config('version_politica_datos') || '1.0'),
      ultimo_acceso: '',
      inactivo_desde: '',
      suprimido_en: '',
      activo: true,
    }, email);
  }

  cacheDel(clave);

  // Avisar a los administradores, sin bloquear el registro (RN-20).
  adminsEmails_().forEach(function (adm) {
    const admin = usuarioPorEmail_(adm);
    if (admin) encolar_(admin.id, 'USUARIO_NUEVO', usuario.id);
  });

  auditar(email, 'USUARIO_REGISTRADO', 'usuario', usuario.id, null,
    { empresa: empresaId || null, acepto: true });

  return {
    estado: previo ? (String(previo.estado) === 'ACTIVO' ? 'ACTIVO' : 'PENDIENTE') : 'PENDIENTE',
    mensaje: previo && String(previo.estado) === 'ACTIVO'
      ? 'Autorización registrada. Ya puedes ingresar.'
      : 'Tu cuenta quedó en revisión. La administración la activará.',
  };
}
