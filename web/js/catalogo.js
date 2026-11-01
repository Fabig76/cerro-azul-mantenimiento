/**
 * catalogo.js — tipos de elemento y sus plantillas, sin tocar código.
 */
(function () {
  'use strict';

  let tipos = [];
  let plantillas = [];

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoCatalogo');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  async function cargar() {
    const t = Sesion.token();
    const [rT, rP] = await Promise.all([
      API.llamar('tipos.listar', {}, { token: t }),
      API.llamar('plantillas.listar', {}, { token: t }),
    ]);
    if (rT.ok) tipos = rT.data.tipos || [];
    if (rP.ok) plantillas = rP.data.plantillas || [];
    pintarTipos();
    pintarPlantillas();
    pintarSelectTipo();
  }

  function pintarSelectTipo() {
    const sel = document.getElementById('plaTipo');
    if (!sel) return;
    const valor = sel.value;
    sel.textContent = '';
    tipos.forEach(function (t) {
      const op = el('option', null, t.nombre);
      op.value = t.id;
      sel.appendChild(op);
    });
    if (valor) sel.value = valor;
  }

  function pintarTipos() {
    const cont = document.getElementById('listaTipos');
    if (!cont) return;
    cont.textContent = '';
    if (!tipos.length) {
      cont.appendChild(el('div', 'vacio', 'Sin tipos.'));
      return;
    }
    tipos.forEach(function (t) {
      const caja = el('article', 'novedad ' + (t.sensible ? 'alta' : 'baja'));
      const cab = el('div', 'novedad-cab');
      cab.appendChild(el('h3', null, t.nombre));
      const marcas = el('div', 'usuario-marcas');
      if (t.sensible) marcas.appendChild(el('span', 'badge warn', 'sensible'));
      marcas.appendChild(el('span', 'badge gray', (t.atributos || []).length + ' campos'));
      marcas.appendChild(el('span', 'badge gray', (t.condiciones || []).length + ' estados'));
      cab.appendChild(marcas);
      caja.appendChild(cab);
      if (t.plan) {
        caja.appendChild(el('p', null, 'Plan: ' + (t.plan.plantilla || '—') + ' · ' + (t.plan.frecuencia || '—')));
      }
      cont.appendChild(caja);
    });
  }

  function pintarPlantillas() {
    const cont = document.getElementById('listaPlantillas');
    if (!cont) return;
    cont.textContent = '';
    if (!plantillas.length) {
      cont.appendChild(el('div', 'vacio', 'Sin plantillas.'));
      return;
    }
    plantillas.forEach(function (p) {
      const caja = el('article', 'novedad');
      const cab = el('div', 'novedad-cab');
      cab.appendChild(el('h3', null, p.nombre));
      const marcas = el('div', 'usuario-marcas');
      marcas.appendChild(el('span', 'badge', 'v' + p.version));
      marcas.appendChild(el('span', 'badge gray', p.items + ' ítems'));
      marcas.appendChild(el('span', 'badge gray', p.metodo_avance));
      cab.appendChild(marcas);
      caja.appendChild(cab);
      if (p.norma) caja.appendChild(el('p', null, p.norma));
      cont.appendChild(caja);
    });
  }

  function preparar() {
    const formTipo = document.getElementById('formTipo');
    if (formTipo) {
      formTipo.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const nombre = document.getElementById('tipNombre').value.trim();
        const atributos = document.getElementById('tipAtributos').value.split('\n')
          .map(function (l) { return l.trim(); }).filter(Boolean)
          .map(function (l) {
            const p = l.split('|').map(function (x) { return x.trim(); });
            return { clave: p[0], etiqueta: p[1] || p[0], tipo: p[2] || 'texto', obligatorio: false };
          });
        const condiciones = document.getElementById('tipCondiciones').value.split('\n')
          .map(function (l) { return l.trim(); }).filter(Boolean)
          .map(function (l) {
            const p = l.split('|').map(function (x) { return x.trim(); });
            return { valor: p[0], nivel: (p[1] || 'OK').toUpperCase() };
          });
        const r = await API.llamar('tipos.guardar', {
          nombre: nombre, atributos: atributos, condiciones: condiciones,
          sensible_default: document.getElementById('tipSensible').checked,
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) return aviso(r.message || 'No se pudo crear el tipo.', 'error');
        aviso('Tipo creado: ' + nombre + '. Ya está disponible al crear un elemento.', 'ok');
        document.getElementById('tipNombre').value = '';
        document.getElementById('tipAtributos').value = '';
        document.getElementById('tipCondiciones').value = '';
        cargar();
      });
    }

    const formPla = document.getElementById('formPlantilla');
    if (formPla) {
      formPla.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const items = document.getElementById('plaItems').value.split('\n')
          .map(function (l) { return l.trim(); }).filter(Boolean)
          .map(function (l) {
            const p = l.split('|').map(function (x) { return x.trim(); });
            return {
              grupo: p[0] || 'General',
              pregunta: p[1] || p[0],
              tipo_respuesta: (p[2] || 'SI_NO').toUpperCase(),
              peso: Number(p[3]) || 1,
              requiere_foto: (p[4] || '').toLowerCase() === 'foto',
            };
          });
        const r = await API.llamar('plantillas.guardar', {
          nombre: document.getElementById('plaNombre').value.trim(),
          tipo_elemento_id: document.getElementById('plaTipo').value,
          metodo_avance: document.getElementById('plaMetodo').value,
          norma_referencia: document.getElementById('plaNorma').value.trim(),
          items: items,
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) return aviso(r.message || 'No se pudo guardar la plantilla.', 'error');
        aviso('Plantilla guardada en la versión ' + r.data.version + ' con ' + r.data.items + ' ítems.', 'ok');
        document.getElementById('plaItems').value = '';
        cargar();
      });
    }
  }

  window.Catalogo = { cargar: cargar, preparar: preparar };
})();
