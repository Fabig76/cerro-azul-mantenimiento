/**
 * residentes.js — los reportes de daños que envían los residentes.
 * El administrador los convierte en novedad o los descarta, con motivo.
 */
(function () {
  'use strict';

  let reportes = [];

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoResidentes');
    if (!caja) return;
    caja.textContent = texto || '';
    caja.className = 'msg' + (texto ? ' mostrar ' + (tipo || 'ok') : '');
  }

  function hace(iso) {
    const t = new Date(String(iso)).getTime();
    if (isNaN(t)) return '';
    const horas = Math.floor((Date.now() - t) / 3600000);
    if (horas < 1) return 'hace menos de una hora';
    if (horas < 24) return 'hace ' + horas + (horas === 1 ? ' hora' : ' horas');
    const dias = Math.floor(horas / 24);
    return 'hace ' + dias + (dias === 1 ? ' día' : ' días');
  }

  async function cargar() {
    const cont = document.getElementById('listaResidentes');
    if (!cont) return;
    const r = await API.llamar('residentes.listar', { estado: 'POR_REVISAR' }, { token: Sesion.token() });
    if (!r.ok) {
      cont.textContent = '';
      cont.appendChild(el('div', 'vacio', r.message || 'No se pudieron cargar los reportes.'));
      return;
    }
    reportes = r.data.reportes || [];
    pintar();
  }

  function pintar() {
    const cont = document.getElementById('listaResidentes');
    if (!cont) return;
    cont.textContent = '';

    const tarjeta = document.getElementById('tarjetaResidentes');
    const insignia = document.getElementById('insigniaResidentes');
    if (insignia) {
      insignia.textContent = reportes.length ? String(reportes.length) : '';
      insignia.hidden = !reportes.length;
    }
    if (tarjeta) tarjeta.hidden = false;

    if (!reportes.length) {
      cont.appendChild(el('p', 'bajada-tarjeta', 'No hay reportes de residentes esperando revisión.'));
      return;
    }

    reportes.forEach(function (x) {
      const caja = el('article', 'residente-reporte');

      const cab = el('div', 'residente-cab');
      cab.appendChild(el('h3', null, x.nodo_nombre || 'Sección'));
      cab.appendChild(el('span', 'badge warn', hace(x.creado_en)));
      caja.appendChild(cab);

      caja.appendChild(el('p', 'residente-texto', x.descripcion));

      if (x.tiene_foto) {
        const figura = el('figure', 'residente-foto');
        const img = el('img', 'foto-mini');
        img.alt = 'Foto del reporte';
        img.loading = 'lazy';
        figura.appendChild(img);
        caja.appendChild(figura);
        miniaturizarReporte(img, x.id);
      }

      const acciones = el('div', 'residente-acciones');
      const convertir = el('button', 'btn primary sm', 'Convertir en novedad');
      convertir.type = 'button';
      convertir.addEventListener('click', function () { convertirEnNovedad(x, caja); });

      const descartar = el('button', 'btn sm', 'Descartar');
      descartar.type = 'button';
      descartar.addEventListener('click', function () { descartarReporte(x); });

      acciones.appendChild(convertir);
      acciones.appendChild(descartar);
      caja.appendChild(acciones);
      cont.appendChild(caja);
    });
  }

  function miniaturizarReporte(img, id) {
    const pedir = function () {
      return API.llamar('residentes.foto.get', { id: id, tam: 'mini' }, { token: Sesion.token() })
        .then(function (r) { return r.ok ? { base64: r.data.base64, mime: r.data.mime } : null; });
    };
    if (window.FotoCache) {
      FotoCache.configurar(function (tipo, datos) {
        return datos.tipo === 'residente' ? pedir() : null;
      });
      FotoCache.mostrar(img, { clave: 'residente:' + id, tipo: 'residente', id: id });
      return;
    }
    pedir().then(function (d) { if (d) img.src = 'data:' + d.mime + ';base64,' + d.base64; });
  }

  /** Convertir: pide los datos de la novedad y avisa de la foto. */
  function convertirEnNovedad(x, caja) {
    const form = el('div', 'residente-form');

    const titulo = el('input', 'item-input');
    titulo.value = 'Daño reportado por un residente';
    titulo.maxLength = 120;

    const gravedad = el('select', 'item-input');
    [['BAJA', 'Baja'], ['MEDIA', 'Media'], ['ALTA', 'Alta'], ['CRITICA', 'Crítica']].forEach(function (g) {
      const op = el('option', null, g[1]);
      op.value = g[0];
      if (g[0] === 'MEDIA') op.selected = true;
      gravedad.appendChild(op);
    });

    const adjuntar = el('input');
    adjuntar.type = 'checkbox';
    adjuntar.checked = true;
    const etiquetaAdjuntar = el('label', 'casilla-datos', null);
    etiquetaAdjuntar.appendChild(adjuntar);
    etiquetaAdjuntar.appendChild(el('span', null, 'Adjuntar la foto a la novedad'));

    const sinPersonas = el('input');
    sinPersonas.type = 'checkbox';
    const etiquetaSin = el('label', 'casilla-datos', null);
    etiquetaSin.appendChild(sinPersonas);
    etiquetaSin.appendChild(el('span', null, 'La foto no muestra personas, rostros ni placas'));

    const publicable = el('input');
    publicable.type = 'checkbox';
    const etiquetaPublica = el('label', 'casilla-datos', null);
    etiquetaPublica.appendChild(publicable);
    etiquetaPublica.appendChild(el('span', null, 'Publicar la novedad en el portal (sin la foto del residente)'));

    const guardar = el('button', 'btn primary sm', 'Crear la novedad');
    guardar.type = 'button';
    const cancelar = el('button', 'btn sm', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', function () { form.remove(); });

    guardar.addEventListener('click', async function () {
      guardar.disabled = true;
      const r = await API.llamar('residentes.convertir', {
        id: x.id,
        titulo: titulo.value.trim() || 'Daño reportado por un residente',
        tipo: 'DANO',
        gravedad: gravedad.value,
        publicable: publicable.checked,
        adjuntar_foto: adjuntar.checked,
        foto_sin_personas: sinPersonas.checked,
      }, { token: Sesion.token(), idempotente: true });
      guardar.disabled = false;
      if (!r.ok) { aviso(r.message || 'No se pudo crear la novedad.', 'error'); return; }
      aviso('Novedad creada.', 'ok');
      if (window.Novedades) Novedades.cargar();
      cargar();
    });

    form.appendChild(el('label', 'campo', 'Título de la novedad'));
    form.lastChild.appendChild(titulo);
    form.appendChild(el('label', 'campo', 'Gravedad'));
    form.lastChild.appendChild(gravedad);
    form.appendChild(etiquetaAdjuntar);
    form.appendChild(etiquetaSin);
    form.appendChild(etiquetaPublica);
    const botones = el('div', 'residente-acciones');
    botones.appendChild(guardar);
    botones.appendChild(cancelar);
    form.appendChild(botones);

    caja.appendChild(form);
    titulo.focus();
  }

  async function descartarReporte(x) {
    const motivo = window.prompt('¿Por qué se descarta? (queda interno, no lo ve el residente)');
    if (!motivo || motivo.trim().length < 10) {
      if (motivo !== null) aviso('Escribe al menos 10 caracteres.', 'error');
      return;
    }
    const r = await API.llamar('residentes.descartar', { id: x.id, motivo: motivo.trim() },
      { token: Sesion.token(), idempotente: true });
    if (!r.ok) { aviso(r.message || 'No se pudo descartar.', 'error'); return; }
    aviso('Reporte descartado. La foto se borra a los 30 días.', 'ok');
    cargar();
  }

  window.Residentes = { cargar: cargar };
})();
