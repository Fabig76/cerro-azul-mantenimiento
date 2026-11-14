/** pruebas.js — ejecuta las verificaciones del sistema desde el panel del administrador. */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function preparar() {
    const btn = document.getElementById('btnPruebas');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Ejecutando…';
      const r = await API.llamar('tests.ejecutar', {}, { token: Sesion.token() });
      btn.disabled = false;
      btn.textContent = 'Ejecutar pruebas';

      const resumen = document.getElementById('resumenPruebas');
      const lista = document.getElementById('detallePruebas');
      if (!resumen || !lista) return;
      lista.textContent = '';

      if (!r.ok) {
        resumen.textContent = r.message || 'No se pudieron ejecutar.';
        resumen.className = 'msg mostrar error';
        return;
      }

      const d = r.data;
      resumen.textContent = d.fallidas === 0
        ? 'Todo bien: ' + d.pasadas + ' verificaciones pasaron.'
        : d.fallidas + ' de ' + (d.pasadas + d.fallidas) + ' fallaron.';
      resumen.className = 'msg mostrar ' + (d.fallidas === 0 ? 'ok' : 'error');

      (d.detalle || []).forEach(function (linea) {
        const fila = el('div', 'linea-prueba' + (linea.indexOf('FALLA') === 0 ? ' falla' : ''));
        fila.textContent = linea;
        lista.appendChild(fila);
      });
    });
  }

  function prepararRefresco() {
    const btn = document.getElementById('btnRefrescarPortal');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Actualizando…';
      const r = await API.llamar('snapshot.regenerar', {}, { token: Sesion.token() });
      btn.disabled = false;
      btn.textContent = 'Actualizar portal público';
      const resumen = document.getElementById('resumenPruebas');
      if (!resumen) return;
      resumen.textContent = r.ok
        ? 'Portal público actualizado: ' + r.data.bytes + ' caracteres, ' + String(r.data.generado_en).slice(11, 16) + '.'
        : (r.message || 'No se pudo actualizar.');
      resumen.className = 'msg mostrar ' + (r.ok ? 'ok' : 'error');
    });
  }

  function prepararPruebas() {
    const btn = document.getElementById('btnPruebas');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Ejecutando…';
      const r = await API.llamar('tests.ejecutar', {}, { token: Sesion.token() });
      btn.disabled = false;
      btn.textContent = 'Ejecutar pruebas';

      const resumen = document.getElementById('resumenPruebas');
      const lista = document.getElementById('detallePruebas');
      if (!resumen || !lista) return;
      lista.textContent = '';

      if (!r.ok) {
        resumen.textContent = r.message || 'No se pudieron ejecutar.';
        resumen.className = 'msg mostrar error';
        return;
      }
      const d = r.data;
      resumen.textContent = d.fallidas === 0
        ? 'Todo bien: ' + d.pasadas + ' verificaciones pasaron.'
        : d.fallidas + ' de ' + (d.pasadas + d.fallidas) + ' fallaron.';
      resumen.className = 'msg mostrar ' + (d.fallidas === 0 ? 'ok' : 'error');
      (d.detalle || []).forEach(function (linea) {
        const fila = el('div', 'linea-prueba' + (linea.indexOf('FALLA') === 0 ? ' falla' : ''));
        fila.textContent = linea;
        lista.appendChild(fila);
      });
    });
  }

  /** Cola de correos y disparadores: si algo se atasca, se ve aquí. */
  async function cargarEstado() {
    const caja = document.getElementById('estadoCorreos');
    if (!caja) return;
    const r = await API.llamar('sistema.estado', {}, { token: Sesion.token() });
    if (!r.ok) {
      caja.textContent = 'No se pudo consultar el estado: ' + (r.message || 'sin respuesta');
      return;
    }
    const c = r.data.correos || {};
    const partes = [
      'Correos en cola: ' + (c.pendientes || 0) + (c.pendientes === 1 ? ' pendiente' : ' pendientes'),
      (c.errores || 0) + ' con error',
    ];
    if ((r.data.faltan || []).length) {
      partes.push('Faltan disparadores: ' + r.data.faltan.join(', ') + '. Ejecuta instalarDisparadores().');
    } else {
      partes.push('Los ' + (r.data.disparadores || []).length + ' disparadores están instalados');
    }
    caja.textContent = partes.join(' · ') + '.';
    pintarFilas(r.data.filas || {}, r.data.archivo || {});
  }

  /** Cuántas filas tiene cada tabla y cuándo hay que archivar. */
  function pintarFilas(filas, archivo) {
    const cont = document.getElementById('tablaFilas');
    if (!cont) return;
    cont.textContent = '';
    const aviso = Number(archivo.aviso || 15000);
    const limite = Number(archivo.limite || 20000);

    const tabla = document.createElement('div');
    tabla.className = 'tabla-filas';
    const cab = document.createElement('div');
    cab.className = 'tabla-fila tabla-cab';
    ['Tabla', 'Filas', 'Estado'].forEach(function (t) {
      const c = document.createElement('span');
      c.textContent = t;
      cab.appendChild(c);
    });
    tabla.appendChild(cab);

    const nombres = Object.keys(filas).sort(function (a, b) { return Number(filas[b]) - Number(filas[a]); });
    nombres.forEach(function (nombre) {
      const n = Number(filas[nombre] || 0);
      const fila = document.createElement('div');
      fila.className = 'tabla-fila';

      const c1 = document.createElement('span');
      c1.textContent = nombre;
      fila.appendChild(c1);

      const c2 = document.createElement('span');
      c2.textContent = String(n);
      fila.appendChild(c2);

      const c3 = document.createElement('span');
      const marca = document.createElement('span');
      if (n >= limite) { marca.className = 'badge danger'; marca.textContent = 'Archivar ya'; }
      else if (n >= aviso) { marca.className = 'badge warn'; marca.textContent = 'Preparar archivo'; }
      else { marca.className = 'badge ok'; marca.textContent = 'Normal'; }
      c3.appendChild(marca);
      fila.appendChild(c3);

      tabla.appendChild(fila);
    });
    cont.appendChild(tabla);
  }

  window.Pruebas = {
    preparar: function () { prepararPruebas(); prepararRefresco(); cargarEstado(); },
  };
})();
