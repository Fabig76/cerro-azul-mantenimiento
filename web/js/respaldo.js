/** respaldo.js — copias del libro desde el panel del administrador. */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoRespaldo');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  async function cargar() {
    const r = await API.llamar('respaldos.listar', {}, { token: Sesion.token() });
    if (!r.ok) {
      if (window.Fallo) Fallo.mostrar('ultimoRespaldo', r.message, cargar);
      return;
    }
    const elUltimo = document.getElementById('ultimoRespaldo');
    if (!elUltimo) return;
    if (r.data.ultimo) {
      elUltimo.textContent = 'Último respaldo: ' + r.data.ultimo.replace('T', ' ').slice(0, 16) +
        ' · ' + (r.data.respaldos || []).length + ' copias guardadas.';
    } else {
      elUltimo.textContent = 'Sin respaldos todavía.';
    }
  }

  function preparar() {
    const btn = document.getElementById('btnRespaldo');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Copiando…';
      const r = await API.llamar('respaldos.crear', {}, { token: Sesion.token(), idempotente: true });
      btn.disabled = false;
      btn.textContent = 'Hacer respaldo ahora';
      if (!r.ok) return aviso(r.message || 'No se pudo respaldar.', 'error');
      aviso('Respaldo creado: ' + r.data.nombre, 'ok');
      cargar();
    });
  }

  window.Respaldo = { cargar: cargar, preparar: preparar };
})();
