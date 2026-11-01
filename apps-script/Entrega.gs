/**
 * Entrega.gs — paquete de información para cuando cambie el administrador.
 * El software se queda con quien lo construyó; la información del conjunto se entrega.
 */

function exportarEntrega(usuario) {
  const ss = hojaCalculo();
  const carpeta = subcarpeta_(subcarpeta_(carpetaRaiz_(), 'Documentos'), 'Entregas');
  const marca = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nombre = 'CerroAzul-entrega-' + marca;

  // Copia completa del libro: todos los datos, en un archivo que se abre sin el portal.
  const copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
  copia.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  // Índice de lo entregado
  const conteo = {};
  ['nodos', 'actividades', 'reportes', 'evidencias', 'novedades', 'alertas', 'usuarios', 'empresas']
    .forEach(function (h) { conteo[h] = filas(h).length; });

  const carpetaEvidencias = subcarpeta_(carpetaRaiz_(), CARPETA_EVIDENCIAS);
  const carpetaActas = subcarpeta_(carpetaRaiz_(), 'Documentos');

  auditar(usuario || 'sistema', 'ENTREGA_EXPORTADA', 'libro', copia.getId(), null, conteo);

  return {
    archivo: copia.getName(),
    url_libro: copia.getUrl(),
    url_evidencias: carpetaEvidencias.getUrl(),
    url_actas: carpetaActas.getUrl(),
    conteo: conteo,
    fecha: ahoraIso(),
  };
}
