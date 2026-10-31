/**
 * elemento.js — crear un elemento (cámara, bomba, ascensor…) con su tipo y su ficha.
 */
(function () {
  'use strict';

  let tipos = [];
  let nodos = [];

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoElemento');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  function sugerirSegmento(nombre) {
    const limpio = String(nombre || '').toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9 ]/g, '')
      .split(/\s+/).filter(Boolean).map(function (p) { return p.charAt(0); }).join('');
    return (limpio || 'ELE').slice(0, 4).padEnd(3, 'X');
  }

  async function cargar() {
    const t = Sesion.token();
    const [rT, rN] = await Promise.all([
      API.llamar('tipos.listar', {}, { token: t }),
      API.llamar('nodos.arbol', {}, { token: t }),
    ]);
    if (rT.ok) tipos = rT.data.tipos || [];
    if (rN.ok) nodos = rN.data.nodos || [];
    pintarTipos();
    pintarPadres();
  }

  function pintarTipos() {
    const sel = document.getElementById('eleTipo');
    if (!sel) return;
    sel.textContent = '';
    const vacio = el('option', null, 'Selecciona un tipo…');
    vacio.value = '';
    sel.appendChild(vacio);
    tipos.forEach(function (t) {
      const op = el('option', null, t.nombre);
      op.value = t.id;
      sel.appendChild(op);
    });
  }

  function pintarPadres() {
    const sel = document.getElementById('elePadre');
    if (!sel) return;
    sel.textContent = '';
    nodos
      .filter(function (n) { return n.clase === 'AGRUPADOR'; })
      .sort(function (a, b) { return String(a.codigo).localeCompare(String(b.codigo)); })
      .forEach(function (n) {
        const op = el('option', null, n.codigo + ' · ' + n.nombre);
        op.value = n.id;
        sel.appendChild(op);
      });
  }

  function pintarFicha() {
    const tipoId = document.getElementById('eleTipo').value;
    const cont = document.getElementById('fichaElemento');
    if (!cont) return;
    cont.textContent = '';
    const tipo = tipos.filter(function (t) { return t.id === tipoId; })[0];
    if (!tipo) return;

    const nota = el('p', 'bajada-tarjeta');
    let texto = 'Ficha técnica del tipo ' + tipo.nombre + '.';
    if (tipo.plan) {
      texto += ' Plan sugerido: ' + tipo.plan.plantilla + ' (' + tipo.plan.frecuencia + ')';
      if (tipo.plan.obligatoria_legal) texto += ' · obligatorio por ' + tipo.plan.norma;
    }
    nota.textContent = texto;
    cont.appendChild(nota);

    (tipo.atributos || []).forEach(function (a) {
      const campo = el('div', 'campo');
      const lab = el('label', null, a.etiqueta + (a.obligatorio ? ' *' : ''));
      lab.htmlFor = 'ficha_' + a.clave;
      campo.appendChild(lab);

      let input;
      if (a.tipo === 'opcion') {
        input = el('select', 'item-input');
        const vacio = el('option', null, 'Selecciona…');
        vacio.value = '';
        input.appendChild(vacio);
        (a.opciones || []).forEach(function (o) {
          const op = el('option', null, o);
          op.value = o;
          input.appendChild(op);
        });
      } else {
        input = el('input', 'item-input');
        input.type = a.tipo === 'numero' ? 'number' : a.tipo === 'fecha' ? 'date' : 'text';
      }
      input.id = 'ficha_' + a.clave;
      input.dataset.clave = a.clave;
      campo.appendChild(input);
      cont.appendChild(campo);
    });
  }

  function preparar() {
    const form = document.getElementById('formElemento');
    if (!form) return;

    const nombre = document.getElementById('eleNombre');
    const segmento = document.getElementById('eleSegmento');
    nombre.addEventListener('input', function () {
      if (!segmento.dataset.tocado) segmento.value = sugerirSegmento(nombre.value);
    });
    segmento.addEventListener('input', function () { segmento.dataset.tocado = 'si'; });
    document.getElementById('eleTipo').addEventListener('change', pintarFicha);

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const boton = document.getElementById('btnCrearElemento');
      boton.disabled = true;

      const ficha = {};
      document.querySelectorAll('#fichaElemento [data-clave]').forEach(function (i) {
        if (i.value) ficha[i.dataset.clave] = i.type === 'number' ? Number(i.value) : i.value;
      });

      const r = await API.llamar('nodos.crear', {
        parent_id: document.getElementById('elePadre').value,
        clase: 'ELEMENTO',
        tipo_elemento_id: document.getElementById('eleTipo').value,
        segmento: segmento.value.trim().toUpperCase(),
        nombre: nombre.value.trim(),
        ficha_json: ficha,
      }, { token: Sesion.token(), idempotente: true });

      boton.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudo crear el elemento.', 'error');
      aviso('Elemento creado: ' + r.data.codigo + '. Ya aparece en el árbol con su ficha.', 'ok');
      nombre.value = '';
      segmento.value = '';
      segmento.dataset.tocado = '';
      document.getElementById('fichaElemento').textContent = '';
      await cargar();
      if (window.App) App.refrescar();
    });
  }

  window.Elementos = { cargar: cargar, preparar: preparar };
})();
