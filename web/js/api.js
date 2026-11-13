/**
 * api.js — cliente de la API de Apps Script.
 * Sin cabeceras personalizadas: la petición viaja como text/plain (simple request, sin preflight).
 */
(function () {
  'use strict';

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function llamar(accion, payload, opciones) {
    const opt = opciones || {};
    const cuerpo = { action: accion, payload: payload || {} };
    if (opt.token) cuerpo.token = opt.token;
    if (opt.idempotente) cuerpo.requestId = uuid();

    let respuesta;
    try {
      respuesta = await fetch(window.CFG.API_URL, {
        method: 'POST',
        body: JSON.stringify(cuerpo),
        redirect: 'follow',
      });
    } catch (e) {
      return { ok: false, code: 'RED', message: 'No hay conexión con el servidor. Revisa tu internet.' };
    }
    if (!respuesta.ok) {
      return { ok: false, code: 'HTTP', message: 'El servidor respondió ' + respuesta.status + '.' };
    }
    try {
      return await respuesta.json();
    } catch (e) {
      return { ok: false, code: 'RESPUESTA', message: 'Respuesta inesperada del servidor.' };
    }
  }

  async function publico(accion, parametros) {
    const q = new URLSearchParams(Object.assign({ action: accion }, parametros || {}));
    const r = await fetch(window.CFG.API_URL + '?' + q.toString(), { redirect: 'follow' });
    return r.json();
  }

  window.API = { llamar: llamar, publico: publico, uuid: uuid };
})();

/**
 * Borrador de un formulario largo en el propio celular: escribir en campo y
 * perderlo por una recarga es lo peor que puede pasar.
 */
window.Borrador = {
  clave: function (nombre) { return 'ca_form:' + nombre; },

  leer: function (nombre) {
    try {
      const crudo = localStorage.getItem(window.Borrador.clave(nombre));
      return crudo ? JSON.parse(crudo) : null;
    } catch (e) { return null; }
  },

  guardar: function (nombre, datos) {
    try {
      localStorage.setItem(window.Borrador.clave(nombre), JSON.stringify(
        Object.assign({}, datos, { guardado_en: new Date().toISOString() })));
    } catch (e) { /* sin almacenamiento */ }
  },

  borrar: function (nombre) {
    try { localStorage.removeItem(window.Borrador.clave(nombre)); } catch (e) { /* nada */ }
  },
};
