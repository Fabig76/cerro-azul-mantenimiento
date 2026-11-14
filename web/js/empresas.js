/**
 * empresas.js — pantalla de cumplimiento por empresa contratista.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoEmpresas');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  function colorCumplimiento(pct) {
    if (pct === null || pct === undefined) return 'gray';
    if (pct >= 80) return 'ok';
    if (pct >= 60) return 'warn';
    return 'danger';
  }

  // --- Ficha de cada empresa: ver, crear, corregir, activar o desactivar ---
  let fichas = [];
  let editando = null;

  function avisoFicha(texto, tipo) {
    const caja = document.getElementById('avisoFicha');
    if (!caja) return;
    caja.textContent = texto || '';
    caja.className = 'msg' + (texto ? ' mostrar ' + (tipo || 'ok') : '');
  }

  function campo(valor) { return valor === null || valor === undefined ? '—' : String(valor); }

  function pintarFichas() {
    const cont = document.getElementById('listaFichas');
    if (!cont) return;
    cont.textContent = '';

    const cuenta = document.getElementById('conteoFichas');
    if (cuenta) {
      const activas = fichas.filter(function (f) { return f.activo; }).length;
      cuenta.textContent = activas + ' activas · ' + fichas.length + ' en total';
    }

    const verInactivas = (document.getElementById('empVerInactivas') || {}).checked;
    const lista = fichas.filter(function (f) { return verInactivas || f.activo; });

    if (!lista.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay empresas registradas.'));
      return;
    }

    lista.forEach(function (f) {
      const caja = el('article', 'ficha' + (f.activo ? '' : ' ficha-inactiva'));

      const cab = el('div', 'ficha-cab');
      cab.appendChild(el('h3', null, f.razon_social));
      if (!f.activo) cab.appendChild(el('span', 'badge gray', 'Inactiva'));
      if (f.vencida) cab.appendChild(el('span', 'badge danger', 'Contrato vencido'));
      caja.appendChild(cab);

      const datos = el('div', 'ficha-datos');
      [['NIT', f.nit], ['Contacto', f.contacto], ['Correo', f.email], ['Teléfono', f.telefono],
       ['Contrato', f.contrato_numero], ['Vigencia', (f.vigencia_desde || f.vigencia_hasta)
         ? (f.vigencia_desde || '—') + ' → ' + (f.vigencia_hasta || 'sin fin') : ''],
       ['Usuarios', f.usuarios ? f.usuarios + ' registrado(s)' : ''],
      ].forEach(function (par) {
        if (!par[1]) return;
        const linea = el('p', 'ficha-linea');
        linea.appendChild(el('span', 'ficha-etiqueta', par[0]));
        linea.appendChild(el('span', null, campo(par[1])));
        datos.appendChild(linea);
      });
      caja.appendChild(datos);

      const acciones = el('div', 'ficha-acciones');
      const editar = el('button', 'btn sm', 'Corregir');
      editar.type = 'button';
      editar.addEventListener('click', function () { abrirFormulario(f); });
      acciones.appendChild(editar);

      const cambiar = el('button', 'btn sm' + (f.activo ? '' : ' primary'),
        f.activo ? 'Desactivar' : 'Activar');
      cambiar.type = 'button';
      cambiar.addEventListener('click', function () { cambiarEstado(f); });
      acciones.appendChild(cambiar);
      caja.appendChild(acciones);

      cont.appendChild(caja);
    });
  }

  function abrirFormulario(f) {
    editando = f || null;
    const form = document.getElementById('formEmpresa');
    if (!form) return;
    form.classList.remove('oculto');
    const v = function (id) { return document.getElementById(id); };
    v('empRazon').value = f ? (f.razon_social || '') : '';
    v('empNit').value = f ? (f.nit || '') : '';
    v('empContacto').value = f ? (f.contacto || '') : '';
    v('empCorreo').value = f ? (f.email || '') : '';
    v('empTelefono').value = f ? (f.telefono || '') : '';
    v('empContrato').value = f ? (f.contrato_numero || '') : '';
    v('empDesde').value = f ? (f.vigencia_desde || '') : '';
    v('empHasta').value = f ? (f.vigencia_hasta || '') : '';
    avisoFicha('');
    v('empRazon').focus();
  }

  function cerrarFormulario() {
    editando = null;
    const form = document.getElementById('formEmpresa');
    if (form) form.classList.add('oculto');
    avisoFicha('');
  }

  async function cargarFichas() {
    const verInactivas = (document.getElementById('empVerInactivas') || {}).checked;
    const r = await API.llamar('empresas.listar', { todas: verInactivas || true },
      { token: Sesion.token() });
    if (!r.ok) {
      const cont = document.getElementById('listaFichas');
      if (cont) { cont.textContent = ''; cont.appendChild(el('div', 'vacio', r.message || 'No se pudieron cargar las empresas.')); }
      return;
    }
    fichas = r.data.empresas || [];
    Datos.invalidar('empresas.listar');
    pintarFichas();
  }

  async function cambiarEstado(f) {
    const que = f.activo ? 'desactivar' : 'activar';
    let apagarUsuarios = false;
    if (f.activo) {
      const cuantos = Number(f.usuarios || 0);
      const texto = '¿Desactivar «' + f.razon_social + '»?\n\nDejará de aparecer al asignar trabajo.' +
        (cuantos ? '\n\nTiene ' + cuantos + ' usuario(s) vinculado(s). Se desactivarán también.' : '');
      if (!window.confirm(texto)) return;
      apagarUsuarios = cuantos > 0;
    }
    const r = await API.llamar('empresas.estado',
      { id: f.id, activo: !f.activo, desactivar_usuarios: apagarUsuarios },
      { token: Sesion.token(), idempotente: true });
    if (!r.ok) { avisoFicha(r.message || 'No se pudo ' + que + ' la empresa.', 'error'); return; }
    const apagados = (r.data && r.data.usuarios_apagados) || 0;
    avisoFicha('Empresa ' + (f.activo ? 'desactivada' : 'activada') + '.' +
      (apagados ? ' Se desactivaron ' + apagados + ' usuario(s).' : ''), 'ok');
    await cargarFichas();
  }

  function prepararFichas() {
    const form = document.getElementById('formEmpresa');
    const nueva = document.getElementById('btnNuevaEmpresa');
    const cancelar = document.getElementById('btnCancelarEmpresa');
    const ver = document.getElementById('empVerInactivas');
    if (ver) ver.addEventListener('change', pintarFichas);
    if (nueva) nueva.addEventListener('click', function () { abrirFormulario(null); });
    if (cancelar) cancelar.addEventListener('click', cerrarFormulario);
    if (!form) return;

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const boton = document.getElementById('btnGuardarEmpresa');
      boton.disabled = true;
      const payload = {
        razon_social: document.getElementById('empRazon').value.trim(),
        nit: document.getElementById('empNit').value.trim(),
        contacto: document.getElementById('empContacto').value.trim(),
        email: document.getElementById('empCorreo').value.trim(),
        telefono: document.getElementById('empTelefono').value.trim(),
        contrato_numero: document.getElementById('empContrato').value.trim(),
        vigencia_desde: document.getElementById('empDesde').value,
        vigencia_hasta: document.getElementById('empHasta').value,
      };
      if (editando) payload.id = editando.id;
      const r = await API.llamar('empresas.guardar', payload, { token: Sesion.token(), idempotente: true });
      boton.disabled = false;
      if (!r.ok) { avisoFicha(r.message || 'No se pudo guardar la empresa.', 'error'); return; }
      avisoFicha(editando ? 'Empresa corregida.' : 'Empresa creada.', 'ok');
      cerrarFormulario();
      await cargarFichas();
    });
  }

  async function cargar(mes) {
    const r = await API.llamar('kpi.panel', mes ? { mes: mes } : {}, { token: Sesion.token() });
    if (!r.ok) return aviso(r.message || 'No se pudieron cargar los indicadores.', 'error');

    const conjunto = r.data.conjunto || {};
    const resumen = document.getElementById('kpiConjunto');
    if (resumen) {
      resumen.textContent = '';
      [
        { n: conjunto.programadas || 0, l: 'Programadas del mes', a: 'indigo' },
        { n: conjunto.ejecutadas || 0, l: 'Ejecutadas', a: 'ok' },
        { n: (conjunto.cumplimiento_pct === null ? '—' : conjunto.cumplimiento_pct + '%'), l: 'Cumplimiento', a: colorCumplimiento(conjunto.cumplimiento_pct) },
        { n: conjunto.vencidas || 0, l: 'Vencidas', a: conjunto.vencidas ? 'danger' : 'ok' },
        { n: conjunto.reportes_pendientes || 0, l: 'Reportes por revisar', a: conjunto.reportes_pendientes ? 'warn' : 'ok' },
      ].forEach(function (k) {
        const caja = el('div', 'kpi acento-' + k.a);
        caja.appendChild(el('div', 'kpi-n', String(k.n)));
        caja.appendChild(el('div', 'kpi-l', k.l));
        resumen.appendChild(caja);
      });
    }

    const cont = document.getElementById('listaEmpresas');
    if (!cont) return;
    cont.textContent = '';
    const empresas = r.data.empresas || [];
    if (!empresas.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay empresas con actividades.'));
      return;
    }

    const tabla = el('div', 'tabla-empresas');
    const cab = el('div', 'tabla-fila tabla-cab');
    ['Empresa', 'Programadas', 'Cumplidas', 'Cumplimiento', 'A tiempo', 'Vencidas', 'Rechazo', 'Días para iniciar'].forEach(function (t) {
      cab.appendChild(el('span', null, t));
    });
    tabla.appendChild(cab);

    empresas.forEach(function (e) {
      const fila = el('div', 'tabla-fila');
      fila.appendChild(el('span', 'tabla-empresa', e.razon_social));
      fila.appendChild(el('span', null, String(e.programadas)));
      fila.appendChild(el('span', null, String(e.cumplidas)));
      const cum = el('span');
      cum.appendChild(el('span', 'badge ' + colorCumplimiento(e.cumplimiento_pct),
        e.cumplimiento_pct === null ? '—' : e.cumplimiento_pct + '%'));
      fila.appendChild(cum);
      fila.appendChild(el('span', null, e.a_tiempo_pct === null ? '—' : e.a_tiempo_pct + '%'));
      fila.appendChild(el('span', e.vencidas ? 'texto-danger' : null, String(e.vencidas)));
      fila.appendChild(el('span', null, e.rechazo_pct === null ? '—' : e.rechazo_pct + '%'));
      fila.appendChild(el('span', null, e.dias_para_iniciar === null ? '—' : e.dias_para_iniciar + ' d'));
      if (e.vencida) fila.appendChild(el('span', 'badge danger', 'Contrato vencido'));
      tabla.appendChild(fila);
    });
    cont.appendChild(tabla);
  }

  function preparar() {
    prepararFichas();
    cargarFichas();

    const sel = document.getElementById('empMes');
    if (!sel) return;
    const hoy = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const valor = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      const op = el('option', null, d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }));
      op.value = valor;
      sel.appendChild(op);
    }
    sel.addEventListener('change', function () { cargar(sel.value); });

    const btn = document.getElementById('btnInforme');
    if (btn) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = 'Generando…';
        const r = await API.llamar('informes.mensual', { mes: sel.value || undefined }, { token: Sesion.token() });
        btn.disabled = false;
        btn.textContent = 'Generar informe mensual';
        if (!r.ok) return aviso(r.message || 'No se pudo generar el informe.', 'error');
        aviso('Informe del mes listo y guardado en Drive.', 'ok');
        const enlace = document.getElementById('enlaceInforme');
        if (enlace) {
          enlace.textContent = '';
          enlace.href = r.data.url;
          enlace.target = '_blank';
          enlace.rel = 'noopener';
          enlace.textContent = 'Abrir ' + r.data.nombre;
          enlace.classList.remove('oculto');
        }
      });
    }
  }

  window.Empresas = { cargar: cargar, preparar: preparar, cargarFichas: cargarFichas };
})();
