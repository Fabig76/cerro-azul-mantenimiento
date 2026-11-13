/**
 * plan.js — planes de mantenimiento (recurrencias) del administrador.
 */
(function () {
  'use strict';

  let recurrencias = [];
  let nodos = [];
  let empresas = [];

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoPlan');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  const ETIQUETA_FRECUENCIA = {
    SEMANAL: 'Semanal', QUINCENAL: 'Quincenal', MENSUAL: 'Mensual', BIMESTRAL: 'Bimestral',
    TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual', CADA_N_DIAS: 'Cada N días',
  };

  async function cargar() {
    const t = Sesion.token();
    const [rR, rN, rE] = await Promise.all([
      API.llamar('recurrencias.listar', {}, { token: t }),
      Datos.obtener('nodos.arbol', t),
      Datos.obtener('empresas.listar', t),
    ]);
    if (rR.ok) recurrencias = rR.data.recurrencias || [];
    if (rN.ok) nodos = rN.data.nodos || [];
    if (rE.ok) empresas = rE.data.empresas || [];
    pintar();
    pintarSelects();
  }

  function pintarSelects() {
    const sel = document.getElementById('planNodo');
    if (!sel) return;
    sel.textContent = '';
    nodos
      .filter(function (n) { return n.clase === 'ELEMENTO'; })
      .sort(function (a, b) { return String(a.codigo).localeCompare(String(b.codigo)); })
      .forEach(function (n) {
        const op = el('option', null, n.codigo + ' · ' + n.nombre);
        op.value = n.id;
        sel.appendChild(op);
      });

    const emp = document.getElementById('planEmpresa');
    if (!emp) return;
    const vacio = el('option', null, 'Sin empresa asignada');
    vacio.value = '';
    emp.appendChild(vacio);
    empresas.forEach(function (e) {
      const op = el('option', null, e.razon_social);
      op.value = e.id;
      emp.appendChild(op);
    });
  }

  function pintar() {
    const cont = document.getElementById('listaPlan');
    if (!cont) return;
    cont.textContent = '';
    const conteo = document.getElementById('conteoPlan');
    if (conteo) conteo.textContent = recurrencias.filter(function (r) { return r.activa; }).length + ' activos';

    if (!recurrencias.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay planes. Cree uno desde el tipo de un elemento o programe uno manual.'));
      return;
    }

    recurrencias.forEach(function (r) {
      const caja = el('article', 'novedad ' + (r.activa ? 'baja' : ''));
      const cab = el('div', 'novedad-cab');
      cab.appendChild(el('h3', null, (r.nodo ? r.nodo.codigo + ' · ' + r.nodo.nombre : 'Elemento')));

      const marcas = el('div', 'usuario-marcas');
      marcas.appendChild(el('span', 'badge', ETIQUETA_FRECUENCIA[r.frecuencia] || r.frecuencia));
      if (r.obligatoria_legal) marcas.appendChild(el('span', 'badge warn', 'Obligatorio'));
      marcas.appendChild(el('span', 'badge ' + (r.activa ? 'ok' : 'gray'), r.activa ? 'Activo' : 'Pausado'));
      cab.appendChild(marcas);
      caja.appendChild(cab);

      const detalle = el('p', null,
        (r.plantilla || 'Sin plantilla') + ' · próxima: ' + (r.proxima_fecha || '—') +
        (r.empresa ? ' · ' + r.empresa : ''));
      caja.appendChild(detalle);

      const btn = el('button', 'btn sm', r.activa ? 'Pausar' : 'Reactivar');
      btn.type = 'button';
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        const x = await API.llamar('recurrencias.pausar', { id: r.id, activa: !r.activa }, { token: Sesion.token(), idempotente: true });
        btn.disabled = false;
        if (!x.ok) return aviso(x.message || 'No se pudo cambiar.', 'error');
        cargar();
      });
      caja.appendChild(btn);
      cont.appendChild(caja);
    });
  }

  function preparar() {
    const generar = document.getElementById('btnGenerar');
    if (generar) {
      generar.addEventListener('click', async function () {
        generar.disabled = true;
        const r = await API.llamar('recurrencias.generar', {}, { token: Sesion.token(), idempotente: true });
        generar.disabled = false;
        if (!r.ok) return aviso(r.message || 'No se pudo generar.', 'error');
        aviso(r.data.creadas
          ? 'Se generaron ' + r.data.creadas + ' actividad(es).'
          : 'No había actividades por generar: todo está al día.', 'ok');
        cargar();
        if (window.App) App.refrescar();
      });
    }

    const desdeTipo = document.getElementById('btnDesdeTipo');
    if (desdeTipo) {
      desdeTipo.addEventListener('click', async function () {
        const nodoId = document.getElementById('planNodo').value;
        if (!nodoId) return aviso('Selecciona un elemento.', 'error');
        desdeTipo.disabled = true;
        const r = await API.llamar('recurrencias.desde_tipo', { nodo_id: nodoId }, { token: Sesion.token(), idempotente: true });
        desdeTipo.disabled = false;
        if (!r.ok) return aviso(r.message || 'No se pudo crear el plan.', 'error');
        aviso(r.data.total ? 'Plan creado: ' + r.data.total + ' recurrencia(s).' : 'Ese elemento ya tenía su plan.', 'ok');
        cargar();
      });
    }

    const form = document.getElementById('formPlan');
    if (form) {
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const r = await API.llamar('recurrencias.guardar', {
          nodo_id: document.getElementById('planNodo').value,
          empresa_id: document.getElementById('planEmpresa').value,
          frecuencia: document.getElementById('planFrecuencia').value,
          duracion_dias: Number(document.getElementById('planDuracion').value || 1),
          proxima_fecha: document.getElementById('planFecha').value,
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) return aviso(r.message || 'No se pudo guardar.', 'error');
        aviso('Plan guardado. Aparecerá como actividad en su fecha.', 'ok');
        cargar();
      });
    }
  }

  window.Plan = { cargar: cargar, preparar: preparar };
})();
