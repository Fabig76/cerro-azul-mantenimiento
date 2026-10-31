/** tema.js — claro, oscuro o el del sistema. Se aplica antes de pintar. */
(function () {
  'use strict';
  const CLAVE = 'ca_tema';
  function aplicar(modo) {
    const sistemaOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const final = modo === 'auto' ? (sistemaOscuro ? 'dark' : 'light') : modo;
    document.documentElement.setAttribute('data-theme', final);
  }
  const guardado = (function () {
    try { return localStorage.getItem(CLAVE) || 'auto'; } catch (e) { return 'auto'; }
  })();
  aplicar(guardado);
  window.Tema = {
    alternar: function () {
      const actual = document.documentElement.getAttribute('data-theme');
      const nuevo = actual === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nuevo);
      try { localStorage.setItem(CLAVE, nuevo); } catch (e) { /* nada */ }
    },
  };
})();
