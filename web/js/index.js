/** index.js — interactividad mínima del portal público. */
(function () {
  'use strict';
  const b = document.getElementById('btnTema');
  if (b) b.addEventListener('click', function () { window.Tema.alternar(); });
})();
