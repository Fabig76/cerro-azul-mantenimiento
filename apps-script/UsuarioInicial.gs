/**
 * UsuarioInicial.gs — deja creado y activo al contratista de la empresa inicial
 * con su sección asignada. Se cierra sola con la marca USUARIO_INICIAL.
 */

function crearUsuarioInicial() {
  if (prop('USUARIO_INICIAL') === 'si') fallar_('CONFLICTO', 'El usuario inicial ya fue creado.');

  const email = 'computadores.y.portatiles@gmail.com';
  const empresa = filtrar('empresas', function (e) {
    return String(e.razon_social || '').toLowerCase().indexOf('computadores') >= 0 && bool(e.activo);
  })[0];
  if (!empresa) fallar_('SIN_CONFIGURAR', 'Primero debe existir la empresa Computadores y Portátiles.');

  const nodo = filtrar('nodos', function (n) { return n.codigo === 'CA-AC-CAM'; })[0];
  if (!nodo) fallar_('SIN_CONFIGURAR', 'No existe la sección CA-AC-CAM.');

  let usuario = filtrar('usuarios', function (u) {
    return String(u.email || '').toLowerCase() === email;
  })[0];

  if (usuario) {
    usuario = actualizar('usuarios', usuario.id, {
      nombre: 'Computadores y Portátiles',
      rol: 'CONTRATISTA',
      estado: 'ACTIVO',
      empresa_id: empresa.id,
      inactivo_desde: '',
    }, 'sistema');
  } else {
    usuario = insertar('usuarios', {
      id: newId('USU'),
      email: email,
      nombre: 'Computadores y Portátiles',
      telefono: '',
      rol: 'CONTRATISTA',
      empresa_id: empresa.id,
      estado: 'ACTIVO',
      acepto_datos_en: '',
      acepto_datos_version: '',
      ultimo_acceso: '',
      inactivo_desde: '',
      suprimido_en: '',
      activo: true,
    }, 'sistema');
  }

  const yaAsignado = filtrar('asignaciones', function (a) {
    return String(a.usuario_id) === String(usuario.id) && String(a.nodo_id) === String(nodo.id) && bool(a.activo);
  })[0];
  if (!yaAsignado) {
    insertar('asignaciones', {
      id: newId('ASI'),
      usuario_id: usuario.id,
      nodo_id: nodo.id,
      desde: hoyIso(),
      hasta: '',
      activo: true,
    }, 'sistema');
  }

  prop('USUARIO_INICIAL', 'si');
  auditar('sistema', 'USUARIO_ACTIVADO', 'usuario', usuario.id, null,
    { email: email, empresa: empresa.razon_social, nodo: nodo.codigo });

  return {
    usuario: usuario.id,
    email: email,
    estado: usuario.estado,
    rol: usuario.rol,
    empresa: empresa.razon_social,
    seccion: nodo.codigo + ' · ' + nodo.nombre,
  };
}
