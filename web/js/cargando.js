/**
 * Señales de espera. Sin esto la persona toca, no pasa nada durante segundos y vuelve a
 * tocar: cree que no funcionó (L1 de la auditoría).
 */
(function () {
  'use strict';

  /** Deja un botón ocupado con su texto y lo devuelve como estaba. */
  function ocupar(boton, texto) {
    if (!boton) return { soltar: function () {} };
    const antes = boton.textContent;
    const desactivado = boton.disabled;
    boton.disabled = true;
    boton.dataset.ocupado = '1';
    boton.setAttribute('aria-busy', 'true');
    if (texto) boton.textContent = texto;
    return {
      texto: function (t) { boton.textContent = t; },
      soltar: function () {
        boton.disabled = desactivado;
        boton.textContent = antes;
        delete boton.dataset.ocupado;
        boton.removeAttribute('aria-busy');
      },
    };
  }

  /** Esqueleto con la forma de una lista de trabajos. */
  function esqueleto(contenedor, filas) {
    if (!contenedor) return;
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.textContent = '';
    const cuantas = Math.max(1, Math.min(6, filas || 3));
    for (let i = 0; i < cuantas; i++) {
      const caja = document.createElement('div');
      caja.className = 'esqueleto-fila';
      const titulo = document.createElement('div');
      titulo.className = 'esqueleto-bloque';
      titulo.style.width = (60 + (i % 3) * 10) + '%';
      const meta = document.createElement('div');
      meta.className = 'esqueleto-bloque bajo';
      meta.style.width = '40%';
      caja.appendChild(titulo);
      caja.appendChild(meta);
      contenedor.appendChild(caja);
    }
  }

  /** Quita el esqueleto y devuelve el contenedor a la normalidad. */
  function listo(contenedor) {
    if (!contenedor) return;
    // Sin esto las filas grises se quedaban encima de los datos para siempre.
    Array.prototype.slice.call(contenedor.querySelectorAll('.esqueleto-fila'))
      .forEach(function (fila) { fila.remove(); });
    contenedor.removeAttribute('aria-busy');
  }

  function esperando(contenedor, texto) {
    if (!contenedor) return;
    contenedor.setAttribute('aria-busy', 'true');
    if (texto) {
      contenedor.textContent = '';
      const aviso = document.createElement('p');
      aviso.className = 'msg info mostrar';
      aviso.textContent = texto;
      contenedor.appendChild(aviso);
    }
  }

  window.Cargando = { ocupar: ocupar, esqueleto: esqueleto, listo: listo, esperando: esperando };
})();
