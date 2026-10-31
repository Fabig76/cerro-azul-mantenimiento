/**
 * Diag.gs — diagnóstico de una sola ejecución: revisa el usuario inicial y sus asignaciones.
 * Se cierra solo con la marca DIAG_HECHO. Sirve para depurar y se puede borrar después.
 */
function diagnosticoAsignacion() {
  if (prop('DIAG_HECHO') === 'si') fallar_('CONFLICTO', 'El diagnóstico ya se ejecutó.');

  const email = 'computadores.y.portatiles@gmail.com';
  const hoy = hoyIso();
  const usuarios = filtrar('usuarios', function (u) {
    return String(u.email || '').toLowerCase() === email;
  });
  const asignaciones = filas('asignaciones');
  const salida = {
    hoy: hoy,
    usuarios: usuarios.map(function (u) {
      return { id: u.id, estado: u.estado, rol: u.rol, empresa: u.empresa_id };
    }),
    asignaciones_totales: asignaciones.length,
    detalle: asignaciones.map(function (a) {
      const n = buscarPorId('nodos', a.nodo_id);
      return {
        usuario: a.usuario_id,
        nodo: a.nodo_id,
        codigo: n ? n.codigo : 'NO EXISTE',
        desde: String(a.desde),
        desde_iso: fechaIso_(a.desde),
        hasta: String(a.hasta),
        activo: a.activo,
        pasa_filtro: (!a.desde || fechaIso_(a.desde) <= hoy) && (!a.hasta || fechaIso_(a.hasta) >= hoy) && bool(a.activo),
      };
    }),
  };
  prop('DIAG_HECHO', 'si');
  return salida;
}
