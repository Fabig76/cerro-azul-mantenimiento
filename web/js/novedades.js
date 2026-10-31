/**
 * novedades.js — reportar daños y fallas desde el portal.
 */
(function () {
  'use strict';

  let nodos = [];

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoNovedad');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  const GRAVEDAD = { BAJA: 'gray', MEDIA: 'warn', ALTA: 'danger', CRITICA: 'danger' };
  const TIPO = { DANO: 'Daño', FALLA: 'Falla', RIESGO: 'Riesgo', OBSERVACION: 'Observación' };

  async function cargar() {
    const t = Sesion.token();
    const [rN, rNov] = await Promise.all([
      API.llamar('nodos.arbol', {}, { token: t }),
      API.llamar('novedades.listar', {}, { token: t }),
    ]);
    if (rN.ok) nodos = rN.data.nodos || [];
    pintarSelects();
    if (rNov.ok) pintarLista(rNov.data.novedades || [], rNov.data.abiertas || 0);
  }

  function pintarSelects() {
    const sel = document.getElementById('novNodo');
    if (!sel) return;
    sel.textContent = '';
    nodos
      .slice()
      .sort(function (a, b) { return String(a.codigo).localeCompare(String(b.codigo)); })
      .forEach(function (n) {
        const op = el('option', null, n.codigo + ' · ' + n.nombre);
        op.value = n.id;
        sel.appendChild(op);
      });
  }

  function pintarLista(lista, abiertas) {
    const cont = document.getElementById('listaNovedades');
    if (!cont) return;
    cont.textContent = '';
    const conteo = document.getElementById('conteoNovedades');
    if (conteo) conteo.textContent = abiertas + ' abierta(s)';

    if (!lista.length) {
      cont.appendChild(el('div', 'vacio', 'No hay novedades reportadas.'));
      return;
    }

    lista.slice(0, 12).forEach(function (n) {
      const caja = el('article', 'novedad ' + String(n.gravedad).toLowerCase());
      const cab = el('div', 'novedad-cab');
      cab.appendChild(el('h3', null, n.titulo));

      const marcas = el('div', 'usuario-marcas');
      const g = el('span', 'badge ' + (GRAVEDAD[n.gravedad] || 'gray'), n.gravedad);
      const e = el('span', 'badge ' + (n.estado === 'RESUELTA' ? 'ok' : 'warn'), n.estado.replace('_', ' '));
      marcas.appendChild(g);
      marcas.appendChild(e);
      cab.appendChild(marcas);
      caja.appendChild(cab);

      const meta = el('p', null,
        (n.nodo ? n.nodo.codigo + ' · ' : '') + (TIPO[n.tipo] || n.tipo) + ' · ' + n.fecha_deteccion);
      caja.appendChild(meta);

      if (n.descripcion) caja.appendChild(el('p', null, n.descripcion));

      if (n.estado !== 'RESUELTA' && (window.__rol === 'ADMIN' || window.__rol === 'SUPERVISOR')) {
        const btn = el('button', 'btn sm', 'Marcar resuelta');
        btn.type = 'button';
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          const r = await API.llamar('novedades.resolver', { id: n.id }, { token: Sesion.token(), idempotente: true });
          btn.disabled = false;
          if (!r.ok) return aviso(r.message || 'No se pudo resolver.', 'error');
          aviso('Novedad resuelta. El semáforo del equipo se recalculó.', 'ok');
          cargar();
        });
        caja.appendChild(btn);
      }
      cont.appendChild(caja);
    });
  }

  function preparar() {
    const form = document.getElementById('formNovedad');
    if (!form) return;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const boton = document.getElementById('btnCrearNovedad');
      boton.disabled = true;
      const r = await API.llamar('novedades.crear', {
        nodo_id: document.getElementById('novNodo').value,
        titulo: document.getElementById('novTitulo').value.trim(),
        tipo: document.getElementById('novTipo').value,
        gravedad: document.getElementById('novGravedad').value,
        descripcion: document.getElementById('novDescripcion').value.trim(),
      }, { token: Sesion.token(), idempotente: true });
      boton.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudo reportar.', 'error');
      aviso('Novedad reportada. La administración ya la ve.', 'ok');
      document.getElementById('novTitulo').value = '';
      document.getElementById('novDescripcion').value = '';
      cargar();
    });
  }

  window.Novedades = { cargar: cargar, preparar: preparar };
})();
