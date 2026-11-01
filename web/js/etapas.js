/**
 * etapas.js — editor de etapas por filas: nombre, peso y fecha.
 * Se usa al crear una actividad y al definir o reemplazar sus etapas.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  const PESO_POR_DEFECTO = 1;

  /**
   * Dibuja el editor dentro de `contenedor`.
   * `iniciales` es una lista [{nombre, peso, fecha_plan}].
   * Devuelve una función que entrega las etapas cargadas.
   */
  function crear(contenedor, iniciales) {
    const filas = el('div', 'etapas-filas');

    const cabecera = el('div', 'etapa-fila etapa-cab');
    cabecera.appendChild(el('span', null, 'Etapa'));
    cabecera.appendChild(el('span', null, 'Peso'));
    cabecera.appendChild(el('span', null, '%'));
    cabecera.appendChild(el('span', null, 'Fecha'));
    cabecera.appendChild(el('span', null, ''));
    filas.appendChild(cabecera);

    function agregarFila(datos) {
      const d = datos || {};
      const fila = el('div', 'etapa-fila');

      const nombre = document.createElement('input');
      nombre.type = 'text';
      nombre.className = 'item-input';
      nombre.placeholder = 'Desmontaje de la bomba';
      nombre.maxLength = 120;
      nombre.value = d.nombre || '';
      nombre.setAttribute('aria-label', 'Nombre de la etapa');

      const peso = document.createElement('input');
      peso.type = 'number';
      peso.className = 'item-input etapa-peso';
      peso.min = '1';
      peso.max = '10';
      peso.step = '1';
      peso.inputMode = 'numeric';
      peso.value = d.peso === undefined ? PESO_POR_DEFECTO : d.peso;
      peso.setAttribute('aria-label', 'Peso de la etapa, de 1 a 10');
      peso.title = 'De 1 a 10: cuántas partes del trabajo representa esta etapa';
      peso.addEventListener('blur', function () {
        let v = Math.round(Number(peso.value) || PESO_POR_DEFECTO);
        if (v < 1) v = 1;
        if (v > 10) v = 10;
        peso.value = v;
        actualizarTotales();
      });

      // Porcentaje que representa esta etapa sobre el total
      const parte = el('span', 'etapa-parte');

      const fecha = document.createElement('input');
      fecha.type = 'date';
      fecha.className = 'item-input';
      fecha.value = d.fecha_plan || '';
      fecha.setAttribute('aria-label', 'Fecha de la etapa');

      const quitar = el('button', 'boton-quitar', '×');
      quitar.type = 'button';
      quitar.setAttribute('aria-label', 'Quitar esta etapa');
      quitar.addEventListener('click', function () {
        fila.remove();
        if (filas.querySelectorAll('.etapa-fila:not(.etapa-cab)').length === 0) agregarFila();
        actualizarTotales();
      });

      [nombre, peso].forEach(function (c) { c.addEventListener('input', actualizarTotales); });

      fila.appendChild(nombre);
      fila.appendChild(peso);
      fila.appendChild(parte);
      fila.appendChild(fecha);
      fila.appendChild(quitar);
      filas.appendChild(fila);
      actualizarTotales();
      return { fila: fila, nombre: nombre, peso: peso, fecha: fecha };
    }

    const resumen = el('p', 'etapa-resumen');
    const agregar = el('button', 'btn-mini', '+ Agregar otra etapa');
    agregar.type = 'button';
    agregar.addEventListener('click', function () {
      const nueva = agregarFila();
      nueva.nombre.focus();
    });

    function actualizarTotales() {
      const entradas = Array.prototype.slice.call(filas.querySelectorAll('.etapa-fila:not(.etapa-cab)'));
      const pesos = entradas.map(function (f) {
        const p = f.querySelector('.etapa-peso');
        return Math.max(0, Number(p && p.value) || 0);
      });
      const total = pesos.reduce(function (a, b) { return a + b; }, 0);

      entradas.forEach(function (f, i) {
        const sello = f.querySelector('.etapa-parte');
        if (sello) sello.textContent = total ? Math.round((pesos[i] / total) * 100) + ' %' : '—';
      });

      const cuantas = pesos.length;
      if (!cuantas || !total) {
        resumen.textContent = '';
        return;
      }
      resumen.textContent = cuantas + (cuantas === 1 ? ' etapa · ' : ' etapas · ') +
        'el avance se reparte así: cada ' + (cuantas === 1 ? 'etapa es el 100 %' : 'etapa aporta su porcentaje') +
        ', y al aprobarse todas el trabajo llega a 100 %.';
    }

    contenedor.appendChild(filas);
    contenedor.appendChild(agregar);
    contenedor.appendChild(resumen);

    if (iniciales && iniciales.length) {
      iniciales.forEach(function (h) { agregarFila(h); });
    } else {
      agregarFila();
    }

    return function leer() {
      return Array.prototype.slice.call(filas.querySelectorAll('.etapa-fila:not(.etapa-cab)'))
        .map(function (fila) {
          const campos = fila.querySelectorAll('input');
          return {
            nombre: campos[0].value.trim(),
            peso: Number(campos[1].value) || PESO_POR_DEFECTO,
            fecha_plan: campos[2].value || '',
          };
        })
        .filter(function (h) { return h.nombre; });
    };
  }

  window.Etapas = { crear: crear };
})();
