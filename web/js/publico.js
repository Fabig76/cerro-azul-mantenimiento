/**
 * publico.js — portada pública. Todo sale de `public.snapshot`; nunca de datos crudos.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  const ESTADOS = {
    AL_DIA: ['Al día', 'ok'], ATENCION: ['Con atención', 'warn'],
    CRITICO: ['Crítico', 'danger'], SIN_DATOS: ['Sin datos', 'gray'],
  };

  async function cargar() {
    const url = (window.CFG && window.CFG.API_URL ? window.CFG.API_URL : '') + '?action=public.snapshot';
    let snap;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      snap = await r.json();
    } catch (e) {
      const aviso = document.getElementById('avisoPortal');
      if (aviso) { aviso.textContent = 'No pudimos cargar la información del portal.'; aviso.className = 'msg mostrar error'; }
      return;
    }
    pintarResumen(snap);
    pintarArbol(snap);
    pintarMeses(snap);
    pintarProximos(snap);
    pintarRecientes(snap);
    pintarNovedades(snap);
    pintarNormativo(snap);
    const sello = document.getElementById('actualizado');
    if (sello) sello.textContent = 'Actualizado ' + (snap.generado_en || '').replace('T', ' ').slice(0, 16);
  }

  function pintarResumen(snap) {
    const cont = document.getElementById('kpis');
    if (!cont) return;
    cont.textContent = '';
    const r = snap.resumen || {};
    const salud = r.salud || {};
    const mes = r.mes || {};

    const tarjetas = [
      { n: salud.puntaje === null || salud.puntaje === undefined ? '—' : salud.puntaje, l: 'Salud general', s: (ESTADOS[salud.estado] || ['', 'gray'])[0] },
      { n: (mes.cumplimiento_pct === null ? '—' : mes.cumplimiento_pct + '%'), l: 'Cumplimiento del mes' },
      { n: (mes.ejecutadas || 0) + ' / ' + (mes.programadas || 0), l: 'Ejecutadas de programadas' },
      { n: r.novedades_abiertas || 0, l: 'Novedades abiertas' },
      { n: r.proximos_7d || 0, l: 'En los próximos 7 días' },
    ];
    tarjetas.forEach(function (t) {
      const caja = el('div', 'kpi');
      caja.appendChild(el('div', 'kpi-n', String(t.n)));
      caja.appendChild(el('div', 'kpi-l', t.l));
      if (t.s) caja.appendChild(el('span', 'badge ' + (ESTADOS[salud.estado] || ['', 'gray'])[1], t.s));
      cont.appendChild(caja);
    });
  }

  function barraDistribucion(dist) {
    const total = (dist.AL_DIA || 0) + (dist.ATENCION || 0) + (dist.CRITICO || 0) + (dist.SIN_DATOS || 0);
    const caja = el('div', 'distribucion');
    if (!total) {
      caja.appendChild(el('span', 'distribucion-vacia'));
      return caja;
    }
    [['AL_DIA', 'ok'], ['ATENCION', 'warn'], ['CRITICO', 'danger'], ['SIN_DATOS', 'none']].forEach(function (par) {
      const n = dist[par[0]] || 0;
      if (!n) return;
      const seg = el('span', 'distribucion-seg ' + par[1]);
      seg.style.width = ((n / total) * 100) + '%';
      seg.title = n + ' ' + (ESTADOS[par[0]] || [''])[0].toLowerCase();
      caja.appendChild(seg);
    });
    return caja;
  }

  function pintarArbol(snap) {
    const cont = document.getElementById('secciones');
    if (!cont || !snap.arbol) return;
    cont.textContent = '';
    if (!snap.arbol.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay secciones con mantenimiento registrado.'));
      return;
    }
    snap.arbol.forEach(function (s) {
      const card = el('article', 'card seccion-card');
      const cab = el('div', 'seccion-card-cab');
      const titulo = el('h3', null, s.nombre);
      const estado = ESTADOS[s.salud.estado] || ['', 'gray'];
      cab.appendChild(titulo);
      cab.appendChild(el('span', 'badge ' + estado[1], estado[0]));
      card.appendChild(cab);
      card.appendChild(el('p', 'seccion-codigo', s.codigo));

      const fila = el('div', 'seccion-datos');
      fila.appendChild(el('span', 'seccion-puntaje', s.salud.puntaje === null ? '—' : String(s.salud.puntaje)));
      fila.appendChild(el('span', 'seccion-puntaje-l', 'puntaje'));
      if (s.salud.elementos) fila.appendChild(el('span', 'seccion-puntaje-l', s.salud.elementos + ' equipo(s)'));
      card.appendChild(fila);

      card.appendChild(barraDistribucion(s.salud.distribucion || {}));

      const mes = el('p', 'seccion-mes');
      mes.textContent = 'Este mes: ' + s.mes.ejecutadas + ' de ' + s.mes.programadas + ' trabajos';
      card.appendChild(mes);

      if (s.novedades) {
        card.appendChild(el('span', 'badge warn', s.novedades + ' novedad(es)'));
      }
      cont.appendChild(card);
    });
  }

  function pintarMeses(snap) {
    const cont = document.getElementById('grafica-meses');
    if (!cont || !snap.meses) return;
    cont.textContent = '';
    const maximo = Math.max(1, Math.max.apply(null, snap.meses.map(function (m) { return m.programadas || 0; })));
    snap.meses.forEach(function (m) {
      const col = el('div', 'mes');
      const barras = el('div', 'mes-barras');
      const prog = el('span', 'mes-barra programadas');
      prog.style.height = Math.max(2, ((m.programadas || 0) / maximo) * 100) + '%';
      prog.title = m.programadas + ' programadas';
      const ejec = el('span', 'mes-barra ejecutadas');
      ejec.style.height = Math.max(2, ((m.ejecutadas || 0) / maximo) * 100) + '%';
      ejec.title = m.ejecutadas + ' ejecutadas';
      barras.appendChild(prog);
      barras.appendChild(ejec);
      col.appendChild(barras);
      col.appendChild(el('span', 'mes-etiqueta', m.etiqueta));
      col.appendChild(el('span', 'mes-pct', m.cumplimiento_pct === null ? '—' : m.cumplimiento_pct + '%'));
      cont.appendChild(col);
    });
  }

  function pintarProximos(snap) {
    const cont = document.getElementById('proximos');
    if (!cont) return;
    cont.textContent = '';
    if (!snap.proximos || !snap.proximos.length) {
      cont.appendChild(el('li', 'vacio', 'No hay mantenimientos programados en los próximos 30 días.'));
      return;
    }
    snap.proximos.forEach(function (p) {
      const li = el('li', 'fila-lista');
      const cuando = el('span', 'fila-fecha', p.fecha);
      const que = el('span', 'fila-texto');
      que.textContent = p.titulo;
      const donde = el('span', 'fila-meta', p.sensible ? 'Sistema sensible' : p.nodo_nombre);
      li.appendChild(cuando);
      li.appendChild(que);
      li.appendChild(donde);
      if (p.afecta_uso) li.appendChild(el('span', 'badge warn', 'Afecta el uso'));
      cont.appendChild(li);
    });
  }

  async function pintarRecientes(snap) {
    const cont = document.getElementById('recientes');
    if (!cont) return;
    cont.textContent = '';
    if (!snap.recientes || !snap.recientes.length) {
      cont.appendChild(el('li', 'vacio', 'Todavía no hay trabajos aprobados.'));
      return;
    }
    for (const r of snap.recientes) {
      const li = el('li', 'fila-lista reciente');
      const cuando = el('span', 'fila-fecha', r.fecha);
      const que = el('span', 'fila-texto');
      que.textContent = r.titulo;
      const donde = el('span', 'fila-meta', r.empresa || (r.sensible ? 'Sistema sensible' : r.nodo_codigo));
      li.appendChild(cuando);
      li.appendChild(que);
      li.appendChild(donde);

      if (r.fotos && r.fotos.length >= 2) {
        const antes = r.fotos.filter(function (f) { return f.momento === 'ANTES'; })[0];
        const despues = r.fotos.filter(function (f) { return f.momento === 'DESPUES'; })[0];
        if (antes && despues) {
          const par = el('div', 'mini-comparador');
          for (const f of [antes, despues]) {
            const img = el('img');
            img.loading = 'lazy';
            img.alt = 'Evidencia del trabajo';
            par.appendChild(img);
            cargarFoto(f.id, img);
          }
          li.appendChild(par);
        }
      }
      cont.appendChild(li);
    }
  }

  async function cargarFoto(id, img) {
    try {
      const url = window.CFG.API_URL + '?action=public.foto&id=' + encodeURIComponent(id);
      const r = await fetch(url, { redirect: 'follow' });
      const d = await r.json();
      if (d.base64) img.src = 'data:' + d.mime + ';base64,' + d.base64;
    } catch (e) { /* sin foto */ }
  }

  function pintarNovedades(snap) {
    const cont = document.getElementById('novedades');
    if (!cont) return;
    cont.textContent = '';
    if (!snap.novedades || !snap.novedades.length) {
      cont.appendChild(el('div', 'vacio', 'Sin novedades abiertas.'));
      return;
    }
    snap.novedades.forEach(function (n) {
      const caja = el('div', 'novedad ' + String(n.gravedad).toLowerCase());
      const cab = el('div', 'novedad-cab');
      cab.appendChild(el('h3', null, n.texto));
      cab.appendChild(el('span', 'badge ' + (n.gravedad === 'CRITICA' || n.gravedad === 'ALTA' ? 'danger' : 'warn'), n.gravedad));
      caja.appendChild(cab);
      const meta = n.nodo_codigo + (n.fecha_compromiso ? ' · compromiso ' + n.fecha_compromiso : '');
      caja.appendChild(el('p', null, meta));
      cont.appendChild(caja);
    });
  }

  function pintarNormativo(snap) {
    const cont = document.getElementById('normativo');
    if (!cont || !snap.normativo || !snap.normativo.length) return;
    cont.textContent = '';
    snap.normativo.forEach(function (n) {
      const li = el('li', 'fila-lista');
      li.appendChild(el('span', 'fila-texto', n.nombre));
      li.appendChild(el('span', 'fila-meta', n.frecuencia + (n.norma ? ' · ' + n.norma : '')));
      cont.appendChild(li);
    });
  }

  document.addEventListener('DOMContentLoaded', cargar);
})();
