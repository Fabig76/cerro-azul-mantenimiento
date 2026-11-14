/**
 * reporte.js — un residente reporta un daño y consulta su código.
 *
 * Se carga solo cuando se abre #/reportar o #/consulta, para no pesar la portada.
 * Sin datos personales: el reporte es anónimo y el código es lo único que lo liga.
 */
(function () {
  'use strict';

  let abiertoEn = 0;

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function dispositivo() {
    try {
      let id = localStorage.getItem('ca_dispositivo');
      if (!id) {
        id = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('ca_dispositivo', id);
      }
      return id;
    } catch (e) {
      return '';
    }
  }

  async function leerComoBase64(archivo) {
    return new Promise(function (resolver, rechazar) {
      const lector = new FileReader();
      lector.onload = function () {
        const t = String(lector.result || '');
        resolver(t.indexOf(',') >= 0 ? t.split(',')[1] : t);
      };
      lector.onerror = function () { rechazar(new Error('No se pudo leer la foto.')); };
      lector.readAsDataURL(archivo);
    });
  }

  /** Pinta el formulario de reporte dentro del contenedor. */
  function montarReporte(cont, nodoId) {
    cont.textContent = '';
    abiertoEn = Date.now();

    cont.appendChild(el('h2', null, 'Reportar un daño'));
    cont.appendChild(el('p', 'lead',
      'No le pedimos nombre, teléfono ni apartamento. Con la foto y lo que cuente es suficiente.'));

    const sel = el('select', 'item-input');
    sel.id = 'repNodo';
    const secciones = (window.__seccionesPublicas || []);
    secciones.forEach(function (s) {
      const op = el('option', null, s.nombre);
      op.value = s.id;
      if (nodoId && String(s.id) === String(nodoId)) op.selected = true;
      sel.appendChild(op);
    });

    const texto = el('textarea', 'item-input');
    texto.id = 'repTexto';
    texto.rows = 4;
    texto.maxLength = 500;
    texto.placeholder = '¿Qué pasó? Desde cuándo, dónde está.';

    const foto = el('input');
    foto.type = 'file';
    foto.accept = 'image/*';
    foto.setAttribute('capture', 'environment');
    foto.className = 'oculto';
    foto.id = 'repFoto';

    let preparada = null;
    const elegir = el('button', 'btn', 'Tomar o elegir foto');
    elegir.type = 'button';
    const ver = el('div', 'reporte-foto');
    const quitar = el('button', 'btn sm oculto', 'Quitar la foto');
    quitar.type = 'button';

    elegir.addEventListener('click', function () { foto.click(); });
    quitar.addEventListener('click', function () {
      preparada = null;
      foto.value = '';
      ver.textContent = '';
      quitar.classList.add('oculto');
      elegir.classList.remove('oculto');
      enviar.disabled = true;
    });

    foto.addEventListener('change', async function () {
      const archivo = foto.files && foto.files[0];
      if (!archivo) return;
      elegir.disabled = true;
      elegir.textContent = 'Preparando la foto…';
      try {
        preparada = await Fotos.preparar(archivo);
        ver.textContent = '';
        const img = document.createElement('img');
        img.src = 'data:image/jpeg;base64,' + preparada.base64_mini;
        img.alt = 'Foto del daño';
        img.className = 'foto-mini';
        ver.appendChild(img);
        ver.appendChild(el('p', 'foto-pie', 'Foto lista (' + preparada.kb + ' KB)'));
        elegir.classList.add('oculto');
        quitar.classList.remove('oculto');
        enviar.disabled = false;
      } catch (e) {
        ver.textContent = 'No se pudo preparar la foto. Intente con otra.';
      }
      elegir.disabled = false;
      elegir.textContent = 'Tomar o elegir foto';
    });

    const trampa = el('input');
    trampa.type = 'text';
    trampa.name = 'sitio_web';
    trampa.tabIndex = -1;
    trampa.autocomplete = 'off';
    trampa.className = 'campo-trampa';
    trampa.setAttribute('aria-hidden', 'true');

    const enviar = el('button', 'btn primary bloque', 'Enviar reporte');
    enviar.type = 'button';
    enviar.disabled = true;   // sin foto no se activa

    const aviso = el('div', 'msg');
    aviso.id = 'avisoReporte';

    const resultado = el('div', 'reporte-resultado oculto');

    enviar.addEventListener('click', async function () {
      if (!preparada) return;
      const descripcion = texto.value.trim();
      if (descripcion.length < 15) {
        aviso.className = 'msg mostrar error';
        aviso.textContent = 'Cuente un poco más qué pasó (al menos 15 caracteres).';
        return;
      }
      enviar.disabled = true;
      enviar.textContent = 'Enviando…';
      aviso.className = 'msg';

      try {
        const url = window.CFG.API_URL + '?action=residentes.reportar';
        const respuesta = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'residentes.reportar',
            payload: {
              nodo_id: sel.value,
              descripcion: descripcion,
              base64: preparada.base64,
              base64_mini: preparada.base64_mini,
              dispositivo: dispositivo(),
              trampa: trampa.value,
              abierto_en: abiertoEn,
            },
          }),
          redirect: 'follow',
        });
        const d = await respuesta.json();
        if (!d.ok) throw new Error(d.message || 'No se pudo enviar el reporte.');

        cont.textContent = '';
        cont.appendChild(el('h2', null, 'Reporte recibido'));
        const codigo = el('p', 'reporte-codigo', d.data.codigo_consulta);
        cont.appendChild(el('p', null, 'Su código es:'));
        cont.appendChild(codigo);
        cont.appendChild(el('p', 'lead', 'Guárdelo para consultar el estado en esta misma página.'));
        const copiar = el('button', 'btn', 'Copiar código');
        copiar.type = 'button';
        copiar.addEventListener('click', function () {
          if (navigator.clipboard) navigator.clipboard.writeText(d.data.codigo_consulta);
          copiar.textContent = 'Copiado';
        });
        cont.appendChild(copiar);
        const consultar = el('a', 'btn', 'Consultar el estado');
        consultar.href = '#/consulta';
        cont.appendChild(consultar);
      } catch (e) {
        aviso.className = 'msg mostrar error';
        aviso.textContent = e.message || 'No se pudo enviar. Revise la conexión e intente otra vez.';
        enviar.disabled = false;
        enviar.textContent = 'Enviar reporte';
      }
    });

    const caja = el('div', 'reporte-form');
    caja.appendChild(el('label', 'campo', 'Sección'));
    caja.lastChild.appendChild(sel);
    caja.appendChild(el('label', 'campo', '¿Qué pasó?'));
    caja.lastChild.appendChild(texto);
    caja.appendChild(elegir);
    caja.appendChild(foto);
    caja.appendChild(quitar);
    caja.appendChild(ver);
    caja.appendChild(el('p', 'bajada', 'No incluya personas ni placas en la foto.'));
    caja.appendChild(trampa);
    caja.appendChild(enviar);
    caja.appendChild(aviso);
    cont.appendChild(caja);
  }

  /** Pinta la consulta por código. */
  function montarConsulta(cont) {
    cont.textContent = '';
    cont.appendChild(el('h2', null, 'Consultar un reporte'));

    const campo = el('input', 'item-input');
    campo.id = 'consultaCodigo';
    campo.maxLength = 6;
    campo.placeholder = 'R7K2QM';
    campo.style.textTransform = 'uppercase';

    const boton = el('button', 'btn primary', 'Consultar');
    boton.type = 'button';
    const salida = el('div', 'msg');
    salida.id = 'resultadoConsulta';

    boton.addEventListener('click', async function () {
      const codigo = String(campo.value || '').trim().toUpperCase();
      if (codigo.length !== 6) {
        salida.className = 'msg mostrar error';
        salida.textContent = 'El código tiene 6 caracteres.';
        return;
      }
      boton.disabled = true;
      salida.className = 'msg';
      salida.textContent = 'Consultando…';
      try {
        const url = window.CFG.API_URL + '?action=public.reporte&codigo=' + encodeURIComponent(codigo);
        const r = await fetch(url, { redirect: 'follow' });
        const d = await r.json();
        const estado = d.ok ? d.data.estado : 'NO_ENCONTRADO';
        const FRASES = {
          RECIBIDO: 'Recibido. La administración lo revisará.',
          EN_ATENCION: 'En atención. Ya se está trabajando en el daño.',
          ATENDIDO: 'Atendido. El daño quedó resuelto.',
          REVISADO: 'Revisado por la administración.',
          NO_ENCONTRADO: 'No encontramos ese código.',
        };
        salida.className = 'msg mostrar info';
        salida.textContent = FRASES[estado] || FRASES.NO_ENCONTRADO;
      } catch (e) {
        salida.className = 'msg mostrar error';
        salida.textContent = 'No se pudo consultar. Revise la conexión.';
      }
      boton.disabled = false;
    });

    const caja = el('div', 'reporte-form');
    caja.appendChild(el('label', 'campo', 'Código'));
    caja.lastChild.appendChild(campo);
    caja.appendChild(boton);
    caja.appendChild(salida);
    cont.appendChild(caja);
  }

  window.Reporte = { montarReporte: montarReporte, montarConsulta: montarConsulta };
})();
