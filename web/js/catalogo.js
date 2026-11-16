/**
 * catalogo.js — tipos de elemento y sus plantillas, sin tocar código.
 */
(function () {
  'use strict';

  let tipos = [];
  let plantillas = [];
  let leerEtapasPlantilla = null;

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
      Datos.obtener('tipos.listar', t),
      Datos.obtener('plantillas.listar', t),
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

  function montarEtapasPlantilla(iniciales) {
    const cont = document.getElementById('etapasPlantilla');
    if (!cont || !window.Etapas) return;
    cont.textContent = '';
    leerEtapasPlantilla = window.Etapas.crear(cont, iniciales || []);
  }

  /**
   * K1 · Editor de la lista de chequeo por filas. Mantiene el textarea #plaItems
   * sincronizado, así el guardado sigue igual que antes (menos riesgo).
   */
  const ITEM_TIPOS = [['SI_NO', 'Sí / No'], ['NUMERO', 'Número'], ['TEXTO', 'Texto'], ['FOTO', 'Solo foto']];
  let filasChecklist = [];

  function sincronizarChecklist() {
    const area = document.getElementById('plaItems');
    if (!area) return;
    area.value = filasChecklist
      .filter(function (f) { return String(f.pregunta || '').trim(); })
      .map(function (f) {
        return [f.grupo || 'General', f.pregunta.trim(), f.tipo, Number(f.peso) || 1,
          f.foto ? 'foto' : ''].join(' | ').replace(/ \| $/, '');
      }).join('\n');
    pintarVistaPrevia();
  }

  function pintarEditorChecklist() {
    const cont = document.getElementById('editorChecklist');
    if (!cont) return;
    cont.textContent = '';

    if (!filasChecklist.length) {
      cont.appendChild(el('p', 'bajada-tarjeta', 'Todavía no hay preguntas.'));
    }

    filasChecklist.forEach(function (fila, i) {
      const caja = el('div', 'fila-checklist');

      const grupo = el('input', 'item-input chico');
      grupo.placeholder = 'Grupo';
      grupo.value = fila.grupo || '';
      grupo.addEventListener('input', function () { fila.grupo = grupo.value; sincronizarChecklist(); });

      const pregunta = el('input', 'item-input');
      pregunta.placeholder = 'Pregunta (ej. Paneles limpios y sin sombras)';
      pregunta.value = fila.pregunta || '';
      pregunta.addEventListener('input', function () { fila.pregunta = pregunta.value; sincronizarChecklist(); });

      const tipo = el('select', 'item-input chico');
      ITEM_TIPOS.forEach(function (t) {
        const op = el('option', null, t[1]);
        op.value = t[0];
        if (t[0] === fila.tipo) op.selected = true;
        tipo.appendChild(op);
      });
      tipo.addEventListener('change', function () { fila.tipo = tipo.value; sincronizarChecklist(); });

      const peso = el('input', 'item-input chico');
      peso.type = 'number';
      peso.min = '1';
      peso.max = '5';
      peso.value = String(fila.peso || 1);
      peso.title = 'Peso';
      peso.addEventListener('input', function () { fila.peso = Number(peso.value) || 1; sincronizarChecklist(); });

      const foto = el('label', 'etiqueta-casilla');
      const casilla = el('input');
      casilla.type = 'checkbox';
      casilla.checked = !!fila.foto;
      casilla.addEventListener('change', function () { fila.foto = casilla.checked; sincronizarChecklist(); });
      foto.appendChild(casilla);
      foto.appendChild(el('span', null, 'Foto'));

      const quitar = el('button', 'btn-mini peligro', 'Quitar');
      quitar.type = 'button';
      quitar.addEventListener('click', function () {
        filasChecklist.splice(i, 1);
        pintarEditorChecklist();
        sincronizarChecklist();
      });

      caja.appendChild(grupo);
      caja.appendChild(pregunta);
      caja.appendChild(tipo);
      caja.appendChild(peso);
      caja.appendChild(foto);
      caja.appendChild(quitar);
      cont.appendChild(caja);
    });

    pintarVistaPrevia();
  }

  /** Cómo lo verá el contratista: la misma lista, en orden. */
  function pintarVistaPrevia() {
    const cont = document.getElementById('vistaChecklist');
    if (!cont) return;
    cont.textContent = '';
    const validas = filasChecklist.filter(function (f) { return String(f.pregunta || '').trim(); });
    if (!validas.length) return;

    const grupos = {};
    validas.forEach(function (f) {
      const g = f.grupo || 'General';
      grupos[g] = grupos[g] || [];
      grupos[g].push(f);
    });
    Object.keys(grupos).forEach(function (g) {
      const caja = el('div', 'vista-grupo');
      caja.appendChild(el('div', 'kicker', g));
      grupos[g].forEach(function (f) {
        const linea = el('div', 'vista-item');
        linea.appendChild(el('span', 'vista-marca', '☐'));
        linea.appendChild(el('span', null, f.pregunta));
        const et = (ITEM_TIPOS.filter(function (t) { return t[0] === f.tipo; })[0] || ['', f.tipo])[1];
        linea.appendChild(el('span', 'badge gray', et));
        if (f.foto) linea.appendChild(el('span', 'badge warn', 'foto'));
        caja.appendChild(linea);
      });
      cont.appendChild(caja);
    });
  }

  function preparar() {
    montarEtapasPlantilla([]);

    // K1 · Botón para agregar preguntas y vista previa de la lista.
    const agregar = document.getElementById('btnAgregarItem');
    if (agregar && !agregar.dataset.listo) {
      agregar.dataset.listo = '1';
      agregar.addEventListener('click', function () { window.Catalogo.agregarItem({}); });
      const cont = document.getElementById('editorChecklist');
      if (cont && !document.getElementById('vistaChecklist')) {
        const previa = el('div', 'vista-previa');
        previa.appendChild(el('div', 'kicker', 'Así lo verá el contratista'));
        const caja = el('div');
        caja.id = 'vistaChecklist';
        previa.appendChild(caja);
        cont.parentNode.insertBefore(previa, cont.nextSibling);
      }
      pintarEditorChecklist();
    }

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
      if (window.Datos) Datos.invalidar('tipos.listar');
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
          etapas: (leerEtapasPlantilla ? leerEtapasPlantilla() : []).map(function (e) {
            return { nombre: e.nombre, peso: e.peso };
          }),
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) return aviso(r.message || 'No se pudo guardar la plantilla.', 'error');
        if (window.Datos) Datos.invalidar('plantillas.listar');
        // K2 · Desde cuándo aplica el cambio.
        const abiertas = Number(r.data.abiertas_anteriores || 0);
        aviso('Plantilla guardada en la versión ' + r.data.version + ' con ' + r.data.items +
          ' ítems y ' + r.data.etapas + ' etapas.' +
          (abiertas ? ' ' + abiertas + ' trabajo(s) abierto(s) siguen con la versión anterior.' : ''), 'ok');
        document.getElementById('plaItems').value = '';
        montarEtapasPlantilla([]);
        cargar();
      });
    }
  }

  window.Catalogo = {
    cargar: cargar,
    preparar: preparar,
    // Para las pruebas y para reabrir una plantilla existente.
    cargarItems: function (items) {
      filasChecklist = (items || []).map(function (it) {
        return { grupo: it.grupo || 'General', pregunta: it.pregunta || '',
          tipo: it.tipo_respuesta || 'SI_NO', peso: Number(it.peso) || 1,
          foto: !!it.requiere_foto };
      });
      pintarEditorChecklist();
      sincronizarChecklist();
    },
    agregarItem: function (it) {
      filasChecklist.push(Object.assign({ grupo: 'General', pregunta: '', tipo: 'SI_NO', peso: 1, foto: false }, it || {}));
      pintarEditorChecklist();
      sincronizarChecklist();
    },
    items: function () { return filasChecklist.slice(); },
  };
})();
