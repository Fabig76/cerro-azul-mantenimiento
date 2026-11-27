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

  function tamanoKB(imagen) {
    return (imagen.base64.length * 0.75) / 1024;
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

    // La miniatura debe caber en la caché del servidor: se recodifica hasta bajar de 50 KB.
    let mini = escalar(img, 640, 0.5);
    if (tamanoKB(mini) > 50) mini = escalar(img, 640, 0.4);
    if (tamanoKB(mini) > 50) mini = escalar(img, 560, 0.4);
    if (tamanoKB(mini) > 55) mini = escalar(img, 480, 0.35);
    return {
      base64: principal.base64,
      base64_mini: mini.base64,
      sha256: await sha256(principal.base64),
      kb: Math.round((principal.base64.length * 0.75) / 1024),
      kb_mini: Math.round(tamanoKB(mini)),
    };
  }

  /**
   * Dos botones para una foto: «Tomar foto» abre la cámara y «Elegir de la galería» abre las
   * fotos guardadas en el teléfono. Con `capture` el teléfono va directo a la cámara y no deja
   * escoger una foto ya tomada; por eso cada camino tiene su propio campo.
   *
   * opciones: { camara, galeria, clase, alElegir(file) }
   * Devuelve { caja, ocupar(texto), liberar(), ocultar(), mostrar() }.
   */
  function selector(opciones) {
    const o = opciones || {};
    const caja = document.createElement('div');
    caja.className = 'elegir-foto';
    const textos = [o.camara || 'Tomar foto', o.galeria || 'Elegir de la galería'];
    const botones = textos.map(function (texto, i) {
      const campo = document.createElement('input');
      campo.type = 'file';
      campo.accept = 'image/*';
      if (i === 0) campo.setAttribute('capture', 'environment');
      campo.className = 'oculto';

      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = i === 0 ? (o.clase || 'btn') : String(o.clase || 'btn').replace(/\bprimary\b/, '').trim();
      boton.textContent = texto;
      boton.addEventListener('click', function () { campo.click(); });
      campo.addEventListener('change', function () {
        const file = campo.files && campo.files[0];
        campo.value = '';   // permite volver a elegir la misma foto si la subida falló
        if (file && o.alElegir) o.alElegir(file);
      });
      caja.appendChild(boton);
      caja.appendChild(campo);
      return boton;
    });
    return {
      caja: caja,
      ocupar: function (texto) {
        botones.forEach(function (b) { b.disabled = true; });
        botones[0].textContent = texto;
        botones[1].classList.add('oculto');
      },
      liberar: function () {
        botones.forEach(function (b, i) { b.disabled = false; b.textContent = textos[i]; });
        botones[1].classList.remove('oculto');
      },
      ocultar: function () { caja.classList.add('oculto'); },
      mostrar: function () { caja.classList.remove('oculto'); },
    };
  }

  window.Fotos = { preparar: preparar, selector: selector };
})();
