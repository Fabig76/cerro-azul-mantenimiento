/**
 * Utils.gs — utilidades comunes del Portal Cerro Azul.
 * Spec v1.2 · secciones 2, 4, 9.
 */

const TZ = 'America/Bogota';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID de 26 caracteres (tiempo + azar), con prefijo de entidad: NOD_, ACT_… */
function newId(prefijo) {
  let tiempo = Date.now();
  let t = '';
  for (let i = 0; i < 10; i++) {
    t = CROCKFORD.charAt(tiempo % 32) + t;
    tiempo = Math.floor(tiempo / 32);
  }
  let azar = '';
  const bytes = Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < 16; i++) {
    azar += CROCKFORD.charAt(parseInt(bytes.charAt(i), 16) % 32);
  }
  return (prefijo ? prefijo + '_' : '') + t + azar;
}

/** Fecha y hora ISO 8601 en America/Bogota: 2026-10-31T14:52:00-05:00 */
function ahoraIso(fecha) {
  return Utilities.formatDate(fecha || new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Fecha corta ISO en America/Bogota: 2026-10-31 */
function hoyIso(fecha) {
  return Utilities.formatDate(fecha || new Date(), TZ, 'yyyy-MM-dd');
}

/** Suma días a una fecha ISO corta y devuelve otra fecha ISO corta. */
function sumarDias(isoCorta, dias) {
  const p = String(isoCorta).split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + dias);
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

/** Diferencia en días completos entre dos fechas ISO cortas (b - a). */
function diasEntre(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00-05:00');
  const b = new Date(bIso + 'T00:00:00-05:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function toJson(v) {
  return v === null || v === undefined ? '' : JSON.stringify(v);
}

function fromJson(txt, porDefecto) {
  if (txt === null || txt === undefined || txt === '') return porDefecto;
  try {
    return JSON.parse(txt);
  } catch (e) {
    return porDefecto;
  }
}

function sha256Hex(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/**
 * Token aleatorio en hexadecimal a partir de UUID v4 (B3 de la auditoría).
 * Math.random no es criptográficamente seguro; el UUID sí es una fuente adecuada.
 */
function tokenAleatorioHex(n) {
  const necesarios = Math.max(2, Math.ceil((n || 32) / 16));
  let s = '';
  for (let i = 0; i < necesarios; i++) {
    s += Utilities.getUuid().replace(/-/g, '');
  }
  return s.slice(0, Math.max(32, (n || 32) * 2));
}

function esVacio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function bool(v) {
  if (v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1') return true;
  return false;
}

/** Respuesta uniforme de la API (sec. 9). */
function ok(data) {
  return { ok: true, data: data };
}

function err(code, message, details) {
  const r = { ok: false, code: code, message: message };
  if (details !== undefined) r.details = details;
  return r;
}

/** Devuelve el resultado como JSON de ContentService. */
function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Valida un texto obligatorio con longitud máxima. */
function exigirTexto(v, campo, max) {
  if (esVacio(v)) throw new Error('VALIDACION: ' + campo + ' es obligatorio');
  const s = String(v).trim();
  if (max && s.length > max) throw new Error('VALIDACION: ' + campo + ' supera ' + max + ' caracteres');
  return s;
}

function exigirEnEnum(v, campo, permitidos) {
  const s = String(v || '').toUpperCase();
  if (permitidos.indexOf(s) < 0) {
    throw new Error('VALIDACION: ' + campo + ' debe ser uno de ' + permitidos.join(', '));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Caché (velocidad de sesiones y límites de frecuencia). No es fuente de verdad.
// ---------------------------------------------------------------------------
function cacheGet(clave) {
  return CacheService.getScriptCache().get(clave);
}

function cachePut(clave, valor, segundos) {
  try {
    CacheService.getScriptCache().put(clave, valor, Math.max(1, Math.min(segundos || 300, 21600)));
  } catch (e) {
    console.warn('cachePut: ' + e.message);
  }
}

function cacheDel(clave) {
  try {
    CacheService.getScriptCache().remove(clave);
  } catch (e) { /* nada */ }
}

/** Contador con ventana: devuelve el valor acumulado y lo incrementa. */
function cacheContar(clave, ventanaSegundos) {
  const actual = Number(cacheGet(clave) || 0) + 1;
  cachePut(clave, String(actual), ventanaSegundos || 3600);
  return actual;
}

/** Guarda o actualiza una clave de configuración (solo ADMIN). */
function configGuardar(ctx, payload) {
  const clave = exigirTexto(payload.clave, 'clave', 60);
  const valor = payload.valor === undefined ? '' : String(payload.valor);
  const existente = filtrar('config', function (c) { return String(c.clave) === clave; })[0];
  configEscribir(clave, valor, existente ? existente.descripcion : '');
  auditar(ctx.usuario.email, 'CONFIG_CAMBIADA', 'config', clave, existente ? existente.valor : null, valor);
  return { clave: clave, valor: valor };
}

/**
 * Guardia para las funciones que solo tienen sentido desde el portal.
 * Evita el error críptico cuando alguien las ejecuta desde el editor por equivocación.
 */
function desdePortal_(payload) {
  if (!payload || Object.keys(payload).length === 0) {
    fallar_('VALIDACION',
      'Esta función se ejecuta desde el portal, no desde el editor. ' +
      'Para las pruebas, selecciona runAllTests en la lista de funciones.');
  }
}
