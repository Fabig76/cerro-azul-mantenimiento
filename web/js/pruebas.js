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

  window.Pruebas = { preparar: preparar };
})();
