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

  // Cuánto se espera antes de darse por vencido, y cuánto antes de reintentar.
  const ESPERA_LECTURA = 30000;
  const ESPERA_FOTO = 90000;
  const REINTENTOS = [2000, 5000];

  function esLectura(accion) {
    return /\.(listar|get|arbol|panel|me)$/.test(accion) || accion === 'auth.me' ||
      accion === 'public.snapshot';
  }

  /** Un intento, con límite de tiempo. */
  async function intento(cuerpo, milisegundos) {
    const control = new AbortController();
    const reloj = setTimeout(function () { control.abort(); }, milisegundos);
    try {
      const respuesta = await fetch(window.CFG.API_URL, {
        method: 'POST',
        body: JSON.stringify(cuerpo),
        redirect: 'follow',
        signal: control.signal,
      });
      clearTimeout(reloj);
      if (!respuesta.ok) {
        return { ok: false, code: 'HTTP', message: 'El servidor respondió ' + respuesta.status + '.' };
      }
      try {
        return await respuesta.json();
      } catch (e) {
        return { ok: false, code: 'RESPUESTA', message: 'Respuesta inesperada del servidor.' };
      }
    } catch (e) {
      clearTimeout(reloj);
      if (e && e.name === 'AbortError') {
        return { ok: false, code: 'TIEMPO', message: 'El servidor tardó demasiado. Intente de nuevo.' };
      }
      return { ok: false, code: 'RED', message: 'No hay conexión con el servidor. Revisa tu internet.' };
    }
  }

  async function llamar(accion, payload, opciones) {
    const opt = opciones || {};
    const cuerpo = { action: accion, payload: payload || {} };
    if (opt.token) cuerpo.token = opt.token;

    // El mismo requestId en todos los intentos: el servidor reconoce la repetición
    // y no aplica dos veces la escritura.
    const conReintento = esLectura(accion) || !!opt.idempotente;
    if (opt.idempotente) cuerpo.requestId = uuid();

    const espera = /foto|upload|evidencias\.subir/.test(accion) ? ESPERA_FOTO : ESPERA_LECTURA;
    let resultado = await intento(cuerpo, espera);

    for (let i = 0; conReintento && i < REINTENTOS.length; i++) {
      const pasajero = resultado.code === 'RED' || resultado.code === 'TIEMPO';
      if (!pasajero) break;
      await new Promise(function (r) { setTimeout(r, REINTENTOS[i]); });
      resultado = await intento(cuerpo, espera);
    }
    return resultado;
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

/**
 * Un fallo de carga no puede dejar la pantalla en blanco: se muestra el mensaje
 * y un botón para volver a intentarlo.
 */
window.Fallo = {
  mostrar: function (destinoId, mensaje, alReintentar) {
    const caja = typeof destinoId === 'string' ? document.getElementById(destinoId) : destinoId;
    if (!caja) return;
    caja.textContent = (mensaje || 'No se pudo cargar.') + ' ';
    caja.className = 'msg mostrar error';
    if (typeof alReintentar !== 'function') return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn sm';
    boton.textContent = 'Reintentar';
    boton.addEventListener('click', function () {
      caja.className = 'msg';
      caja.textContent = '';
      alReintentar();
    });
    caja.appendChild(boton);
  },
};
