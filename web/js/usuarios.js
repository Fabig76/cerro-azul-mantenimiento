/**
 * usuarios.js — pantalla del administrador para activar usuarios y asignar secciones.
 */
(function () {
  'use strict';

  let usuarios = [];
  let empresas = [];
  let nodos = [];
  let seleccion = {};

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoUsuarios');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  const ROL = { ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', CONTRATISTA: 'Contratista' };
  const ESTADO = { PENDIENTE: 'warn', ACTIVO: 'ok', INACTIVO: 'gray' };

  async function cargar() {
    const t = Sesion.token();
    const [rU, rE, rN] = await Promise.all([
      Datos.obtener('usuarios.listar', t),
      Datos.obtener('empresas.listar', t),
      Datos.obtener('nodos.arbol', t),
    ]);
    if (rU.ok) usuarios = rU.data.usuarios || [];
    if (rE.ok) empresas = rE.data.empresas || [];
    if (rN.ok) nodos = rN.data.nodos || [];
    pintar();
  }

  // RN-73 · Selección múltiple y filtro de cuentas sin actividad.
  let soloSinActividad = false;
  const marcados = {};

  function sinActividad(u) {
    const h = u.historial;
    if (!h) return false;
    return (h.reportes + h.evidencias + h.propuestas + h.novedades + h.actividades) === 0;
  }

  function pintarBarra(cont) {
    if (window.__rol !== 'ADMIN') return;
    const esAdmin = window.__rol === 'ADMIN';
    if (!esAdmin) return;

    const barra = el('div', 'barra-usuarios');
    const ver = el('label', 'etiqueta-casilla');
    const casilla = el('input');
    casilla.type = 'checkbox';
    casilla.checked = soloSinActividad;
    casilla.addEventListener('change', function () {
      soloSinActividad = casilla.checked;
      pintar();
    });
    ver.appendChild(casilla);
    ver.appendChild(el('span', null, 'Solo los que no tienen actividad'));
    barra.appendChild(ver);

    const cuantos = Object.keys(marcados).length;
    if (cuantos) {
      const borrar = el('button', 'btn sm peligro', 'Eliminar seleccionados (' + cuantos + ')');
      borrar.type = 'button';
      borrar.addEventListener('click', function () { eliminarVarios(borrar); });
      barra.appendChild(borrar);
    }
    cont.appendChild(barra);
  }

  /** Elimina los marcados; el servidor dice cuáles no se pudieron y por qué. */
  async function eliminarVarios(boton) {
    const ids = Object.keys(marcados);
    if (!ids.length) return;
    const conHistorial = ids.some(function (id) {
      const u = usuarios.filter(function (x) { return String(x.id) === String(id); })[0];
      return u && !sinActividad(u);
    });
    const motivo = window.prompt(
      'Motivo (queda en la auditoría)' + (conHistorial ? ', mínimo 10 caracteres' : '') + ':', '');
    if (motivo === null) return;
    if (conHistorial && motivo.trim().length < 10) return aviso('Escribe el motivo (10 caracteres).', 'error');
    if (!window.confirm('¿Eliminar ' + ids.length + ' usuario(s)? Saldrán de la lista; su historial se conserva.')) return;

    boton.disabled = true;
    boton.textContent = 'Eliminando…';
    const r = await API.llamar('usuarios.eliminar',
      { ids: ids, motivo: motivo.trim(), reasignar_a: undefined },
      { token: Sesion.token(), idempotente: true });
    boton.disabled = false;
    if (!r.ok) return aviso(r.message || 'No se pudo eliminar.', 'error');
    Object.keys(marcados).forEach(function (k) { delete marcados[k]; });
    const omitidos = r.data.omitidos || [];
    aviso(r.data.eliminados.length + ' eliminado(s).' +
      (omitidos.length ? ' ' + omitidos.length + ' no se pudo: ' + omitidos[0].razon + '.' : ''), 'ok');
    await cargar();
  }

  function pintar() {
    const cont = document.getElementById('listaUsuarios');
    if (!cont) return;
    cont.textContent = '';
    pintarBarra(cont);

    const pendientes = usuarios.filter(function (u) { return u.estado === 'PENDIENTE'; });
    const contador = document.getElementById('conteoUsuarios');
    if (contador) {
      contador.textContent = pendientes.length
        ? pendientes.length + ' por activar · ' + usuarios.length + ' en total'
        : usuarios.length + ' usuarios';
    }

    if (!usuarios.length) {
      const vacio = el('div', 'vacio', 'Todavía no hay usuarios registrados. Cuando una empresa entre por primera vez, aparecerá aquí para que la actives.');
      cont.appendChild(vacio);
      return;
    }

    usuarios
      .filter(function (u) { return !soloSinActividad || sinActividad(u); })
      .slice()
      .sort(function (a, b) {
        const orden = { PENDIENTE: 0, ACTIVO: 1, INACTIVO: 2 };
        const pa = a.estado in orden ? orden[a.estado] : 9;
        const pb = b.estado in orden ? orden[b.estado] : 9;
        if (pa !== pb) return pa - pb;
        return String(a.nombre || a.email || '').localeCompare(String(b.nombre || b.email || ''), 'es');
      })
      .forEach(function (u) { cont.appendChild(fila(u)); });
  }

  function fila(u) {
    const caja = el('article', 'usuario');
    if (window.__rol === 'ADMIN') {
      const etiqueta = el('label', 'etiqueta-casilla marcar-usuario');
      const casilla = el('input');
      casilla.type = 'checkbox';
      casilla.checked = !!marcados[String(u.id)];
      casilla.addEventListener('change', function () {
        if (casilla.checked) marcados[String(u.id)] = true; else delete marcados[String(u.id)];
        pintar();
      });
      etiqueta.appendChild(casilla);
      etiqueta.appendChild(el('span', null, 'Marcar'));
      caja.appendChild(etiqueta);
    }
    const cab = el('div', 'usuario-cab');

    const quien = el('div');
    quien.appendChild(el('h3', null, u.nombre || u.email));
    const sub = el('p', 'usuario-correo', u.email);
    quien.appendChild(sub);

    // A qué empresa está vinculado: sin esto solo se ve el correo.
    const empresa = el('p', 'usuario-empresa');
    if (u.empresa) {
      empresa.textContent = 'Empresa: ' + u.empresa + (u.empresa_activa === false ? ' (inactiva)' : '');
      if (u.empresa_activa === false) empresa.className = 'usuario-empresa texto-danger';
    } else {
      empresa.textContent = u.rol === 'CONTRATISTA'
        ? 'Sin empresa vinculada — no podrá recibir trabajos'
        : 'Sin empresa (no hace falta para su rol)';
    }
    quien.appendChild(empresa);

    const marcas = el('div', 'usuario-marcas');
    const rol = el('span', 'badge gray', ROL[u.rol] || u.rol);
    const estado = el('span', 'badge ' + (ESTADO[u.estado] || 'gray'), u.estado);
    marcas.appendChild(rol);
    marcas.appendChild(estado);
    if (u.asignaciones && u.asignaciones.length) {
      marcas.appendChild(el('span', 'badge', u.asignaciones.length + ' sección(es)'));
    }
    quien.appendChild(marcas);

    const gestionar = el('button', 'btn', 'Gestionar');
    gestionar.type = 'button';
    gestionar.addEventListener('click', function () {
      const panel = document.getElementById('panelUsuario');
      panel.textContent = '';
      panel.appendChild(panelGestion(u));
      panel.classList.remove('oculto');
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    cab.appendChild(quien);
    cab.appendChild(gestionar);
    caja.appendChild(cab);
    return caja;
  }

  function panelGestion(u) {
    const caja = el('div', 'formulario-detalle');
    caja.appendChild(el('div', 'kicker', 'Gestionar a ' + (u.nombre || u.email)));

    const fila = el('div', 'fila-campos');

    const cRol = el('div', 'campo');
    const lRol = el('label', null, 'Rol');
    lRol.htmlFor = 'usrRol';
    const sRol = el('select', 'item-input');
    sRol.id = 'usrRol';
    ['CONTRATISTA', 'SUPERVISOR', 'ADMIN'].forEach(function (r) {
      const op = el('option', null, ROL[r]);
      op.value = r;
      if (r === u.rol) op.selected = true;
      sRol.appendChild(op);
    });
    cRol.appendChild(lRol);
    cRol.appendChild(sRol);
    fila.appendChild(cRol);

    const cEmp = el('div', 'campo');
    const lEmp = el('label', null, 'Empresa');
    lEmp.htmlFor = 'usrEmpresa';
    const sEmp = el('select', 'item-input');
    sEmp.id = 'usrEmpresa';
    const opVacia = el('option', null, 'Sin empresa');
    opVacia.value = '';
    sEmp.appendChild(opVacia);
    empresas.forEach(function (e) {
      const op = el('option', null, e.razon_social + (e.vencida ? ' (contrato vencido)' : ''));
      op.value = e.id;
      if (e.id === u.empresa_id) op.selected = true;
      sEmp.appendChild(op);
    });
    cEmp.appendChild(lEmp);
    cEmp.appendChild(sEmp);
    fila.appendChild(cEmp);
    caja.appendChild(fila);

    // Secciones
    caja.appendChild(el('div', 'kicker', 'Secciones asignadas'));
    caja.appendChild(el('p', 'bajada-tarjeta',
      'Dar una sección incluye todo lo que cuelga de ella. Al guardar se reemplazan las anteriores.'));
    const arbol = el('div', 'arbol-seleccion');
    nodos
      .slice()
      .sort(function (a, b) { return String(a.codigo).localeCompare(String(b.codigo)); })
      .forEach(function (n) {
        const fila = el('label', 'opcion-nodo');
        const chk = el('input');
        chk.type = 'checkbox';
        chk.value = n.id;
        chk.dataset.nodo = n.id;
        if ((u.asignaciones || []).some(function (a) { return a.nodo_id === n.id; })) chk.checked = true;
        const txt = el('span', null, n.codigo + ' · ' + n.nombre);
        fila.appendChild(chk);
        fila.appendChild(txt);
        arbol.appendChild(fila);
      });
    caja.appendChild(arbol);

    const acciones = el('div', 'acciones-form');

    const guardar = el('button', 'btn primary', 'Guardar y asignar');
    guardar.type = 'button';
    guardar.addEventListener('click', async function () {
      const t = Sesion.token();
      const nodoIds = Array.prototype.slice
        .call(caja.querySelectorAll('input[type="checkbox"]:checked'))
        .map(function (c) { return c.dataset.nodo; });

      // Punto 16 · Rol, empresa, estado y secciones en UNA petición (antes eran tres en
      // serie: unos 8 segundos de espera con el botón sin decir nada).
      guardar.disabled = true;
      const antesTexto = guardar.textContent;
      guardar.textContent = 'Guardando…';
      const r = await API.llamar('usuarios.guardar', {
        id: u.id, rol: sRol.value, empresa_id: sEmp.value, nodo_ids: nodoIds,
        estado: u.estado !== 'ACTIVO' ? 'ACTIVO' : undefined,
        reasignar: true,
      }, { token: t, idempotente: true });
      guardar.disabled = false;
      guardar.textContent = antesTexto;
      if (window.Datos) Datos.invalidar('usuarios.listar');
      if (!r.ok) return aviso(r.message || 'No se pudo guardar.', 'error');
      aviso('Usuario guardado con ' + nodoIds.length + ' sección(es).', 'ok');
      await cargar();
      document.getElementById('panelUsuario').classList.add('oculto');
    });

    const desactivar = el('button', 'btn peligro', 'Desactivar');
    desactivar.type = 'button';
    desactivar.disabled = u.estado !== 'ACTIVO';
    desactivar.addEventListener('click', async function () {
      const r = await API.llamar('usuarios.desactivar', { id: u.id }, { token: Sesion.token(), idempotente: true });
      if (window.Datos) Datos.invalidar('usuarios.listar');

      // U2 · Si tiene trabajo abierto, el servidor se niega: se pide a quién pasarlo.
      if (!r.ok && r.code === 'CONFLICTO') {
        if (caja.querySelector('.reasignar-caja')) return;
        const colegas = usuarios.filter(function (x) {
          return String(x.id) !== String(u.id) && x.estado === 'ACTIVO' &&
            String(x.empresa_id || '') === String(u.empresa_id || '');
        });
        const cajita = el('div', 'bloque reasignar-caja');
        cajita.appendChild(el('p', 'aviso-rechazo-fecha', r.message));
        if (!colegas.length) {
          cajita.appendChild(el('p', 'bajada-tarjeta',
            'No hay otra persona activa en la misma empresa. Active a alguien primero o cierre los trabajos.'));
          caja.appendChild(cajita);
          return;
        }
        const sel = el('select', 'item-input');
        colegas.forEach(function (x) {
          const op = el('option', null, x.nombre || x.email);
          op.value = x.id;
          sel.appendChild(op);
        });
        cajita.appendChild(campo('Pasar sus trabajos y planes a', sel));
        const ir = el('button', 'btn peligro', 'Reasignar y desactivar');
        ir.type = 'button';
        ir.addEventListener('click', async function () {
          ir.disabled = true;
          ir.textContent = 'Reasignando…';
          const r2 = await API.llamar('usuarios.desactivar',
            { id: u.id, reasignar_a: sel.value }, { token: Sesion.token(), idempotente: true });
          if (window.Datos) Datos.invalidar('usuarios.listar');
          ir.disabled = false;
          ir.textContent = 'Reasignar y desactivar';
          if (!r2.ok) return aviso(r2.message || 'No se pudo reasignar.', 'error');
          aviso('Usuario desactivado. Pasaron ' + (r2.data.reasignados.trabajos + r2.data.reasignados.planes) +
            ' trabajo(s) y plan(es).', 'ok');
          await cargar();
          document.getElementById('panelUsuario').classList.add('oculto');
        });
        cajita.appendChild(ir);
        caja.appendChild(cajita);
        return;
      }

      if (!r.ok) return aviso(r.message || 'No se pudo desactivar.', 'error');
      aviso('Usuario desactivado y sesiones revocadas.', 'ok');
      await cargar();
      document.getElementById('panelUsuario').classList.add('oculto');
    });

    // RN-70 a RN-73 · Eliminar: lo saca de la lista; su historial de trabajos se conserva.
    const eliminar = el('button', 'btn sm peligro', 'Eliminar');
    eliminar.type = 'button';
    eliminar.addEventListener('click', function () { eliminarUsuario(u, caja, eliminar); });
    const accionesPanel = caja.querySelector('.acciones-panel') || caja;
    accionesPanel.appendChild(eliminar);
    caja.appendChild(el('p', 'bajada-tarjeta',
      'Desactivar le quita el acceso y lo deja en la lista. Eliminar lo saca de la lista; ' +
      'su historial de trabajos se conserva.'));

    const cerrar = el('button', 'btn', 'Cerrar');
    cerrar.type = 'button';
    cerrar.addEventListener('click', function () {
      document.getElementById('panelUsuario').classList.add('oculto');
    });

    acciones.appendChild(guardar);
    acciones.appendChild(desactivar);
    acciones.appendChild(cerrar);
    caja.appendChild(acciones);
    return caja;
  }

  /**
   * RN-70 a RN-72 · Eliminar un usuario. Pide motivo si tiene historial y, si tiene
   * trabajo abierto, a quién se lo pasa.
   */
  async function eliminarUsuario(u, caja, boton) {
    const h = u.historial || null;
    const conHistorial = h ? (h.reportes + h.evidencias + h.propuestas + h.novedades + h.actividades) > 0 : true;

    const previo = caja.querySelector('.eliminar-usuario');
    if (previo) previo.remove();
    const cajaAviso = el('div', 'bloque eliminar-usuario');

    let sel = null;
    if (h && (h.abiertos || h.planes)) {
      const colegas = usuarios.filter(function (x) {
        return x.estado === 'ACTIVO' && String(x.id) !== String(u.id);
      });
      if (!colegas.length) {
        cajaAviso.appendChild(el('p', null,
          'Tiene ' + h.abiertos + ' trabajo(s) abierto(s) y ' + h.planes + ' plan(es), y no hay ' +
          'otra persona activa a quien pasarlos.'));
        caja.appendChild(cajaAviso);
        return;
      }
      cajaAviso.appendChild(el('p', null,
        'Tiene ' + h.abiertos + ' trabajo(s) abierto(s) y ' + h.planes + ' plan(es). Elija a quién pasarlos.'));
      sel = el('select', 'item-input');
      colegas.forEach(function (x) {
        const op = el('option', null, x.nombre || x.email);
        op.value = x.id;
        sel.appendChild(op);
      });
      cajaAviso.appendChild(sel);
    }

    let retirar = null;
    if (h && h.pendientes) {
      const etiqueta = el('label', 'etiqueta-casilla');
      retirar = el('input');
      retirar.type = 'checkbox';
      etiqueta.appendChild(retirar);
      etiqueta.appendChild(el('span', null, 'Retirar sus ' + h.pendientes + ' propuesta(s) pendiente(s)'));
      cajaAviso.appendChild(etiqueta);
    }

    if (conHistorial) {
      cajaAviso.appendChild(el('p', 'bajada-tarjeta',
        'Tiene historial: escriba el motivo (queda en la auditoría).'));
    }

    const motivo = el('input', 'item-input');
    motivo.type = 'text';
    motivo.placeholder = conHistorial ? 'Motivo (mínimo 10 caracteres)' : 'Motivo (opcional)';
    cajaAviso.appendChild(motivo);

    const confirmar = el('button', 'btn peligro', 'Confirmar eliminación');
    confirmar.type = 'button';
    confirmar.addEventListener('click', async function () {
      if (conHistorial && motivo.value.trim().length < 10) {
        return aviso('Escribe el motivo (al menos 10 caracteres).', 'error');
      }
      if (!window.confirm('¿Eliminar a ' + (u.nombre || u.email) + '? Saldrá de la lista; ' +
        'su historial de trabajos se conserva. No se puede deshacer.')) return;
      confirmar.disabled = true;
      const r = await API.llamar('usuarios.eliminar', {
        ids: [u.id],
        motivo: motivo.value.trim(),
        reasignar_a: sel ? sel.value : undefined,
        retirar_propuestas: retirar ? retirar.checked : undefined,
      }, { token: Sesion.token(), idempotente: true });
      confirmar.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudo eliminar.', 'error');
      const omitidos = r.data.omitidos || [];
      if (omitidos.length) return aviso('No se pudo: ' + omitidos[0].razon, 'error');
      aviso('Usuario eliminado.', 'ok');
      await cargar();
      document.getElementById('panelUsuario').classList.add('oculto');
    });
    cajaAviso.appendChild(confirmar);
    caja.appendChild(cajaAviso);
  }

  function prepararEmpresa() {
    const form = document.getElementById('formEmpresa');
    if (!form) return;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const r = await API.llamar('empresas.guardar', {
        razon_social: document.getElementById('empRazon').value.trim(),
        nit: document.getElementById('empNit').value.trim(),
        vigencia_hasta: document.getElementById('empVigencia').value,
      }, { token: Sesion.token(), idempotente: true });
      if (window.Datos) Datos.invalidar('empresas.listar');
      if (!r.ok) return aviso(r.message || 'No se pudo crear la empresa.', 'error');
      aviso('Empresa creada. Ya puede asignarla a un contratista.', 'ok');
      document.getElementById('empRazon').value = '';
      document.getElementById('empNit').value = '';
      await cargar();
    });
  }

  window.Usuarios = { cargar: cargar, prepararEmpresa: prepararEmpresa };
})();
