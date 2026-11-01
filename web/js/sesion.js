/**
 * sesion.js — manejo del token de sesión en el navegador.
 * Contratistas: sessionStorage siempre (RN de la v1.2, celulares compartidos).
 * Admin y supervisor: sessionStorage, salvo que marquen "mantener la sesión".
 */
(function () {
  'use strict';

  const CLAVE = 'ca_sesion';
  const CLAVE_RECORDAR = 'ca_recordar';

  function guardar(datos, recordar) {
    const texto = JSON.stringify(datos);
    try { sessionStorage.setItem(CLAVE, texto); } catch (e) { /* modo privado o cuota */ }
    try {
      if (recordar) localStorage.setItem(CLAVE, texto);
      else localStorage.removeItem(CLAVE);
      localStorage.setItem(CLAVE_RECORDAR, recordar ? '1' : '0');
    } catch (e) { /* sin almacenamiento persistente */ }
  }

  function leer() {
    try {
      const deSesion = sessionStorage.getItem(CLAVE);
      if (deSesion) return JSON.parse(deSesion);
    } catch (e) { /* nada */ }
    try {
      const deLocal = localStorage.getItem(CLAVE);
      if (deLocal) return JSON.parse(deLocal);
    } catch (e) { /* nada */ }
    return null;
  }

  function token() {
    const s = leer();
    return s && s.token ? s.token : null;
  }

  function limpiar() {
    try { sessionStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
    try {
      localStorage.removeItem(CLAVE);
      localStorage.removeItem(CLAVE_RECORDAR);
    } catch (e) { /* nada */ }
  }

  window.Sesion = { guardar: guardar, leer: leer, token: token, limpiar: limpiar };
})();
