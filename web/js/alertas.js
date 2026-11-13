/**
 * alertas.js — el administrador publica avisos para los propietarios.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoAlerta');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  const NIVEL = { CRITICA: 'danger', URGENTE: 'danger', AVISO: 'warn', INFO: '' };

  async function cargar() {
    const r = await API.llamar('alertas.listar', {}, { token: Sesion.token() });
    if (!r.ok) {
      if (window.Fallo) Fallo.mostrar('listaAlertas', r.message, cargar);
      return;
    }
    const cont = document.getElementById('listaAlertas');
    if (!cont) return;
    cont.textContent = '';
    const lista = r.data.alertas || [];
    if (!lista.length) {
      cont.appendChild(el('div', 'vacio', 'No hay alertas. Las que publique aparecerán en la portada pública.'));
      return;
    }
    lista.forEach(function (a) {
      const caja = el('article', 'novedad ' + (a.nivel === 'CRITICA' ? 'critica' : a.nivel === 'URGENTE' ? 'alta' : 'baja'));
      const cab = el('div', 'novedad-cab');
      cab.appendChild(el('h3', null, a.titulo));
      const marcas = el('div', 'usuario-marcas');
      marcas.appendChild(el('span', 'badge ' + (NIVEL[a.nivel] || 'gray'), a.nivel));
      marcas.appendChild(el('span', 'badge ' + (a.estado === 'CERRADA' ? 'gray' : a.estado === 'BORRADOR' ? 'gray' : 'ok'), a.estado));
      cab.appendChild(marcas);
      caja.appendChild(cab);
      if (a.mensaje) caja.appendChild(el('p', null, a.mensaje));

      if (a.estado === 'BORRADOR') {
        const pub = el('button', 'btn sm', 'Publicar');
        pub.type = 'button';
        pub.addEventListener('click', async function () {
          pub.disabled = true;
          const x = await API.llamar('alertas.publicar', { id: a.id }, { token: Sesion.token(), idempotente: true });
          pub.disabled = false;
          if (!x.ok) return aviso(x.message || 'No se pudo publicar.', 'error');
          aviso('Alerta publicada: ya sale en la portada.', 'ok');
          cargar();
        });
        caja.appendChild(pub);
      }

      if (a.estado === 'PUBLICADA' || a.estado === 'ACTUALIZADA') {
        const cerrar = el('button', 'btn sm', 'Cerrar alerta');
        cerrar.type = 'button';
        cerrar.addEventListener('click', async function () {
          const txt = window.prompt('Mensaje final (por ejemplo: "Servicio restablecido el 3 de noviembre a las 15:00")');
          if (!txt || txt.trim().length < 5) return;
          cerrar.disabled = true;
          const x = await API.llamar('alertas.cerrar', { id: a.id, mensaje: txt.trim() }, { token: Sesion.token(), idempotente: true });
          cerrar.disabled = false;
          if (!x.ok) return aviso(x.message || 'No se pudo cerrar.', 'error');
          aviso('Alerta cerrada y retirada de la portada.', 'ok');
          cargar();
        });
        caja.appendChild(cerrar);
      }
      cont.appendChild(caja);
    });
  }

  function preparar() {
    const form = document.getElementById('formAlerta');
    if (!form) return;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const boton = document.getElementById('btnCrearAlerta');
      boton.disabled = true;
      const r = await API.llamar('alertas.guardar', {
        nivel: document.getElementById('aleNivel').value,
        categoria: document.getElementById('aleCategoria').value,
        titulo: document.getElementById('aleTitulo').value.trim(),
        mensaje: document.getElementById('aleMensaje').value.trim(),
        fin: document.getElementById('aleFin').value,
      }, { token: Sesion.token(), idempotente: true });
      boton.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudo crear.', 'error');
      aviso('Alerta creada como borrador. Publíquela para que la vean los propietarios.', 'ok');
      document.getElementById('aleTitulo').value = '';
      document.getElementById('aleMensaje').value = '';
      cargar();
    });
  }

  window.Alertas = { cargar: cargar, preparar: preparar };
})();
