/**
 * Setup.gs — crea el libro, las carpetas, las pestañas y la semilla. Idempotente.
 * SPEC v1.2, sec. 2.6 y T0.2.
 */

const CARPETAS = ['Datos', 'Evidencias', 'Publicas', 'Documentos', 'Backups'];

/**
 * Prepara todo lo necesario para operar el portal. Se puede ejecutar varias veces.
 * @return {object} resumen con el id del libro y las carpetas.
 */
function setup() {
  const inicio = Date.now();
  const resultado = { libro_id: '', carpeta_raiz_id: '', pestañas: [], semilla: {}, creado: false };

  // 1. Libro
  const idActual = prop('SHEET_ID');
  let ss = null;
  if (idActual) {
    try {
      ss = SpreadsheetApp.openById(idActual);
    } catch (e) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Cerro Azul — Portal de Mantenimientos');
    prop('SHEET_ID', ss.getId());
    resultado.creado = true;
  }
  ss.setSpreadsheetTimeZone(TZ);
  resultado.libro_id = ss.getId();

  // 2. Pestañas y encabezados
  resultado.pestañas = asegurarPestañas(ss);
  prop('esquema_version', String(ESQUEMA_VERSION));

  // 3. Carpetas
  resultado.carpeta_raiz_id = asegurarCarpetas();

  // 4. Semilla (solo si está vacía cada tabla)
  limpiarCache();
  resultado.semilla = sembrarSiHaceFalta();

  prop('SETUP_EN', ahoraIso());
  resultado.ms = Date.now() - inicio;
  console.log('setup() terminado: ' + JSON.stringify(resultado));
  return resultado;
}

/** Crea las pestañas que falten y agrega las columnas nuevas al final de las existentes. */
function asegurarPestañas(ss) {
  const nombres = Object.keys(SCHEMA);
  const hechas = [];
  nombres.forEach(function (nombre) {
    const columnas = SCHEMA[nombre];
    let sh = ss.getSheetByName(nombre);
    if (!sh) {
      sh = ss.insertSheet(nombre);
      sh.getRange(1, 1, 1, columnas.length).setValues([columnas]);
      formatearHoja(sh, columnas);
      hechas.push(nombre + ' (nueva)');
      return;
    }
    // Agregar columnas que falten al final.
    const ultima = sh.getLastColumn();
    const actuales = ultima > 0 ? sh.getRange(1, 1, 1, ultima).getValues()[0].map(function (h) {
      return String(h || '').trim();
    }) : [];
    const faltantes = columnas.filter(function (c) { return actuales.indexOf(c) < 0; });
    if (faltantes.length) {
      sh.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]);
      hechas.push(nombre + ' (+' + faltantes.length + ' columnas)');
    }
    if (ultima > 0) formatearHoja(sh, actuales.concat(faltantes));
  });

  // Quitar la pestaña por defecto si quedó vacía.
  const sobrante = ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja 1');
  if (sobrante && ss.getSheets().length > nombres.length) {
    if (sobrante.getLastRow() <= 1) ss.deleteSheet(sobrante);
  }
  return hechas;
}

function formatearHoja(sh, columnas) {
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, columnas.length)
    .setFontWeight('bold').setBackground('#E8EEF5').setVerticalAlignment('middle');
  for (let i = 0; i < columnas.length; i++) {
    sh.setColumnWidth(i + 1, anchosPara(columnas[i]));
  }
}

/** Crea /Portal y sus subcarpetas si no existen. Devuelve el id de la raíz. */
function asegurarCarpetas() {
  let raizId = prop('ROOT_FOLDER_ID');
  let raiz = null;
  if (raizId) {
    try {
      raiz = DriveApp.getFolderById(raizId);
    } catch (e) {
      raiz = null;
    }
  }
  if (!raiz) {
    const encontradas = DriveApp.getFoldersByName('Portal');
    raiz = encontradas.hasNext() ? encontradas.next() : DriveApp.createFolder('Portal');
    prop('ROOT_FOLDER_ID', raiz.getId());
  }
  CARPETAS.forEach(function (nombre) {
    const hijas = raiz.getFoldersByName(nombre);
    if (!hijas.hasNext()) raiz.createFolder(nombre);
  });
  return raiz.getId();
}

/** Siembra árbol, tipos, plantillas, plan y config solo si están vacíos. */
function sembrarSiHaceFalta() {
  const resumen = {};

  if (filas('config').length === 0) {
    insertarVarias('config', semillaConfig(), 'setup');
    resumen.config = semillaConfig().length;
  }

  if (filas('tipos_elemento').length === 0) {
    const tipos = semillaTipos();
    insertarVarias('tipos_elemento', tipos, 'setup');
    resumen.tipos = tipos.length;
  }

  if (filas('nodos').length === 0) {
    const nodos = semillaArbol();
    insertarVarias('nodos', nodos, 'setup');
    resumen.nodos = nodos.length;
  }

  if (filas('plantillas').length === 0) {
    const tipos = filas('tipos_elemento');
    const t = semillaPlantillas(tipos, filas('nodos'));
    insertarVarias('plantillas', t.plantillas, 'setup');
    insertarVarias('plantilla_items', t.items, 'setup');
    insertarVarias('plan_tipo', semillaPlanTipo(t.plantillas, tipos), 'setup');
    resumen.plantillas = t.plantillas.length;
    resumen.items = t.items.length;
  }

  return resumen;
}

/** Diagnóstico rápido: qué hay creado y cuántas filas por hoja. */
function estado() {
  const salida = { libro_id: prop('SHEET_ID'), carpeta_raiz_id: prop('ROOT_FOLDER_ID'), hojas: {} };
  if (!prop('SHEET_ID')) {
    salida.aviso = 'Sin SHEET_ID: ejecute setup()';
    return salida;
  }
  const ss = hojaCalculo();
  salida.nombre = ss.getName();
  salida.url = ss.getUrl();
  Object.keys(SCHEMA).forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    salida.hojas[nombre] = sh ? Math.max(sh.getLastRow() - 1, 0) : -1;
  });
  return salida;
}

/** Árbol en texto, para comprobar la semilla. */
function arbolTexto() {
  const nodos = filas('nodos').filter(function (n) { return bool(n.activo); });
  const porPadre = {};
  nodos.forEach(function (n) {
    const p = n.parent_id || 'RAIZ';
    if (!porPadre[p]) porPadre[p] = [];
    porPadre[p].push(n);
  });
  const lineas = [];
  function bajar(padre, nivel) {
    (porPadre[padre] || []).sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
      .forEach(function (n) {
        lineas.push(new Array(nivel + 1).join('   ') + n.codigo + '  ' + n.nombre +
          (bool(n.sensible) ? '  [sensible]' : ''));
        bajar(n.id, nivel + 1);
      });
  }
  bajar('RAIZ', 0);
  return lineas.join('\n');
}

/**
 * Crea las pestañas y columnas nuevas del esquema, una sola vez por versión.
 * Se llama al inicio de las acciones que dependen de ellas.
 */
function asegurarEsquema_() {
  const actual = Number(prop('esquema_version') || 0);
  if (actual >= ESQUEMA_VERSION) return false;
  asegurarPestañas(hojaCalculo());
  prop('esquema_version', String(ESQUEMA_VERSION));
  return true;
}
