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
    AL_DIA: ['Al día', 'ok'],
    EN_REVISION: ['En revisión', 'warn'], ATENCION: ['Con atención', 'warn'],
    CRITICO: ['Crítico', 'danger'], SIN_DATOS: ['Sin datos', 'gray'],
  };

  function mostrarAviso(mensaje) {
    const aviso = document.getElementById('avisoPortal');
    if (aviso) {
      aviso.textContent = mensaje;
      aviso.className = 'msg mostrar info';
    }
  }

  function mostrarError(mensaje) {
    const aviso = document.getElementById('avisoPortal');
    if (aviso) {
      aviso.textContent = mensaje;
      aviso.className = 'msg mostrar error';
    }
  }

  // --- Copia local: la portada se pinta al instante y luego se actualiza ---
  const CLAVE_CACHE = 'portal:snapshot';

  function leerCache() {
    try {
      const crudo = localStorage.getItem(CLAVE_CACHE);
      if (!crudo) return null;
      const d = JSON.parse(crudo);
      if (!d || !d.generado_en || !d.arbol) return null;
      // Una copia de más de 7 días no sirve: puede haber cambiado todo.
      if (Date.now() - new Date(d.generado_en).getTime() > 7 * 86400000) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  function guardarCache(d) {
    try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(d)); } catch (e) { /* sin espacio */ }
  }

  function ocultarEsqueleto() {
    const esq = document.getElementById('esqueleto');
    if (esq) esq.remove();
  }

  async function cargar() {
    const url = (window.CFG && window.CFG.API_URL ? window.CFG.API_URL : '') + '?action=public.snapshot';

    // Primero lo último que se vio: cero espera.
    const guardado = leerCache();
    if (guardado) {
      ultimoSnap = guardado;
      try { pintarTodo(guardado); ocultarEsqueleto(); } catch (e) { /* se reintenta al llegar */ }
    }

    let snap;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      snap = await r.json();
    } catch (e) {
      if (guardado) {
        mostrarAviso('Mostrando la última información guardada. No hay conexión con el servidor.');
        return;
      }
      mostrarError('No pudimos cargar la información del portal.');
      return;
    }

    guardarCache(snap);
    ocultarEsqueleto();
    ultimoSnap = snap;
    try {
      pintarTodo(snap);
    } catch (e) {
      // Un fallo de pintado no puede dejar la portada en "Cargando…" para siempre.
      mostrarError('Error al mostrar la información: ' + (e && e.message ? e.message : e));
      throw e;
    }
  }

  function pintarTodo(snap) {
    prepararFiltro(snap);
    pintarResumen(snap);
    pintarArbol(snap);
    pintarMeses(snap);
    pintarAfecta(snap);
    pintarProximos(snap);
    pintarRecientes(snap);
    pintarAlertas(snap);
    pintarNovedades(snap);
    pintarImportante(snap);
    pintarCuentaNovedades(snap);
    pintarNormativo(snap);
    const sello = document.getElementById('actualizado');
    if (sello) sello.textContent = 'Actualizado ' + cuandoEnPalabras(snap.generado_en);
  }

  /** «2026-11-13T14:24» → «hoy a las 2:24 p. m.». */
  function cuandoEnPalabras(iso) {
    if (!iso) return '—';
    const f = new Date(iso);
    if (isNaN(f.getTime())) return String(iso).replace('T', ' ').slice(0, 16);
    const hora = f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
    const hoy = new Date();
    const mismoDia = f.toDateString() === hoy.toDateString();
    const ayer = new Date(hoy.getTime() - 86400000).toDateString() === f.toDateString();
    if (mismoDia) return 'hoy a las ' + hora;
    if (ayer) return 'ayer a las ' + hora;
    return f.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) + ' a las ' + hora;
  }

  function pintarResumen(snap) {
    const cont = document.getElementById('kpis');
    if (!cont) return;
    cont.textContent = '';
    const r = snap.resumen || {};
    const salud = r.salud || {};
    const mes = r.mes || {};

    const acentoSalud = { AL_DIA: 'ok', EN_REVISION: 'warn', ATENCION: 'warn', CRITICO: 'danger' }[salud.estado] || 'neutro';
    const tarjetas = [
      {
        n: salud.puntaje === null || salud.puntaje === undefined ? '—' : salud.puntaje,
        l: 'Salud general',
        acento: acentoSalud,
        etiqueta: (ESTADOS[salud.estado] || ['', 'gray'])[0],
        claseEtiqueta: (ESTADOS[salud.estado] || ['', 'gray'])[1],
      },
      (function () {
        // Si hay trabajo entregado y sin aprobar, el 0 % mentiría.
        const reportadas = Number(mes.reportadas || 0);
        if (reportadas > 0 && !mes.ejecutadas) {
          return { n: reportadas, l: 'En revisión de la administración', acento: 'warn' };
        }
        return { n: (mes.cumplimiento_pct === null ? '—' : mes.cumplimiento_pct + '%'), l: 'Cumplimiento del mes', acento: 'indigo' };
      })(),
      { n: (mes.ejecutadas || 0) + ' de ' + (mes.programadas || 0),
        l: 'trabajos del mes terminados y aprobados', acento: 'cian' },
      {
        n: r.novedades_abiertas || 0,
        l: 'Novedades abiertas',
        acento: (r.novedades_abiertas || 0) > 0 ? 'danger' : 'ok',
      },
      { n: r.proximos_7d || 0, l: 'En los próximos 7 días', acento: 'violeta' },
    ];
    tarjetas.forEach(function (t) {
      const caja = el('div', 'kpi acento-' + t.acento);
      caja.appendChild(el('div', 'kpi-n', String(t.n)));
      caja.appendChild(el('div', 'kpi-l', t.l));
      if (t.etiqueta) caja.appendChild(el('span', 'badge ' + t.claseEtiqueta, t.etiqueta));

      // El número solo sirve si se entiende: se explica ahí mismo.
      if (t.l === 'Salud general') {
        const ayuda = el('button', 'kpi-ayuda', '¿Qué significa?');
        ayuda.type = 'button';
        ayuda.setAttribute('aria-expanded', 'false');
        const detalle = el('div', 'kpi-explica oculto');
        [
          'Mide el estado de los equipos del conjunto con lo último que reportó cada trabajo: ' +
            'cuenta la condición en que quedó el equipo, el tiempo desde su último mantenimiento y si tiene fallas abiertas.',
          'Verde: todo al día. Naranja: hay algo que necesita atención. Rojo: hay equipos con fallas o mantenimientos vencidos.',
          'Se recalcula cada noche y se publica en este portal cada hora.',
        ].forEach(function (linea) { detalle.appendChild(el('p', null, linea)); });
        ayuda.addEventListener('click', function () {
          const abierto = !detalle.classList.contains('oculto');
          detalle.classList.toggle('oculto', abierto);
          ayuda.textContent = abierto ? '¿Qué significa?' : 'Ocultar';
          ayuda.setAttribute('aria-expanded', abierto ? 'false' : 'true');
        });
        caja.appendChild(ayuda);
        caja.appendChild(detalle);
      }

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

  /**
   * «Mi torre»: cada residente puede ver solo su sección. Las áreas comunes se
   * muestran siempre. La elección se guarda en su dispositivo.
   */
  let filtroSeccion = '';
  try { filtroSeccion = localStorage.getItem('ca_torre') || ''; } catch (e) { filtroSeccion = ''; }

  function seccionDe(item) {
    return item && item.seccion ? String(item.seccion.id) : '';
  }

  /** ¿Pasa el filtro? Lo que no trae sección (áreas comunes) siempre pasa. */
  function pasaFiltro(item) {
    if (!filtroSeccion) return true;
    const id = seccionDe(item);
    return !id || id === filtroSeccion;
  }

  function prepararFiltro(snap) {
    const caja = document.getElementById('miTorre');
    const sel = document.getElementById('selTorre');
    if (!caja || !sel) return;
    const secciones = (snap.arbol || []);
    if (secciones.length < 2) { caja.hidden = true; return; }

    sel.textContent = '';
    const todas = document.createElement('option');
    todas.value = '';
    todas.textContent = 'Todo el conjunto';
    sel.appendChild(todas);

    secciones.forEach(function (s) {
      const op = document.createElement('option');
      op.value = s.id;
      op.textContent = s.nombre;
      sel.appendChild(op);
    });

    if (filtroSeccion && !secciones.some(function (s) { return String(s.id) === filtroSeccion; })) {
      filtroSeccion = '';
    }
    sel.value = filtroSeccion;
    caja.hidden = false;

    sel.addEventListener('change', function () {
      filtroSeccion = sel.value;
      try { localStorage.setItem('ca_torre', filtroSeccion); } catch (e) { /* nada */ }
      pintarTodo(ultimoSnap);
    });
  }

  function pintarArbol(snap) {
    const cont = document.getElementById('secciones-lista');
    if (!cont || !snap.arbol) return;
    cont.textContent = '';
    if (!snap.arbol.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay secciones con mantenimiento registrado.'));
      return;
    }
    snap.arbol.filter(function (s) { return !filtroSeccion || String(s.id) === filtroSeccion; })
      .forEach(function (s) {
      const acentoSeccion = { AL_DIA: 'ok', EN_REVISION: 'warn', ATENCION: 'warn', CRITICO: 'danger' }[s.salud.estado] || 'neutro';
      const card = el('article', 'card seccion-card acento-' + acentoSeccion);
      const cab = el('div', 'seccion-card-cab');
      const titulo = el('h3', null, s.nombre);
      const estado = ESTADOS[s.salud.estado] || ['', 'gray'];
      cab.appendChild(titulo);
      cab.appendChild(el('span', 'badge ' + estado[1], estado[0]));
      card.tabIndex = 0;
      card.setAttribute('role', 'link');
      card.addEventListener('click', function () { window.location.hash = '#/nodo/' + s.id; });
      card.appendChild(cab);
      card.appendChild(el('p', 'seccion-codigo', s.codigo));

      const fila = el('div', 'seccion-datos');
      if (s.salud.puntaje === null || s.salud.puntaje === undefined) {
        fila.appendChild(el('span', 'seccion-sin-puntaje',
          s.salud.elementos ? 'Sin mediciones todavía' : 'Sin equipos registrados'));
      } else {
        fila.appendChild(el('span', 'seccion-puntaje', String(s.salud.puntaje)));
        fila.appendChild(el('span', 'seccion-puntaje-l', 'puntaje'));
        fila.appendChild(el('span', 'seccion-puntaje-l', s.salud.elementos + ' equipo(s)'));
      }
      card.appendChild(fila);

      // La barra de semáforo solo tiene sentido si hay equipos medidos.
      if (s.salud.elementos) card.appendChild(barraDistribucion(s.salud.distribucion || {}));

      const mes = el('p', 'seccion-mes');
      const aprobadas = Number(s.mes.ejecutadas || 0);
      const entregadas = Number(s.mes.reportadas || 0);
      let textoMes = 'Este mes: ' + aprobadas + ' de ' + (s.mes.programadas || 0) + ' aprobados';
      if (entregadas > 0) textoMes += ' · ' + entregadas + ' en revisión';
      mes.textContent = textoMes;
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

  /**
   * «Qué me afecta esta semana»: los trabajos de los próximos siete días que
   * interrumpen el uso de una zona. Es lo que un residente necesita saber hoy.
   */
  function pintarAfecta(snap) {
    const cont = document.getElementById('listaAfecta');
    if (!cont) return;
    cont.textContent = '';

    const hoy = new Date();
    const en7 = new Date(hoy.getTime() + 7 * 86400000);
    const aIso = function (d) { return d.toISOString().slice(0, 10); };

    const trabajos = (snap.proximos || []).filter(function (p) {
      if (!p.afecta_uso) return false;
      if (!pasaFiltro(p)) return false;
      return String(p.fecha) >= aIso(hoy) && String(p.fecha) <= aIso(en7);
    });

    if (!trabajos.length) {
      cont.appendChild(el('p', 'afecta-vacio',
        'Esta semana ningún trabajo afecta el uso de las zonas comunes.'));
      return;
    }

    const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    const ul = el('ul', 'lista-afecta');
    trabajos.forEach(function (p) {
      const li = el('li', 'afecta-item');
      const f = new Date(String(p.fecha) + 'T12:00:00');
      const cuando = el('span', 'afecta-dia',
        DIAS[f.getDay()] + ' ' + f.getDate() + ' ' + MESES[f.getMonth()]);
      const que = el('span', 'afecta-que');
      que.textContent = p.titulo;
      const donde = el('span', 'afecta-zona',
        p.sensible ? 'Sistema sensible' : (p.seccion ? p.seccion.nombre : (p.nodo_nombre || '')));
      li.appendChild(cuando);
      li.appendChild(que);
      li.appendChild(donde);
      ul.appendChild(li);
    });
    cont.appendChild(ul);
  }

  function pintarProximos(snap) {
    const cont = document.getElementById('lista-proximos');
    if (!cont) return;
    cont.textContent = '';
    const proximos = (snap.proximos || []).filter(pasaFiltro);
    if (!proximos.length) {
      cont.appendChild(el('li', 'vacio', filtroSeccion
        ? 'No hay mantenimientos programados en esta sección.'
        : 'No hay mantenimientos programados en los próximos 30 días.'));
      return;
    }
    proximos.forEach(function (p) {
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
    const cont = document.getElementById('lista-recientes');
    if (!cont) return;
    cont.textContent = '';
    const recientes = (snap.recientes || []).filter(pasaFiltro);
    if (!recientes.length) {
      cont.appendChild(el('li', 'vacio', filtroSeccion
        ? 'Todavía no hay trabajos aprobados en esta sección.'
        : 'Todavía no hay trabajos aprobados.'));
      return;
    }
    for (const r of recientes) {
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
          // Antes y después, lado a lado y con su etiqueta: es lo que da confianza.
          const par = el('div', 'mini-comparador');
          [['ANTES', antes, 'Antes'], ['DESPUES', despues, 'Después']].forEach(function (par_) {
            const figura = el('figure', 'comparador-par');
            const img = el('img');
            img.loading = 'lazy';
            img.alt = 'Foto de ' + par_[2].toLowerCase() + ' del trabajo';
            figura.appendChild(img);
            figura.appendChild(el('figcaption', 'comparador-pie', par_[2]));
            par.appendChild(figura);
            cargarFoto(par_[1].id, img);
          });
          li.appendChild(par);
        }
      }
      cont.appendChild(li);
    }
  }

  // En el portal público la foto se pide directo y se recuerda en memoria mientras
  // la página está abierta. Sin caché del dispositivo: es el camino más simple y el
  // que no depende de nada más para pintar.
  const fotosPedidas = {};

  async function cargarFoto(id, img) {
    if (fotosPedidas[id]) {
      img.src = fotosPedidas[id];
      return;
    }
    try {
      const url = window.CFG.API_URL + '?action=public.foto&id=' + encodeURIComponent(id);
      const r = await fetch(url, { redirect: 'follow' });
      const d = await r.json();
      if (!d.base64) return;
      const src = 'data:' + (d.mime || 'image/jpeg') + ';base64,' + d.base64;
      fotosPedidas[id] = src;
      img.src = src;
    } catch (e) { /* queda el hueco */ }
  }

  /**
   * En el celular las cuatro cifras fijas bajan al final: lo primero que se ve
   * debe ser el estado del conjunto, no la presentación.
   */
  function ajustarCifras() {
    const cifras = document.querySelector('.hero .stats');
    const destino = document.getElementById('cifrasFinal');
    const original = document.querySelector('.hero .wrap');
    if (!cifras || !destino || !original) return;
    const movil = window.matchMedia('(max-width: 767px)').matches;
    const destinoFinal = movil ? destino : original;
    if (cifras.parentNode !== destinoFinal) destinoFinal.appendChild(cifras);
  }

  const NIVEL_ALERTA = {
    CRITICA: { clase: 'critica', icono: '!' },
    URGENTE: { clase: 'urgente', icono: '!' },
    AVISO: { clase: 'aviso', icono: 'i' },
    INFO: { clase: 'info', icono: 'i' },
  };

  function pintarAlertas(snap) {
    const franja = document.getElementById('franjaAlertas');
    if (!franja) return;
    const lista = snap.alertas || [];
    franja.textContent = '';
    if (!lista.length) {
      franja.classList.add('oculto');
      return;
    }
    const a = lista[0];
    const nivel = NIVEL_ALERTA[a.nivel] || NIVEL_ALERTA.INFO;
    franja.className = 'franja-alertas ' + nivel.clase;
    if (lista.length > 1) franja.appendChild(el('span', 'franja-cuenta', '+' + (lista.length - 1)));

    const icono = el('span', 'franja-icono', nivel.icono);
    const texto = el('span', 'franja-texto');
    texto.appendChild(el('strong', null, a.titulo));
    if (a.mensaje) texto.appendChild(document.createTextNode(' · ' + a.mensaje));
    franja.appendChild(icono);
    franja.appendChild(texto);

    if (a.nivel !== 'CRITICA') {
      const cerrar = el('button', 'franja-cerrar', '×');
      cerrar.type = 'button';
      cerrar.setAttribute('aria-label', 'Ocultar alerta');
      cerrar.addEventListener('click', function () { franja.classList.add('oculto'); });
      franja.appendChild(cerrar);
    }
  }

  function pintarImportante(snap) {
    const cont = document.getElementById('resumenImportante');
    if (!cont) return;
    cont.textContent = '';

    const alertas = (snap.alertas || []).slice(0, 2);
    if (alertas.length) {
      const caja = el('div', 'card con-acento acento-warn');
      caja.appendChild(el('h3', 'titulo-tarjeta', 'Avisos de la administración'));
      alertas.forEach(function (a) {
        const fila = el('div', 'fila-aviso');
        fila.appendChild(el('span', 'badge ' + (a.nivel === 'CRITICA' ? 'danger' : 'warn'), a.nivel));
        const texto = el('div');
        texto.appendChild(el('strong', null, a.titulo));
        if (a.mensaje) texto.appendChild(el('p', null, a.mensaje));
        fila.appendChild(texto);
        caja.appendChild(fila);
      });
      cont.appendChild(caja);
    }

    const abiertas = (snap.novedades || []).slice(0, 3);
    const cajaN = el('div', 'card con-acento acento-danger');
    cajaN.appendChild(el('h3', 'titulo-tarjeta', 'Daños y fallas en atención'));
    if (!abiertas.length) {
      cajaN.appendChild(el('p', 'vacio-linea', 'Sin novedades abiertas.'));
    } else {
      abiertas.forEach(function (n) {
        const fila = el('div', 'fila-aviso');
        fila.appendChild(el('span', 'badge ' + (n.gravedad === 'ALTA' || n.gravedad === 'CRITICA' ? 'danger' : 'warn'),
          n.gravedad));
        const texto = el('div');
        texto.appendChild(el('span', null, n.texto));
        const meta = el('p', 'meta-novedad');
        meta.textContent = n.nodo_codigo + (n.fecha_compromiso ? ' · compromiso ' + n.fecha_compromiso : '');
        texto.appendChild(meta);
        fila.appendChild(texto);
        cajaN.appendChild(fila);
      });
    }
    const enlace = el('a', 'btn', 'Ver todas');
    enlace.href = '#/novedades';
    enlace.dataset.ir = 'novedades';
    enlace.addEventListener('click', function (ev) {
      ev.preventDefault();
      window.location.hash = '#/novedades';
      mostrarTab('novedades');
    });
    cajaN.appendChild(enlace);
    cont.appendChild(cajaN);
  }

  function pintarCuentaNovedades(snap) {
    const cuenta = document.getElementById('cuentaNovedades');
    if (!cuenta) return;
    const abiertas = (snap.novedades || []).length;
    cuenta.textContent = String(abiertas);
    cuenta.classList.toggle('oculto', abiertas === 0);
    const pestana = cuenta.closest('.pestana');
    if (pestana) pestana.classList.toggle('con-alerta', abiertas > 0);
  }

  function pintarNovedades(snap) {
    const cont = document.getElementById('lista-novedades');
    if (!cont) return;
    cont.textContent = '';
    const novedades = (snap.novedades || []).filter(pasaFiltro);
    if (!novedades.length) {
      cont.appendChild(el('div', 'vacio', filtroSeccion
        ? 'Sin novedades abiertas en esta sección.'
        : 'Sin novedades abiertas.'));
      return;
    }
    novedades.forEach(function (n) {
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
    const cont = document.getElementById('lista-normativo');
    if (!cont || !snap.normativo || !snap.normativo.length) return;
    cont.textContent = '';
    snap.normativo.forEach(function (n) {
      const li = el('li', 'fila-lista');
      li.appendChild(el('span', 'fila-texto', n.nombre));
      li.appendChild(el('span', 'fila-meta', n.frecuencia + (n.norma ? ' · ' + n.norma : '')));
      cont.appendChild(li);
    });
  }

  // --- Pestañas del portal público ---
  const TABS = ['resumen', 'secciones', 'historico', 'agenda', 'novedades', 'obligaciones', 'como-funciona'];

  function ocultarTodo() {
    document.querySelectorAll('[data-gpanel]').forEach(function (p) { p.classList.add('oculto'); });
    const det = document.getElementById('detalle');
    if (det) det.classList.add('oculto');
    const al = document.getElementById('pantallaAlertas');
    if (al) al.classList.add('oculto');
  }

  function mostrarTab(id) {
    ocultarTodo();
    document.querySelectorAll('[data-gpanel="' + id + '"]').forEach(function (p) {
      p.classList.remove('oculto');
    });
    document.querySelectorAll('#pestanasPublico .pestana').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.gtab === id);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function mostrarPortada() {
    mostrarTab('resumen');
  }

  async function verNodo(id) {
    ocultarTodo();
    const detalle = document.getElementById('detalle');
    let d;
    try {
      const r = await fetch(window.CFG.API_URL + '?action=public.nodo&id=' + encodeURIComponent(id), { redirect: 'follow' });
      d = await r.json();
    } catch (e) {
      mostrarError('No pudimos cargar esta sección. Revisa tu conexión.');
      return;
    }
    if (!d || d.error) {
      mostrarError('Esa sección no está disponible.');
      window.location.hash = '#/secciones';
      return;
    }
    if (detalle) detalle.classList.remove('oculto');

    const migas = document.getElementById('migas');
    if (migas) {
      migas.textContent = '';
      const inicio = el('a', null, 'Inicio');
      inicio.href = '#';
      migas.appendChild(inicio);
      (d.migas || []).forEach(function (m) {
        migas.appendChild(el('span', 'miga-sep', '›'));
        const a = el('a', null, m.nombre);
        a.href = '#/nodo/' + m.id;
        migas.appendChild(a);
      });
    }

    const nombre = document.getElementById('detalleNombre');
    if (nombre) nombre.textContent = d.nombre + (d.sensible ? ' · sistema sensible' : '');
    const estado = document.getElementById('detalleEstado');
    if (estado) {
      const e = ESTADOS[d.salud.estado] || ['', 'gray'];
      estado.textContent = e[0] + ' · ' + (d.salud.elementos || 0) + ' equipo(s) · ' +
        (d.salud.puntaje === null ? 'sin puntaje' : 'puntaje ' + d.salud.puntaje);
    }

    const kpis = document.getElementById('detalleKpis');
    if (kpis) {
      kpis.textContent = '';
      const mes = (d.meses || []).filter(function (m) { return m.mes === d.mes_actual; })[0] || {};
      const enRevision = Number(mes.reportadas || 0);
      const cifras = [
        { n: mes.programadas || 0, l: 'Programadas del mes', a: 'indigo' },
        { n: mes.ejecutadas || 0, l: 'Aprobadas', a: 'ok' },
      ];
      if (enRevision > 0 && !mes.ejecutadas) {
        cifras.push({ n: enRevision, l: 'En revisión de la administración', a: 'warn' });
      } else {
        cifras.push({
          n: mes.cumplimiento_pct === null || mes.cumplimiento_pct === undefined ? '—' : mes.cumplimiento_pct + '%',
          l: 'Cumplimiento',
          a: 'ciber',
        });
        if (enRevision > 0) cifras.push({ n: enRevision, l: 'En revisión', a: 'warn' });
      }
      cifras.push({ n: (d.proximos || []).length, l: 'Próximos 30 días', a: 'violeta' });

      cifras.forEach(function (k) {
        const caja = el('div', 'kpi acento-' + (k.a === 'ciber' ? 'cian' : k.a));
        caja.appendChild(el('div', 'kpi-n', String(k.n)));
        caja.appendChild(el('div', 'kpi-l', k.l));
        kpis.appendChild(caja);
      });
    }

    const hijos = document.getElementById('detalleHijos');
    if (hijos) {
      hijos.textContent = '';
      (d.hijos || []).forEach(function (h) {
        const e = ESTADOS[h.estado] || ['', 'gray'];
        const acento = { AL_DIA: 'ok', EN_REVISION: 'warn', ATENCION: 'warn', CRITICO: 'danger' }[h.estado] || 'neutro';
        const card = el('article', 'card seccion-card acento-' + acento);
        card.tabIndex = 0;
        card.setAttribute('role', 'link');
        const cab = el('div', 'seccion-card-cab');
        cab.appendChild(el('h3', null, h.nombre));
        cab.appendChild(el('span', 'badge ' + e[1], e[0]));
        card.appendChild(cab);
        card.appendChild(el('p', 'seccion-codigo', h.codigo));
        const datos = el('div', 'seccion-datos');
        datos.appendChild(el('span', 'seccion-puntaje', h.puntaje === null ? '—' : String(h.puntaje)));
        datos.appendChild(el('span', 'seccion-puntaje-l', (h.elementos || 0) + ' equipo(s)'));
        card.appendChild(datos);
        card.addEventListener('click', function () { window.location.hash = '#/nodo/' + h.id; });
        hijos.appendChild(card);
      });
      if (!(d.hijos || []).length) hijos.appendChild(el('div', 'vacio', 'Esta sección no tiene subsecciones.'));
    }

    pintarMesesEn('detalleGrafica', { meses: d.meses || [] });

    const prox = document.getElementById('detalleProximos');
    if (prox) {
      prox.textContent = '';
      if (!(d.proximos || []).length) prox.appendChild(el('li', 'vacio', 'Sin mantenimientos programados.'));
      (d.proximos || []).forEach(function (p) {
        const li = el('li', 'fila-lista');
        li.appendChild(el('span', 'fila-fecha', p.fecha));
        li.appendChild(el('span', 'fila-texto', p.titulo));
        prox.appendChild(li);
      });
    }

    const rec = document.getElementById('detalleRecientes');
    if (rec) {
      rec.textContent = '';
      if (!(d.recientes || []).length) rec.appendChild(el('li', 'vacio', 'Todavía no hay trabajos aprobados aquí.'));
      (d.recientes || []).forEach(function (x) {
        const li = el('li', 'fila-lista');
        li.appendChild(el('span', 'fila-fecha', x.fecha));
        li.appendChild(el('span', 'fila-texto', x.titulo));
        if (x.empresa) li.appendChild(el('span', 'fila-meta', x.empresa));
        rec.appendChild(li);
      });
    }
  }

  function pintarMesesEn(id, snap) {
    const cont = document.getElementById(id);
    if (!cont) return;
    cont.textContent = '';
    const maximo = Math.max(1, Math.max.apply(null, (snap.meses || []).map(function (m) { return m.programadas || 0; })));
    (snap.meses || []).forEach(function (m) {
      const col = el('div', 'mes');
      const barras = el('div', 'mes-barras');
      const prog = el('span', 'mes-barra programadas');
      prog.style.height = Math.max(2, ((m.programadas || 0) / maximo) * 100) + '%';
      const ejec = el('span', 'mes-barra ejecutadas');
      ejec.style.height = Math.max(2, ((m.ejecutadas || 0) / maximo) * 100) + '%';
      barras.appendChild(prog);
      barras.appendChild(ejec);
      col.appendChild(barras);
      col.appendChild(el('span', 'mes-etiqueta', m.etiqueta));
      col.appendChild(el('span', 'mes-pct', m.cumplimiento_pct === null ? '—' : m.cumplimiento_pct + '%'));
      cont.appendChild(col);
    });
  }

  function verAlertas(snap) {
    ocultarTodo();
    const pantalla = document.getElementById('pantallaAlertas');
    if (pantalla) pantalla.classList.remove('oculto');

    const cont = document.getElementById('listaAlertasPublicas');
    if (!cont) return;
    cont.textContent = '';
    const lista = (snap && snap.alertas) || [];
    if (!lista.length) {
      cont.appendChild(el('div', 'card', 'No hay alertas vigentes. Cuando la administración publique una, aparecerá aquí.'));
      return;
    }
    lista.forEach(function (a) {
      const nivel = NIVEL_ALERTA[a.nivel] || NIVEL_ALERTA.INFO;
      const caja = el('div', 'card con-acento acento-' + (a.nivel === 'CRITICA' ? 'danger' : a.nivel === 'URGENTE' ? 'warn' : 'indigo'));
      const cab = el('div', 'seccion-card-cab');
      cab.appendChild(el('h3', null, a.titulo));
      cab.appendChild(el('span', 'badge ' + (a.nivel === 'CRITICA' || a.nivel === 'URGENTE' ? 'danger' : 'warn'), a.nivel));
      caja.appendChild(cab);
      if (a.mensaje) caja.appendChild(el('p', null, a.mensaje));
      const meta = el('p', 'seccion-codigo');
      meta.textContent = (a.nodo_codigo || 'Todo el conjunto') + ' · desde ' + a.inicio + (a.fin ? ' hasta ' + a.fin : '');
      caja.appendChild(meta);
      (a.actualizaciones || []).forEach(function (u) {
        const linea = el('div', 'linea-alerta');
        linea.textContent = (u.fecha || '').replace('T', ' ').slice(0, 16) + ' · ' + u.texto;
        caja.appendChild(linea);
      });
      cont.appendChild(caja);
    });
  }

  /** Abre el reporte o la consulta del residente (módulo aparte, carga al usarse). */
  function abrirReporte(tipo, nodoId) {
    const pantalla = document.getElementById('pantallaReporte');
    const cont = document.getElementById('contenidoReporte');
    if (!pantalla || !cont) return;

    const cargar = function () {
      pantalla.classList.remove('oculto');
      document.querySelectorAll('[data-gpanel]').forEach(function (p) { p.classList.add('oculto'); });
      window.__seccionesPublicas = (ultimoSnap && ultimoSnap.arbol || []).map(function (x) {
        return { id: x.id, nombre: x.nombre };
      });
      if (tipo === 'consulta') Reporte.montarConsulta(cont);
      else Reporte.montarReporte(cont, nodoId);
      pantalla.scrollIntoView({ block: 'start' });
    };

    if (!window.Reporte) {
      cont.textContent = 'No se pudo abrir el formulario. Recargue la página.';
      pantalla.classList.remove('oculto');
      return;
    }
    cargar();
  }

  function ruta(snap) {
    const h = window.location.hash || '';
    if (h.indexOf('#/reportar') === 0) {
      const conNodo = h.match(/^#\/reportar\/([A-Z0-9_]+)/i);
      return abrirReporte('reportar', conNodo ? conNodo[1] : '');
    }
    if (h.indexOf('#/consulta') === 0) return abrirReporte('consulta');
    const pantallaReporte = document.getElementById('pantallaReporte');
    if (pantallaReporte) pantallaReporte.classList.add('oculto');
    const m = h.match(/^#\/nodo\/([A-Z0-9_]+)/i);
    if (m) return verNodo(m[1]);
    if (h.indexOf('#/alertas') === 0) return verAlertas(snap);
    const t = h.replace('#/', '');
    mostrarTab(TABS.indexOf(t) >= 0 ? t : 'resumen');
  }

  let ultimoSnap = null;
  window.addEventListener('hashchange', function () { ruta(ultimoSnap); });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#pestanasPublico .pestana').forEach(function (b) {
      b.addEventListener('click', function () {
        window.location.hash = '#/' + b.dataset.gtab;
        mostrarTab(b.dataset.gtab);
      });
    });
    document.querySelectorAll('[data-ir]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        window.location.hash = '#/' + a.dataset.ir;
        mostrarTab(a.dataset.ir);
      });
    });

    ajustarCifras();
    window.addEventListener('resize', ajustarCifras);

    cargar().then(function () {
      ultimoSnap = null;
      ruta(ultimoSnap);
    });
  });
})();
