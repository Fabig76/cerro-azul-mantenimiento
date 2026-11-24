/**
 * Db.gs — repositorio sobre Google Sheets (SPEC v1.2, sec. 4 y 13).
 * Acceso por nombre de columna, caché por petición, escritura con LockService.
 */

const PROPS = PropertiesService.getScriptProperties();

/**
 * MEDIDOR · Cuenta lo que cuesta cada petición: lecturas de hoja, escrituras y celdas.
 * Se reinicia al empezar cada acción y se anota al terminar (Router.doPost).
 */
const MEDIDOR = { lecturas: 0, escrituras: 0, celdas: 0, llamadas: 0, cacheHits: 0, cacheMiss: 0 };
function medir(tipo, celdas) {
  if (tipo === 'lectura') MEDIDOR.lecturas++;
  if (tipo === 'escritura') MEDIDOR.escrituras++;
  if (celdas) MEDIDOR.celdas += celdas;
}
function medirReiniciar() {
  MEDIDOR.lecturas = 0; MEDIDOR.escrituras = 0; MEDIDOR.celdas = 0; MEDIDOR.llamadas = 0;
  MEDIDOR.cacheHits = 0; MEDIDOR.cacheMiss = 0;
}
function medirResumen() {
  return {
    lecturas: MEDIDOR.lecturas, escrituras: MEDIDOR.escrituras, celdas: MEDIDOR.celdas,
    cache_hits: MEDIDOR.cacheHits, cache_miss: MEDIDOR.cacheMiss,
  };
}

function prop(clave, valor) {
  if (valor === undefined) return PROPS.getProperty(clave);
  PROPS.setProperty(clave, String(valor));
  return valor;
}

function hojaCalculo() {
  const id = prop('SHEET_ID');
  if (!id) throw new Error('SIN_CONFIGURAR: falta SHEET_ID. Ejecute setup() una vez.');
  if (!hojaCalculo._ss) hojaCalculo._ss = SpreadsheetApp.openById(id);
  return hojaCalculo._ss;
}

function hoja(nombre) {
  const sh = hojaCalculo().getSheetByName(nombre);
  if (!sh) throw new Error('SIN_CONFIGURAR: falta la hoja ' + nombre);
  return sh;
}

/** Mapa nombre de columna -> índice 0-based, memoizado por hoja y por ejecución. */
function cabeceras(nombre) {
  if (!cabeceras._c) cabeceras._c = {};
  if (cabeceras._c[nombre]) return cabeceras._c[nombre];
  const ultima = hoja(nombre).getLastColumn();
  const fila = hoja(nombre).getRange(1, 1, 1, Math.max(ultima, SCHEMA[nombre].length)).getValues()[0];
  const mapa = {};
  fila.forEach(function (h, i) {
    const clave = String(h || '').trim();
    if (clave) mapa[clave] = i;
  });
  cabeceras._c[nombre] = mapa;
  return mapa;
}

function campo(nombre, col) {
  const i = cabeceras(nombre)[col];
  if (i === undefined) throw new Error('MODELO: la hoja ' + nombre + ' no tiene la columna ' + col);
  return i;
}

/**
 * Hojas pequeñas y de lectura constante: se guardan en caché entre peticiones.
 * La clave lleva `datos:version`, que cambia con cada escritura, así que nunca se
 * sirve una copia vieja después de un cambio.
 */
const HOJAS_CACHEADAS = ['config', 'usuarios', 'empresas', 'nodos', 'tipos_elemento',
  'plantillas', 'plantilla_items', 'plan_tipo', 'recurrencias'];

/** Lee del CacheService, juntando los trozos en que se partió. */
function leerCacheGrande(clave) {
  const trozos = Number(cacheGet(clave + ':n') || 0);
  if (!trozos) return null;
  let texto = '';
  for (let i = 0; i < trozos; i++) {
    const parte = cacheGet(clave + ':' + i);
    if (parte === null || parte === undefined) return null;
    texto += parte;
  }
  try { return JSON.parse(texto); } catch (e) { return null; }
}

/** Guarda en trozos de menos de 90 KB (límite por clave del CacheService). */
function guardarCacheGrande(clave, valor, segundos) {
  try {
    const texto = JSON.stringify(valor);
    const tam = 90000;
    let n = 0;
    for (let i = 0; i < texto.length; i += tam) {
      cachePut(clave + ':' + n, texto.slice(i, i + tam), segundos);
      n++;
    }
    cachePut(clave + ':n', String(n), segundos);
  } catch (e) { /* si no cabe, se sigue leyendo la hoja */ }
}

/** Todas las filas como objetos; se omiten las filas vacías. */
function filas(nombre) {
  if (!filas._c) filas._c = {};
  if (filas._c[nombre]) return filas._c[nombre];

  // Caché entre peticiones de las hojas pequeñas. La clave lleva la versión de los
  // datos, que se renueva con cada escritura sobre estas hojas.
  if (HOJAS_CACHEADAS.indexOf(nombre) >= 0) {
    const version = cacheGet('datos:version') || '0';
    const delCache = leerCacheGrande('filas:' + nombre + ':' + version);
    if (delCache) {
      MEDIDOR.cacheHits++;
      filas._c[nombre] = delCache;
      return delCache;
    }
    MEDIDOR.cacheMiss++;
  }
  const sh = hoja(nombre);
  const ultima = sh.getLastRow();
  if (ultima < 2) {
    filas._c[nombre] = [];
    return filas._c[nombre];
  }
  const ancho = Math.max(sh.getLastColumn(), SCHEMA[nombre].length);
  const valores = sh.getRange(1, 1, ultima, ancho).getValues();
  medir('lectura', ultima * ancho);
  const cab = valores[0].map(function (h) { return String(h || '').trim(); });
  const salida = [];
  for (let r = 1; r < valores.length; r++) {
    const fila = valores[r];
    if (fila.join('').trim() === '') continue;
    const obj = { _fila: r + 1 };
    for (let c = 0; c < cab.length; c++) {
      if (cab[c]) obj[cab[c]] = normalizarCelda_(fila[c]);
    }
    salida.push(obj);
  }
  filas._c[nombre] = salida;
  if (HOJAS_CACHEADAS.indexOf(nombre) >= 0) {
    guardarCacheGrande('filas:' + nombre + ':' + (cacheGet('datos:version') || '0'), salida, 7200);
  }
  return salida;
}

/** Marca que los datos cambiaron: invalida las cachés entre peticiones. */
function marcarCambio(nombre) {
  if (nombre && HOJAS_CACHEADAS.indexOf(nombre) < 0) return;
  // El contador evita que dos escrituras en el mismo milisegundo compartan versión y la
  // segunda lectura reciba la copia anterior.
  marcarCambio._n = (marcarCambio._n || 0) + 1;
  try { cachePut('datos:version', Date.now() + '-' + marcarCambio._n, 7200); } catch (e) { /* sin caché se sigue */ }
}

/** Invalida la caché de una hoja (o de todas) dentro de la misma ejecución. */
function limpiarCache(nombre) {
  if (!filas._c) filas._c = {};
  if (nombre) delete filas._c[nombre];
  else filas._c = {};
  cabeceras._c = {};
}

/**
 * Devuelve siempre texto ISO para las fechas. Sheets convierte por su cuenta los textos
 * "AAAA-MM-DD" en objetos Date, y comparar String(fecha) contra un ISO falla en silencio.
 */
function normalizarCelda_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    const horas = valor.getHours() + valor.getMinutes() + valor.getSeconds();
    return Utilities.formatDate(valor, TZ, horas === 0 ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return valor;
}

/** Convierte a ISO corta cualquier fecha que venga de la hoja. */
function fechaIso_(valor) {
  if (!valor) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  }
  return String(valor).slice(0, 10);
}

function buscarPorId(nombre, id) {
  const lista = filas(nombre);
  for (let i = 0; i < lista.length; i++) {
    if (String(lista[i].id) === String(id)) return lista[i];
  }
  return null;
}

function filtrar(nombre, predicado) {
  return filas(nombre).filter(predicado);
}

/** Convierte un objeto de dominio al arreglo de celdas según el encabezado. */
function aFila(nombre, obj) {
  const cab = cabeceras(nombre);
  const anchos = Object.keys(cab).length;
  const arr = new Array(anchos).fill('');
  Object.keys(obj).forEach(function (k) {
    const i = cab[k];
    if (i === undefined) return;
    const v = obj[k];
    arr[i] = v === null || v === undefined ? '' : v;
  });
  return arr;
}

/** Inserta un objeto; completa creado_en/creado_por si faltan. */
function insertar(nombre, obj, usuario) {
  const sh = hoja(nombre);
  const ahora = ahoraIso();
  const datos = Object.assign({}, obj);
  if (!datos.id) datos.id = newId(prefijoDe(nombre));
  if (cabeceras(nombre).creado_en !== undefined && !datos.creado_en) datos.creado_en = ahora;
  if (cabeceras(nombre).creado_por !== undefined && !datos.creado_por) datos.creado_por = usuario || '';
  if (cabeceras(nombre).actualizado_en !== undefined) datos.actualizado_en = ahora;
  if (cabeceras(nombre).actualizado_por !== undefined) datos.actualizado_por = usuario || '';
  if (cabeceras(nombre).activo !== undefined && datos.activo === undefined) datos.activo = true;
  sh.appendRow(aFila(nombre, datos));
  anotarFilaDePrueba_(nombre, datos.id);
  medir('escritura', 1);
  marcarCambio(nombre);
  limpiarCache(nombre);
  return datos;
}

/**
 * RN-75 · Registro de las filas que inserta la batería de pruebas.
 *
 * Mientras FILAS_DE_PRUEBA no es null, cada inserción de ESTA ejecución anota el id de
 * su fila. Las variables globales de Apps Script viven solo durante una ejecución, así
 * que aquí nunca entra una fila creada por otra persona o por un disparador mientras
 * corre la batería. La limpieza borra exactamente estos ids y nada más.
 */
var FILAS_DE_PRUEBA = null;

function anotarFilaDePrueba_(nombre, id) {
  if (!FILAS_DE_PRUEBA || !id) return;
  (FILAS_DE_PRUEBA[nombre] = FILAS_DE_PRUEBA[nombre] || {})[String(id)] = true;
}

/** Inserta muchas filas de una vez (setValues), evitando appendRow en bucle. */
function insertarVarias(nombre, objetos, usuario) {
  if (!objetos.length) return [];
  const sh = hoja(nombre);
  const ahora = ahoraIso();
  const cab = cabeceras(nombre);
  const salida = objetos.map(function (o) {
    const d = Object.assign({}, o);
    if (!d.id) d.id = newId(prefijoDe(nombre));
    if (cab.creado_en !== undefined && !d.creado_en) d.creado_en = ahora;
    if (cab.creado_por !== undefined && !d.creado_por) d.creado_por = usuario || '';
    if (cab.actualizado_en !== undefined) d.actualizado_en = ahora;
    if (cab.actualizado_por !== undefined) d.actualizado_por = usuario || '';
    if (cab.activo !== undefined && d.activo === undefined) d.activo = true;
    anotarFilaDePrueba_(nombre, d.id);
    return aFila(nombre, d);
  });
  sh.getRange(sh.getLastRow() + 1, 1, salida.length, salida[0].length).setValues(salida);
  medir('escritura', salida.length * salida[0].length);
  marcarCambio(nombre);
  limpiarCache(nombre);
  return objetos;
}

/** Actualiza celdas de una fila por nombre de columna. */
function actualizar(nombre, id, cambios, usuario) {
  const fila = buscarPorId(nombre, id);
  if (!fila) throw new Error('NO_ENCONTRADO: ' + nombre + ' ' + id);
  const cab = cabeceras(nombre);
  const sh = hoja(nombre);
  const parche = Object.assign({}, cambios);
  if (cab.actualizado_en !== undefined) parche.actualizado_en = ahoraIso();
  if (cab.actualizado_por !== undefined) parche.actualizado_por = usuario || '';

  Object.keys(parche).forEach(function (k) {
    if (cab[k] === undefined) throw new Error('MODELO: ' + nombre + ' no tiene columna ' + k);
  });

  // Se lee la fila una vez, se aplica el parche en memoria y se escribe con UN setValues.
  const ancho = Math.max(sh.getLastColumn(), SCHEMA[nombre].length);
  const rango = sh.getRange(fila._fila, 1, 1, ancho);
  const valores = rango.getValues()[0];
  Object.keys(parche).forEach(function (k) { valores[cab[k]] = parche[k]; });
  rango.setValues([valores]);
  medir('lectura', ancho);
  medir('escritura', ancho);
  marcarCambio(nombre);

  // Se actualiza la copia en memoria en vez de tirar la caché: la siguiente búsqueda
  // no tiene que releer la hoja completa.
  Object.assign(fila, parche);
  return Object.assign({}, fila, parche);
}

/** Ejecuta fn con el bloqueo del proyecto; nunca lo retiene durante llamadas externas (RN-16). */
function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('OCUPADO: no se obtuvo el bloqueo en 20 s');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function prefijoDe(nombre) {
  const mapa = {
    nodos: 'NOD', tipos_elemento: 'TIP', plan_tipo: 'PLT', plantillas: 'PLA', plantilla_items: 'ITM',
    propuestas: 'PRO',
    usuarios: 'USU', empresas: 'EMP', asignaciones: 'ASI', recurrencias: 'REC', actividades: 'ACT',
    hitos: 'HIT', reportes: 'REP', respuestas: 'RES', evidencias: 'EVI', lecturas_estado: 'LEC',
    novedades: 'NOV', alertas: 'ALE', auditoria: 'AUD', sesiones: 'SES', notificaciones: 'NOT',
  };
  return mapa[nombre] || 'GEN';
}

/** Escribe una fila de auditoría (solo adición). */
function auditar(usuario, accion, entidad, entidadId, antes, despues) {
  try {
    insertar('auditoria', {
      id: newId('AUD'),
      fecha: ahoraIso(),
      usuario_email: usuario || 'sistema',
      accion: accion,
      entidad: entidad,
      entidad_id: entidadId || '',
      antes_json: antes ? toJson(antes) : '',
      despues_json: despues ? toJson(despues) : '',
      ip_hint: '',
    });
  } catch (e) {
    // La auditoría nunca debe tumbar la operación principal.
    console.error('auditoria: ' + e.message);
  }
}

/**
 * Escribe una clave de configuración. La hoja `config` no tiene `id`, así que no se usa
 * `actualizar` (que busca por id): se localiza la fila y se escribe la celda.
 */
function configEscribir(clave, valor, descripcion) {
  const cab = cabeceras('config');
  if (cab.clave === undefined || cab.valor === undefined) throw new Error('MODELO: hoja config inválida');
  const sh = hoja('config');
  const fila = filtrar('config', function (c) { return String(c.clave) === String(clave); })[0];
  if (fila) {
    sh.getRange(fila._fila, cab.valor + 1).setValue(valor);
    if (descripcion && cab.descripcion !== undefined) {
      sh.getRange(fila._fila, cab.descripcion + 1).setValue(descripcion);
    }
  } else {
    const nueva = {};
    nueva.clave = clave;
    nueva.valor = valor;
    if (cab.descripcion !== undefined) nueva.descripcion = descripcion || '';
    sh.appendRow(aFila('config', nueva));
  }
  limpiarCache('config');
  return valor;
}

function config(clave) {
  const lista = filas('config');
  for (let i = 0; i < lista.length; i++) {
    if (String(lista[i].clave) === String(clave)) return lista[i].valor;
  }
  return null;
}

function configNumero(clave, porDefecto) {
  const v = config(clave);
  // Un valor vacío no es cero: es ausencia de configuración.
  if (v === null || v === undefined || String(v).trim() === '') return porDefecto;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? porDefecto : n;
}
