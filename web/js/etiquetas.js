/**
 * etiquetas.js — hoja de etiquetas QR de una sección y todo lo que cuelga de ella.
 * Solo con sesión de administrador.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function urlDe(nodoId) {
    return 'https://fabig76.github.io/cerro-azul-mantenimiento/index.html#/equipo/' + nodoId;
  }

  function dentroDelArbol(nodo, raiz) {
    if (!raiz) return true;
    const ruta = String(nodo.ruta_ids || '') + '/' + nodo.id;
    const raizRuta = String(raiz.ruta_ids || '') + '/' + raiz.id;
    return ruta === raizRuta || ruta.indexOf(raizRuta + '/') === 0;
  }

  async function cargar() {
    const hoja = document.getElementById('hoja');
    const aviso = document.getElementById('avisoEtiquetas');
    const sub = document.getElementById('subtituloEtiquetas');
    if (!hoja) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('n');

    if (!Sesion.token()) {
      aviso.textContent = 'Necesita iniciar sesión como administrador en el panel y volver a abrir esta página.';
      return;
    }

    const r = await API.llamar('nodos.arbol', {}, { token: Sesion.token() });
    if (!r.ok) {
      aviso.textContent = r.message || 'No se pudieron cargar las secciones.';
      return;
    }

    const nodos = r.data.nodos || [];
    const raiz = id ? nodos.filter(function (n) { return String(n.id) === String(id); })[0] : null;
    const equipo = params.get('equipo');

    let lista = nodos.filter(function (n) { return dentroDelArbol(n, raiz); });
    if (equipo) lista = lista.filter(function (n) { return String(n.id) === String(equipo); });

    aviso.remove();
    if (sub) {
      sub.textContent = (raiz ? raiz.codigo + ' · ' + raiz.nombre : 'Todo el conjunto') +
        ' · ' + lista.length + ' etiqueta(s)';
    }

    const cont = el('div', 'hoja-etiquetas');
    lista.forEach(function (n) {
      const caja = el('article', 'etiqueta');
      const svg = QR.svg(urlDe(n.id), { modulo: 4, margen: 2 });
      if (svg) caja.appendChild(svg);

      if (n.sensible) {
        // Un equipo sensible no lleva nombre ni código: solo dónde pegarla.
        caja.appendChild(el('div', 'marca', 'Cerro Azul'));
        caja.appendChild(el('div', 'nombre', 'Mantenimiento'));
        caja.appendChild(el('div', 'pie', '…' + String(n.id).slice(-4)));
      } else {
        caja.appendChild(el('div', 'codigo', n.codigo));
        caja.appendChild(el('div', 'nombre', n.nombre));
        caja.appendChild(el('div', 'pie', 'Escanee para ver el estado o reportar un daño'));
      }
      cont.appendChild(caja);
    });
    hoja.appendChild(cont);

    const imprimir = document.getElementById('btnImprimir');
    if (imprimir) imprimir.addEventListener('click', function () { window.print(); });
  }

  window.addEventListener('DOMContentLoaded', cargar);
})();
