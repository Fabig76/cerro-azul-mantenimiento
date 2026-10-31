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
    sessionStorage.setItem(CLAVE, JSON.stringify(datos));
    if (recordar) localStorage.setItem(CLAVE, JSON.stringify(datos));
    else localStorage.removeItem(CLAVE);
    localStorage.setItem(CLAVE_RECORDAR, recordar ? '1' : '0');
  }

  function leer() {
    const deSesion = sessionStorage.getItem(CLAVE);
    if (deSesion) return JSON.parse(deSesion);
    const deLocal = localStorage.getItem(CLAVE);
    if (deLocal) return JSON.parse(deLocal);
    return null;
  }

  function token() {
    const s = leer();
    return s && s.token ? s.token : null;
  }

  function limpiar() {
    sessionStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE_RECORDAR);
  }

  window.Sesion = { guardar: guardar, leer: leer, token: token, limpiar: limpiar };
})();
