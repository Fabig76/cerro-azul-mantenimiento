/**
 * consejo.js — el inicio del consejo: seis indicadores en una sola llamada.
 * Todo es de solo lectura; el servidor cierra cualquier otra acción.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  const SEMAFORO = {
    VERDE: ['ok', 'Buen desempeño'],
    NARANJA: ['warn', 'Con cosas por mejorar'],
    ROJO: ['danger', 'Para revisar el contrato'],
    POCOS_DATOS: ['gray', 'Pocos datos'],
  };

  async function cargar() {
    const cont = document.getElementById('contenidoConsejo');
    if (!cont) return;
    cont.textContent = '';
    cont.appendChild(el('p', 'bajada-tarjeta', 'Consultando…'));

    const r = await API.llamar('consejo.resumen', {}, { token: Sesion.token() });
    cont.textContent = '';
    if (!r.ok) {
      cont.appendChild(el('p', 'msg mostrar error', r.message || 'No se pudo consultar el resumen.'));
      return;
    }

    const d = r.data || {};
    const tarjetas = [
      ['Cumplimiento del mes', d.cumplimiento_pct === null || d.cumplimiento_pct === undefined
        ? '—' : d.cumplimiento_pct + ' %', 'indigo'],
      ['Trabajos vencidos', String(d.vencidos || 0), (d.vencidos || 0) > 0 ? 'danger' : 'ok'],
      ['Reportes por revisar', String(d.por_revisar || 0), (d.por_revisar || 0) > 0 ? 'warn' : 'ok'],
      ['El más viejo lleva', (d.dias_el_mas_viejo || 0) + ' días',
        (d.dias_el_mas_viejo || 0) >= 3 ? 'danger' : 'neutro'],
      ['Revisión promedio', d.revision_promedio_dias === null || d.revision_promedio_dias === undefined
        ? '—' : d.revision_promedio_dias + ' días', 'cian'],
    ];

    const kpis = el('div', 'kpis');
    tarjetas.forEach(function (t) {
      const caja = el('div', 'kpi acento-' + t[2]);
      caja.appendChild(el('div', 'kpi-n', String(t[1])));
      caja.appendChild(el('div', 'kpi-l', t[0]));
      kpis.appendChild(caja);
    });
    cont.appendChild(kpis);

    // Semáforo y valor aprobado del año, por empresa
    const empresas = d.empresas || [];
    if (empresas.length) {
      cont.appendChild(el('h3', 'kicker', 'Empresas'));
      const tabla = el('div', 'tabla-filas');
      const cab = el('div', 'tabla-fila tabla-cab');
      ['Empresa', 'Semáforo', 'Terminados', 'Valor aprobado'].forEach(function (t) {
        cab.appendChild(el('span', null, t));
      });
      tabla.appendChild(cab);

      empresas.forEach(function (e) {
        const fila = el('div', 'tabla-fila');
        fila.appendChild(el('span', null, e.razon_social));

        const sem = el('span');
        const info = SEMAFORO[e.semaforo] || ['gray', e.etiqueta || e.semaforo];
        sem.appendChild(el('span', 'badge ' + info[0], info[1]));
        fila.appendChild(sem);

        fila.appendChild(el('span', null, String(e.terminados || 0)));
        fila.appendChild(el('span', null, '$ ' + Number(e.valor_aprobado || 0).toLocaleString('es-CO')));
        tabla.appendChild(fila);
      });
      cont.appendChild(tabla);
    } else {
      cont.appendChild(el('p', 'bajada-tarjeta', 'Todavía no hay empresas activas con trabajo.'));
    }
  }

  window.Consejo = { cargar: cargar };
})();
