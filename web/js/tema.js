/** tema.js — claro, oscuro o el del sistema. Se aplica antes de pintar. */
(function () {
  'use strict';
  const CLAVE = 'ca_tema';
  function aplicar(modo) {
    const sistemaOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const final = modo === 'auto' ? (sistemaOscuro ? 'dark' : 'light') : modo;
    document.documentElement.setAttribute('data-theme', final);
  }
  const deUrl = (function () {
    try {
      const m = window.location.search.match(/[?&]tema=(light|dark|auto)\b/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  })();
  if (deUrl) { try { localStorage.setItem(CLAVE, deUrl); } catch (e) { /* nada */ } }
  // Por defecto claro: la identidad del portal está pensada sobre fondo claro.
  const guardado = deUrl || (function () {
    try { return localStorage.getItem(CLAVE) || 'light'; } catch (e) { return 'light'; }
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
