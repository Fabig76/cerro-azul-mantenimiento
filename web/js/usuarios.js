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
      API.llamar('usuarios.listar', {}, { token: t }),
      API.llamar('empresas.listar', {}, { token: t }),
      API.llamar('nodos.arbol', {}, { token: t }),
    ]);
    if (rU.ok) usuarios = rU.data.usuarios || [];
    if (rE.ok) empresas = rE.data.empresas || [];
    if (rN.ok) nodos = rN.data.nodos || [];
    pintar();
  }

  function pintar() {
    const cont = document.getElementById('listaUsuarios');
    if (!cont) return;
    cont.textContent = '';

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
      .slice()
      .sort(function (a, b) {
        const orden = { PENDIENTE: 0, ACTIVO: 1, INACTIVO: 2 };
        return (orden[a.estado] || 9) - (orden[b.estado] || 9);
      })
      .forEach(function (u) { cont.appendChild(fila(u)); });
  }

  function fila(u) {
    const caja = el('article', 'usuario');
    const cab = el('div', 'usuario-cab');

    const quien = el('div');
    quien.appendChild(el('h3', null, u.nombre || u.email));
    const sub = el('p', 'usuario-correo', u.email);
    quien.appendChild(sub);

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

      if (u.estado !== 'ACTIVO') {
        const act = await API.llamar('usuarios.activar', {
          id: u.id, rol: sRol.value, empresa_id: sEmp.value,
        }, { token: t, idempotente: true });
        if (!act.ok) return aviso(act.message || 'No se pudo activar.', 'error');
      } else {
        const ed = await API.llamar('usuarios.editar', {
          id: u.id, rol: sRol.value, empresa_id: sEmp.value,
        }, { token: t, idempotente: true });
        if (!ed.ok) return aviso(ed.message || 'No se pudo guardar.', 'error');
      }
      const asig = await API.llamar('usuarios.asignar', {
        id: u.id, nodo_ids: nodoIds,
      }, { token: t, idempotente: true });
      if (!asig.ok) return aviso(asig.message || 'No se pudieron asignar las secciones.', 'error');
      aviso('Usuario guardado con ' + nodoIds.length + ' sección(es).', 'ok');
      await cargar();
      document.getElementById('panelUsuario').classList.add('oculto');
    });

    const desactivar = el('button', 'btn peligro', 'Desactivar');
    desactivar.type = 'button';
    desactivar.disabled = u.estado !== 'ACTIVO';
    desactivar.addEventListener('click', async function () {
      const r = await API.llamar('usuarios.desactivar', { id: u.id }, { token: Sesion.token(), idempotente: true });
      if (!r.ok) return aviso(r.message || 'No se pudo desactivar.', 'error');
      aviso('Usuario desactivado y sesiones revocadas.', 'ok');
      await cargar();
      document.getElementById('panelUsuario').classList.add('oculto');
    });

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
      if (!r.ok) return aviso(r.message || 'No se pudo crear la empresa.', 'error');
      aviso('Empresa creada. Ya puede asignarla a un contratista.', 'ok');
      document.getElementById('empRazon').value = '';
      document.getElementById('empNit').value = '';
      await cargar();
    });
  }

  window.Usuarios = { cargar: cargar, prepararEmpresa: prepararEmpresa };
})();
