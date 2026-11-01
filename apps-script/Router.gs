/**
 * Router.gs — despacho de acciones del Web App (SPEC v1.2, sec. 2.2 y 9).
 *
 * Reglas de la casa:
 *  - El cuerpo del POST es { action, token, payload, requestId } y viaja como text/plain.
 *  - Toda respuesta es { ok:true, data } o { ok:false, code, message }.
 *  - La autorización se decide aquí y en Auth.gs; el frontend solo oculta botones.
 */

const ACCIONES = {
  ping: { fn: accionPing, publica: true },
  'setup.run': { fn: accionSetup, publica: true },
  'snapshot.regenerar': { fn: accionRegenerarSnapshot, sesion: true, roles: ['ADMIN'] },
  'snapshot.ver': { fn: accionVerSnapshot, publica: true },
  'public.snapshot': { fn: publicSnapshot, publica: true, crudo: true },
  'public.foto': { fn: publicFoto, publica: true, crudo: true },

  'auth.google': { fn: authGoogle, publica: true },
  'auth.enlace.solicitar': { fn: authEnlaceSolicitar, publica: true },
  'auth.enlace.canjear': { fn: authEnlaceCanjear, publica: true },
  'auth.me': { fn: authMe, sesion: true },
  'auth.salir': { fn: authSalir, sesion: true },

  'nodos.arbol': { fn: nodosArbol, sesion: true },
  'nodos.get': { fn: nodosGet, sesion: true },
  'nodos.crear': { fn: nodosCrear, sesion: true, roles: ['ADMIN'] },
  'nodos.editar': { fn: nodosEditar, sesion: true, roles: ['ADMIN'] },
  'nodos.mover': { fn: nodosMover, sesion: true, roles: ['ADMIN'] },

  'actividades.crear': { fn: actividadesCrear, sesion: true, roles: ['ADMIN'] },
  'actividades.listar': { fn: actividadesListar, sesion: true },
  'actividades.get': { fn: actividadesGet, sesion: true },
  'actividades.iniciar': { fn: actividadesIniciar, sesion: true },
  'actividades.editar': { fn: actividadesEditar, sesion: true, roles: ['ADMIN'] },
  'actividades.cancelar': { fn: actividadesCancelar, sesion: true, roles: ['ADMIN'] },

  'usuarios.listar': { fn: usuariosListar, sesion: true, roles: ['ADMIN'] },
  'usuarios.activar': { fn: usuariosActivar, sesion: true, roles: ['ADMIN'] },
  'usuarios.editar': { fn: usuariosEditar, sesion: true, roles: ['ADMIN'] },
  'usuarios.asignar': { fn: usuariosAsignar, sesion: true, roles: ['ADMIN'] },
  'usuarios.desactivar': { fn: usuariosDesactivar, sesion: true, roles: ['ADMIN'] },
  'novedades.listar': { fn: novedadesListar, sesion: true },
  'novedades.crear': { fn: novedadesCrear, sesion: true },
  'novedades.resolver': { fn: novedadesResolver, sesion: true, roles: ['ADMIN', 'SUPERVISOR'] },
  'tipos.listar': { fn: tiposListar, sesion: true },
  'plantillas.listar': { fn: plantillasListar, sesion: true },
  'empresas.listar': { fn: empresasListar, sesion: true, roles: ['ADMIN'] },
  'empresas.guardar': { fn: empresasGuardar, sesion: true, roles: ['ADMIN'] },
  'evidencias.upload': { fn: evidenciasUpload, sesion: true },
  'evidencias.get': { fn: evidenciasGet, sesion: true },
  'reportes.crear': { fn: reportesCrear, sesion: true },
  'reportes.revisar': { fn: reportesRevisar, sesion: true, roles: ['ADMIN'] },

  // Solo para cargar la demostración una vez; se cierra sola.
  'demo.crear': { fn: accionDemo, publica: true },
  'empresa.inicial': { fn: accionEmpresaInicial, publica: true },
  'empresa.datos': { fn: accionEmpresaDatos, publica: true },
  'usuario.inicial': { fn: accionUsuarioInicial, publica: true },
  'diag.asignacion': { fn: accionDiag, publica: true },
  'salud.recalcular': { fn: accionSaludRecalcular, publica: true },
  'snapshot.refrescar': { fn: accionSnapshotRefrescar, publica: true },
  'disparadores.instalar': { fn: accionInstalarDisparadores, publica: true },
  'hitos.guardar': { fn: hitosGuardar, sesion: true, roles: ['ADMIN'] },
  'kpi.panel': { fn: accionKpi, sesion: true, roles: ['ADMIN', 'SUPERVISOR'] },
  'config.guardar': { fn: configGuardar, sesion: true, roles: ['ADMIN'] },
  'ajustes.aplicar': { fn: accionAjustes, publica: true },
  'recurrencias.listar': { fn: recurrenciasListar, sesion: true },
  'recurrencias.guardar': { fn: recurrenciasGuardar, sesion: true, roles: ['ADMIN'] },
  'recurrencias.pausar': { fn: recurrenciasPausar, sesion: true, roles: ['ADMIN'] },
  'recurrencias.desde_tipo': { fn: recurrenciasDesdeTipo, sesion: true, roles: ['ADMIN'] },
  'recurrencias.generar': { fn: accionGenerar, sesion: true, roles: ['ADMIN'] },
  'alertas.listar': { fn: alertasListar, sesion: true, roles: ['ADMIN', 'SUPERVISOR'] },
  'alertas.guardar': { fn: alertasGuardar, sesion: true, roles: ['ADMIN'] },
  'alertas.publicar': { fn: alertasPublicar, sesion: true, roles: ['ADMIN'] },
  'alertas.actualizar': { fn: alertasActualizar, sesion: true, roles: ['ADMIN'] },
  'alertas.cerrar': { fn: alertasCerrar, sesion: true, roles: ['ADMIN'] },
};

// ---------------------------------------------------------------------------
// Entradas HTTP
// ---------------------------------------------------------------------------

function doGet(e) {
  const p = (e && e.parameter) || {};
  const accion = p.action || '';
  const def = ACCIONES[accion];
  if (!def) return responder(err('NO_ENCONTRADO', 'Acción no reconocida: ' + accion));
  if (!def.publica) return responder(err('NO_AUTENTICADO', 'Esta acción requiere sesión (POST).'));
  try {
    // Las acciones "crudas" ya devuelven su propio ContentService (JSON público).
    if (def.crudo) return def.fn(p);
    return responder(ok(def.fn({}, p)));
  } catch (ex) {
    return responder(aError_(ex));
  }
}

function doPost(e) {
  const t0 = Date.now();
  let cuerpo;
  try {
    cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (ex) {
    return responder(err('VALIDACION', 'El cuerpo no es JSON válido.'));
  }

  const accion = cuerpo.action;
  const def = ACCIONES[accion];
  if (!def) return responder(err('NO_ENCONTRADO', 'Acción no reconocida: ' + accion));

  // Idempotencia de escrituras: el mismo requestId devuelve la primera respuesta.
  const claveReq = cuerpo.requestId ? 'req:' + cuerpo.requestId : null;
  if (claveReq) {
    const previa = cacheGet(claveReq);
    if (previa) return responder(JSON.parse(previa));
  }

  try {
    let ctx = { usuario: null, rol: null };
    if (def.sesion) {
      const auth = autenticar_(cuerpo.token);
      if (!auth.ok) return responder(auth.respuesta);
      ctx = auth.ctx;
      if (def.roles && def.roles.indexOf(ctx.rol) < 0) {
        auditar(ctx.usuario.email, 'DENEGADO', accion, '', null, { rol: ctx.rol });
        return responder(err('PROHIBIDO', 'Tu rol (' + ctx.rol + ') no permite esta acción.'));
      }
    }
    const salida = def.fn(ctx, cuerpo.payload || {}, cuerpo.requestId || null);
    const respuesta = ok(salida);
    if (claveReq) cachePut(claveReq, JSON.stringify(respuesta), 600);
    return responder(respuesta);
  } catch (ex) {
    return responder(aError_(ex));
  } finally {
    const ms = Date.now() - t0;
    if (ms > 20000) console.warn('acción lenta: ' + accion + ' ' + ms + ' ms');
  }
}

/** Traduce una excepción a la forma { ok:false, code, message }. */
function aError_(ex) {
  const texto = String((ex && ex.message) || ex);
  const m = texto.match(/^([A-Z_]{4,})\s*:\s*(.*)$/);
  if (m) return err(m[1], m[2]);
  console.error('error no controlado: ' + texto + ' | ' + (ex && ex.stack));
  return err('ERROR_INTERNO', 'Ocurrió un error inesperado. Intenta de nuevo.');
}

/** Atajo para lanzar errores con código. */
function fallar_(codigo, mensaje) {
  throw new Error(codigo + ': ' + mensaje);
}

// ---------------------------------------------------------------------------
// Acciones básicas
// ---------------------------------------------------------------------------

function accionPing() {
  return { app: 'cerro-azul', en: ahoraIso(), setup: !!prop('SHEET_ID') };
}

function accionSetup(ctx, payload, requestId, parametros) {
  const clave = (payload && payload.key) || '';
  return arranqueProtegido(clave, setup);
}

function accionKpi(ctx, payload) {
  return kpisMes(payload && payload.mes ? String(payload.mes) : null);
}

function accionAjustes() {
  return aplicarAjustes();
}

function accionGenerar(ctx) {
  const r = generarActividadesPendientes(ctx.usuario.email);
  regenerarSnapshot();
  auditar(ctx.usuario.email, 'PLAN_GENERADO', 'actividades', '', null, { creadas: r.creadas });
  return r;
}

function accionInstalarDisparadores() {
  const veces = Number(prop('TRIGGERS_INSTALADOS') || 0);
  if (veces >= 2) fallar_('CONFLICTO', 'Los disparadores ya están instalados.');
  prop('TRIGGERS_INSTALADOS', veces + 1);
  try {
    return instalarDisparadores();
  } catch (e) {
    // Se devuelve el mensaje real para poder diagnosticar (permisos, cuota, etc.).
    fallar_('ERROR_INTERNO', String(e && e.message ? e.message : e));
  }
}

function accionSnapshotRefrescar() {
  const veces = Number(prop('SNAP_REFRESH') || 0);
  if (veces >= 5) fallar_('CONFLICTO', 'El refresco manual ya está cerrado.');
  prop('SNAP_REFRESH', veces + 1);
  cacheDel('snap');
  return regenerarSnapshot();
}

function accionSaludRecalcular() {
  if (prop('RECALC_HECHO') === 'si') fallar_('CONFLICTO', 'El recálculo inicial ya se ejecutó.');
  const r = recalcularTodo('sistema');
  prop('RECALC_HECHO', 'si');
  return r;
}

function accionDiag() {
  if (prop('DIAG_HECHO') === 'si') fallar_('CONFLICTO', 'El diagnóstico ya se ejecutó.');
  return diagnosticoAsignacion();
}

function accionUsuarioInicial() {
  if (prop('USUARIO_INICIAL') === 'si') fallar_('CONFLICTO', 'El usuario inicial ya fue creado.');
  return crearUsuarioInicial();
}

function accionEmpresaDatos() {
  if (prop('EMPRESA_DATOS') === 'si') fallar_('CONFLICTO', 'Los datos de la empresa ya fueron completados.');
  return completarEmpresaInicial();
}

function accionEmpresaInicial() {
  if (prop('EMPRESA_INICIAL') === 'si') fallar_('CONFLICTO', 'La empresa inicial ya fue creada.');
  return crearEmpresaInicial();
}

function accionDemo() {
  if (prop('DEMO_HECHO') === 'si') fallar_('CONFLICTO', 'La demostración ya fue creada.');
  return crearDemo();
}

function accionVerSnapshot() {
  return { bytes: snapshotPublico_().length, generado_en: JSON.parse(snapshotPublico_()).generado_en };
}

function accionRegenerarSnapshot(ctx) {
  return regenerarSnapshot();
}

// ---------------------------------------------------------------------------
// Lectura del árbol (contratista: solo sus subárboles asignados)
// ---------------------------------------------------------------------------

function nodosArbol(ctx, payload) {
  const raizId = payload.raiz_id || null;
  let lista = filas('nodos').filter(function (n) { return bool(n.activo); });

  if (ctx.rol === 'CONTRATISTA') {
    const asignados = nodosAsignados_(ctx.usuario.id);
    if (!asignados.length) return { nodos: [], aviso: 'Sin secciones asignadas' };
    const prefijos = asignados.map(function (n) { return n.ruta_ids + '/' + n.id; });
    lista = lista.filter(function (n) {
      const propia = n.ruta_ids + '/' + n.id;
      return prefijos.some(function (p) { return propia === p || propia.indexOf(p + '/') === 0; });
    });
  }

  if (raizId) {
    const raiz = buscarPorId('nodos', raizId);
    if (!raiz) fallar_('NO_ENCONTRADO', 'Nodo inexistente');
    const prefijo = raiz.ruta_ids + '/' + raiz.id;
    lista = lista.filter(function (n) {
      const propia = n.ruta_ids + '/' + n.id;
      return propia === prefijo || propia.indexOf(prefijo + '/') === 0;
    });
  }

  return {
    nodos: lista.map(function (n) {
      if (n.salud_puntaje !== '' && n.salud_puntaje !== null) n.salud_puntaje = Number(n.salud_puntaje);
      return n;
    }),
  };
}

function nodosGet(ctx, payload) {
  const id = exigirTexto(payload.id, 'id');
  const nodo = buscarPorId('nodos', id);
  if (!nodo) fallar_('NO_ENCONTRADO', 'Nodo inexistente');
  if (ctx.rol === 'CONTRATISTA') requireNodo_(ctx, nodo);

  const tipo = nodo.tipo_elemento_id ? buscarPorId('tipos_elemento', nodo.tipo_elemento_id) : null;
  const planes = filtrar('plan_tipo', function (p) {
    return String(p.tipo_elemento_id) === String(nodo.tipo_elemento_id) && bool(p.activo);
  });
  const actividades = filtrar('actividades', function (a) {
    return String(a.nodo_id) === String(nodo.id);
  }).slice(-20);
  const lecturas = filtrar('lecturas_estado', function (l) {
    return String(l.nodo_id) === String(nodo.id);
  }).slice(-10);
  const novedades = filtrar('novedades', function (n) {
    return String(n.nodo_id) === String(nodo.id) &&
      ['ABIERTA', 'EN_ATENCION'].indexOf(String(n.estado)) >= 0;
  });

  if (tipo && tipo.atributos_json) tipo.atributos_json = fromJson(tipo.atributos_json, []);
  if (tipo && tipo.condiciones_json) tipo.condiciones_json = fromJson(tipo.condiciones_json, []);

  return {
    nodo: nodo,
    tipo: tipo,
    planes: planes,
    actividades: actividades,
    lecturas: lecturas,
    novedades: novedades,
  };
}
