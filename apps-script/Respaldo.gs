/**
 * Respaldo.gs — copias del libro y archivo de datos viejos (SPEC v1.2, sec. 13).
 */

const RESPALDOS_A_CONSERVAR = 8;

/** Copia el libro completo en /Portal/Backups y rota las copias viejas. */
function respaldarLibro(usuario) {
  const ss = hojaCalculo();
  const carpeta = subcarpeta_(carpetaRaiz_(), 'Backups');
  const marca = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd-HHmm');
  const nombre = 'CerroAzul-datos-' + marca;

  const copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
  copia.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  // Rotación: se conservan las más recientes.
  const todas = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('CerroAzul-datos-') === 0) todas.push(f);
  }
  todas.sort(function (a, b) { return a.getDateCreated() < b.getDateCreated() ? 1 : -1; });
  todas.slice(RESPALDOS_A_CONSERVAR).forEach(function (f) { f.setTrashed(true); });

  auditar(usuario || 'sistema', 'RESPALDO_CREADO', 'libro', ss.getId(), null,
    { nombre: nombre, conservados: Math.min(todas.length, RESPALDOS_A_CONSERVAR) });
  return { nombre: nombre, id: copia.getId(), url: copia.getUrl(), copias: Math.min(todas.length, RESPALDOS_A_CONSERVAR) };
}

/** Lista los respaldos disponibles y el más reciente. */
function listarRespaldos() {
  const carpeta = subcarpeta_(carpetaRaiz_(), 'Backups');
  const lista = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('CerroAzul-datos-') === 0) {
      lista.push({ nombre: f.getName(), fecha: Utilities.formatDate(f.getDateCreated(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") });
    }
  }
  lista.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  return { respaldos: lista, ultimo: lista.length ? lista[0].fecha : null };
}

/**
 * Archiva actividades cerradas de años anteriores: copia las filas a un libro aparte
 * y luego las limpia del libro principal en bloque (sin deleteRow, que es lentísimo).
 */
function archivarAnteriores(meses, usuario) {
  const limite = Math.max(1, Number(meses || 24));
  const corte = sumarDias(hoyIso(), -limite * 30);
  const candidatas = filtrar('actividades', function (a) {
    return ['APROBADA', 'CERRADA', 'CANCELADA'].indexOf(String(a.estado)) >= 0
      && fechaIso_(a.fecha_fin_plan) && fechaIso_(a.fecha_fin_plan) < corte;
  });
  if (!candidatas.length) return { archivadas: 0, corte: corte };

  const marca = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd-HHmm');
  const carpeta = subcarpeta_(carpetaRaiz_(), 'Backups');
  const libro = SpreadsheetApp.create('CerroAzul-Archivo-' + marca);
  DriveApp.getFileById(libro.getId()).moveTo(carpeta);

  const hojaArchivo = libro.getActiveSheet().setName('actividades');
  const cab = SCHEMA.actividades;
  hojaArchivo.getRange(1, 1, 1, cab.length).setValues([cab]);
  hojaArchivo.getRange(2, 1, candidatas.length, cab.length).setValues(
    candidatas.map(function (a) { return aFila('actividades', a); })
  );

  // Se limpian las filas movidas, de la más baja a la más alta no hace falta: se borra en bloque.
  const sh = hoja('actividades');
  candidatas.forEach(function (a) {
    sh.getRange(a._fila, 1, 1, cab.length).clearContent();
  });

  limpiarCache('actividades');
  auditar(usuario || 'sistema', 'ARCHIVO_EJECUTADO', 'actividades', libro.getId(), null,
    { archivadas: candidatas.length, corte: corte });
  return { archivadas: candidatas.length, corte: corte, libro: libro.getId(), url: libro.getUrl() };
}
