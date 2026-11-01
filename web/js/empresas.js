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

  window.Empresas = { cargar: cargar, preparar: preparar };
})();
