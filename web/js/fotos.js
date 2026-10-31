/**
 * fotos.js — compresión en el celular antes de subir (SPEC v1.2, sec. 7.4).
 * Genera la principal (1600 px) y la miniatura (640 px) como data URL.
 */
(function () {
  'use strict';

  function leerArchivo(file) {
    return new Promise(function (ok, mal) {
      const lector = new FileReader();
      lector.onload = function () { ok(lector.result); };
      lector.onerror = mal;
      lector.readAsDataURL(file);
    });
  }

  function cargarImagen(dataUrl) {
    return new Promise(function (ok, mal) {
      const img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = mal;
      img.src = dataUrl;
    });
  }

  function escalar(img, ladoMayor, calidad) {
    const escala = Math.min(1, ladoMayor / Math.max(img.width, img.height));
    const ancho = Math.round(img.width * escala);
    const alto = Math.round(img.height * escala);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext('2d').drawImage(img, 0, 0, ancho, alto);
    const dataUrl = lienzo.toDataURL('image/jpeg', calidad);
    return { dataUrl: dataUrl, base64: dataUrl.split(',')[1] || '', ancho: ancho, alto: alto };
  }

  async function sha256(base64) {
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    } catch (e) {
      return '';
    }
  }

  /** Comprime un File y devuelve {base64, base64_mini, sha256, kb}. */
  async function preparar(file) {
    const dataUrl = await leerArchivo(file);
    const img = await cargarImagen(dataUrl);
    const principal = escalar(img, 1600, 0.7);
    const mini = escalar(img, 640, 0.5);
    return {
      base64: principal.base64,
      base64_mini: mini.base64,
      sha256: await sha256(principal.base64),
      kb: Math.round((principal.base64.length * 0.75) / 1024),
      kb_mini: Math.round((mini.base64.length * 0.75) / 1024),
    };
  }

  window.Fotos = { preparar: preparar };
})();
