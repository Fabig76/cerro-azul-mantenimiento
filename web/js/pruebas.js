/** pruebas.js — ejecuta las verificaciones del sistema desde el panel del administrador. */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function prepararRefresco() {
    const btn = document.getElementById('btnRefrescarPortal');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Actualizando…';
      const r = await API.llamar('snapshot.regenerar', {}, { token: Sesion.token() });
      btn.disabled = false;
      btn.textContent = 'Actualizar portal público';
      const resumen = document.getElementById('resumenPruebas');
      if (!resumen) return;
      resumen.textContent = r.ok
        ? 'Portal público actualizado: ' + r.data.bytes + ' caracteres, ' + String(r.data.generado_en).slice(11, 16) + '.'
        : (r.message || 'No se pudo actualizar.');
      resumen.className = 'msg mostrar ' + (r.ok ? 'ok' : 'error');
    });
  }

  function prepararPruebas() {
    const btn = document.getElementById('btnPruebas');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      const resumen0 = document.getElementById('resumenPruebas');
      const segundos = { t: 0 };
      // SI1 · Las pruebas tardan unos 30 s. Se cuenta el tiempo para que se vea vivo.
      btn.textContent = 'Ejecutando… 0 s';
      if (resumen0) {
        resumen0.className = 'msg mostrar info';
        resumen0.textContent = 'Corriendo las verificaciones. Puede tardar hasta dos minutos; no cierre la pantalla.';
      }
      const reloj = setInterval(function () {
        segundos.t++;
        btn.textContent = 'Ejecutando… ' + segundos.t + ' s';
      }, 1000);

      // La batería tarda; se le da su tiempo y no se reintenta si se pasa.
      const r = await API.llamar('tests.ejecutar', {},
        { token: Sesion.token(), espera: 180000, sinReintento: true });
      clearInterval(reloj);
      btn.disabled = false;
      btn.textContent = 'Ejecutar pruebas';

      const resumen = document.getElementById('resumenPruebas');
      const lista = document.getElementById('detallePruebas');
      if (!resumen || !lista) return;
      // Si se agotó la espera, el servidor puede seguir trabajando: no conviene repetir.
      if (!r.ok && r.code === 'TIEMPO') {
        resumen.className = 'msg mostrar info';
        resumen.textContent = 'El servidor sigue trabajando. Espere un minuto y mire las ' +
          'cifras; no hace falta repetir la batería.';
        return;
      }
      lista.textContent = '';

      if (!r.ok) {
        resumen.textContent = r.message || 'No se pudieron ejecutar.';
        resumen.className = 'msg mostrar error';
        return;
      }
      const d = r.data;
      resumen.textContent = d.fallidas === 0
        ? 'Todo bien: ' + d.pasadas + ' verificaciones pasaron.'
        : d.fallidas + ' de ' + (d.pasadas + d.fallidas) + ' fallaron.';
      resumen.className = 'msg mostrar ' + (d.fallidas === 0 ? 'ok' : 'error');
      (d.detalle || []).forEach(function (linea) {
        const fila = el('div', 'linea-prueba' + (linea.indexOf('FALLA') === 0 ? ' falla' : ''));
        fila.textContent = linea;
        lista.appendChild(fila);
      });
    });
  }

  /** Restos de pruebas anteriores: cuántos y con un botón para borrarlos. */
  async function revisarRestos() {
    const caja = document.getElementById('restosPruebas');
    const boton = document.getElementById('btnRestosPruebas');
    if (!caja || !boton) return;
    const r = await API.llamar('sistema.restos.contar', {}, { token: Sesion.token() });
    if (!r.ok) { caja.textContent = 'No se pudo revisar.'; return; }
    const total = Number((r.data && r.data.total) || 0);
    if (!total) {
      caja.textContent = 'No hay datos de pruebas anteriores.';
      boton.classList.add('oculto');
      return;
    }
    const detalle = Object.keys(r.data.por_hoja || {})
      .map(function (k) { return k + ': ' + r.data.por_hoja[k]; }).join(' · ');
    caja.textContent = 'Quedaron ' + total + ' fila(s) de pruebas anteriores (' + detalle + ').';
    boton.classList.remove('oculto');
    boton.textContent = 'Borrar datos de pruebas anteriores (' + total + ')';
  }

  function prepararRestos() {
    const boton = document.getElementById('btnRestosPruebas');
    if (!boton || boton.dataset.listo) return;
    boton.dataset.listo = '1';
    boton.addEventListener('click', async function () {
      if (!window.confirm('Se borrarán las filas creadas por las pruebas, con respaldo previo. ' +
        'No toca nada creado por personas. ¿Seguir?')) return;
      boton.disabled = true;
      boton.textContent = 'Borrando…';
      const r = await API.llamar('sistema.restos.limpiar', {}, { token: Sesion.token(), idempotente: true });
      boton.disabled = false;
      // El resultado se escribe junto al botón: es donde está mirando quien lo tocó.
      const caja = document.getElementById('restosPruebas');
      if (!r.ok) {
        boton.textContent = 'Borrar datos de pruebas anteriores';
        if (caja) caja.textContent = 'No se pudo limpiar: ' + (r.message || 'intente de nuevo.');
        return;
      }
      await revisarRestos();
      if (caja) caja.textContent = 'Listo: se borraron ' + Number((r.data && r.data.borradas) || 0) + ' fila(s). ' + caja.textContent;
    });
    revisarRestos();
  }

  /** Cola de correos y disparadores: si algo se atasca, se ve aquí. */
  async function cargarEstado() {
    const caja = document.getElementById('estadoCorreos');
    if (!caja) return;
    const r = await API.llamar('sistema.estado', {}, { token: Sesion.token() });
    if (!r.ok) {
      caja.textContent = 'No se pudo consultar el estado: ' + (r.message || 'sin respuesta');
      return;
    }
    const c = r.data.correos || {};
    const partes = [
      'Correos en cola: ' + (c.pendientes || 0) + (c.pendientes === 1 ? ' pendiente' : ' pendientes'),
      (c.errores || 0) + ' con error',
    ];
    if ((r.data.faltan || []).length) {
      partes.push('Faltan disparadores: ' + r.data.faltan.join(', ') + '. Ejecuta instalarDisparadores().');
    } else {
      partes.push('Los ' + (r.data.disparadores || []).length + ' disparadores están instalados');
    }
    // SI2 · Los destinatarios de los avisos y cómo terminó el último recálculo: sin esto,
    // un recálculo cortado o unos avisos sin destinatario pasan en silencio.
    const admins = r.data.admins || [];
    partes.push(admins.length
      ? 'Avisos a ' + admins.join(', ')
      : 'Sin destinatarios de avisos: config.guardar admin_emails');
    const ultimo = String(r.data.ultimo_recalculo || '');
    partes.push(ultimo ? 'Último recálculo: ' + ultimo : 'Último recálculo: sin registro todavía');

    const motivos = (c.motivos || []);
    if (motivos.length) {
      const detalle = motivos.map(function (m) { return m.cuantos + ' por «' + m.motivo + '»'; }).join(', ');
      partes.push('Motivos de error: ' + detalle);
    }
    caja.textContent = partes.join(' · ') + '.';
    pintarFilas(r.data.filas || {}, r.data.archivo || {});
  }

  /** Cuántas filas tiene cada tabla y cuándo hay que archivar. */
  function pintarFilas(filas, archivo) {
    const cont = document.getElementById('tablaFilas');
    if (!cont) return;
    cont.textContent = '';
    const aviso = Number(archivo.aviso || 15000);
    const limite = Number(archivo.limite || 20000);

    const tabla = document.createElement('div');
    tabla.className = 'tabla-filas';
    const cab = document.createElement('div');
    cab.className = 'tabla-fila tabla-cab';
    ['Tabla', 'Filas', 'Estado'].forEach(function (t) {
      const c = document.createElement('span');
      c.textContent = t;
      cab.appendChild(c);
    });
    tabla.appendChild(cab);

    const nombres = Object.keys(filas).sort(function (a, b) { return Number(filas[b]) - Number(filas[a]); });
    nombres.forEach(function (nombre) {
      const n = Number(filas[nombre] || 0);
      const fila = document.createElement('div');
      fila.className = 'tabla-fila';

      const c1 = document.createElement('span');
      c1.textContent = nombre;
      fila.appendChild(c1);

      const c2 = document.createElement('span');
      c2.textContent = String(n);
      fila.appendChild(c2);

      const c3 = document.createElement('span');
      const marca = document.createElement('span');
      if (n >= limite) { marca.className = 'badge danger'; marca.textContent = 'Archivar ya'; }
      else if (n >= aviso) { marca.className = 'badge warn'; marca.textContent = 'Preparar archivo'; }
      else { marca.className = 'badge ok'; marca.textContent = 'Normal'; }
      c3.appendChild(marca);
      fila.appendChild(c3);

      tabla.appendChild(fila);
    });
    cont.appendChild(tabla);
  }

  window.Pruebas = {
    preparar: function () { prepararPruebas(); prepararRefresco(); cargarEstado(); prepararRestos(); },
    cargarEstado: cargarEstado,
    revisarRestos: revisarRestos,
    prepararRestos: prepararRestos,
  };
})();
