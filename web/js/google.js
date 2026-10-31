/**
 * google.js — ingreso con Google Identity Services.
 * Solo se activa si config.js trae GOOGLE_CLIENT_ID; si no, el botón queda deshabilitado.
 */
(function () {
  'use strict';

  function onCredencial(respuesta, alEntrar) {
    if (!respuesta || !respuesta.credential) {
      alEntrar(false);
      return;
    }
    API.llamar('auth.google', { idToken: respuesta.credential }).then(function (r) {
      if (!r.ok) {
        const el = document.getElementById('avisoLogin');
        if (el) {
          el.textContent = r.message || 'No pudimos validar tu cuenta de Google.';
          el.className = 'msg show error';
        }
        alEntrar(false);
        return;
      }
      alEntrar(true, r.data);
    });
  }

  window.Google = {
    /** Devuelve true si el botón quedó montado. */
    montar: function (contenedor, alEntrar) {
      if (!window.CFG || !window.CFG.GOOGLE_CLIENT_ID) return false;
      if (!window.google || !google.accounts || !google.accounts.id) return false;
      google.accounts.id.initialize({
        client_id: window.CFG.GOOGLE_CLIENT_ID,
        callback: function (r) { onCredencial(r, alEntrar); },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: 'popup',
      });
      google.accounts.id.renderButton(contenedor, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'es', width: 320,
      });
      return true;
    },
  };
})();
