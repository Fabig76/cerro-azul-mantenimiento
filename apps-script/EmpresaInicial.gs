/**
 * EmpresaInicial.gs — crea una empresa contratista una sola vez, para arrancar la operación.
 * Se cierra sola: después de crear la empresa deja la marca EMPRESA_INICIAL.
 */

function crearEmpresaInicial() {
  if (prop('EMPRESA_INICIAL') === 'si') fallar_('CONFLICTO', 'La empresa inicial ya fue creada.');

  const existente = filtrar('empresas', function (e) {
    return String(e.razon_social || '').toLowerCase().indexOf('computadores') >= 0 && bool(e.activo);
  })[0];
  if (existente) {
    prop('EMPRESA_INICIAL', 'si');
    return { empresa: existente.id, razon_social: existente.razon_social, ya_existia: true };
  }

  const empresa = insertar('empresas', {
    id: newId('EMP'),
    razon_social: 'Computadores y Portátiles',
    nit: '',
    contacto: '',
    email: 'computadores.y.portatiles@gmail.com',
    telefono: '',
    contrato_numero: '',
    vigencia_desde: hoyIso(),
    vigencia_hasta: '',
    poliza_vence: '',
    estado: 'ACTIVA',
    aviso_vencimiento_en: '',
    activo: true,
  }, 'sistema');

  prop('EMPRESA_INICIAL', 'si');
  auditar('sistema', 'EMPRESA_CREADA', 'empresa', empresa.id, null, { razon_social: empresa.razon_social });
  return { empresa: empresa.id, razon_social: empresa.razon_social, ya_existia: false };
}

/**
 * Completa datos de la empresa inicial una sola vez (NIT y vigencia).
 * Se cierra sola con la marca EMPRESA_DATOS.
 */
function completarEmpresaInicial() {
  if (prop('EMPRESA_DATOS') === 'si') fallar_('CONFLICTO', 'Los datos de la empresa ya fueron completados.');

  const empresa = filtrar('empresas', function (e) {
    return String(e.razon_social || '').toLowerCase().indexOf('computadores') >= 0 && bool(e.activo);
  })[0];
  if (!empresa) fallar_('NO_ENCONTRADO', 'No existe la empresa Computadores y Portátiles.');

  const cambios = { nit: '94501666', vigencia_desde: hoyIso() };
  const despues = actualizar('empresas', empresa.id, cambios, 'sistema');
  prop('EMPRESA_DATOS', 'si');
  auditar('sistema', 'EMPRESA_EDITADA', 'empresa', empresa.id, { nit: empresa.nit }, cambios);
  return { empresa: empresa.id, razon_social: despues.razon_social, nit: despues.nit };
}
