/**
 * actividad.js — detalle de una actividad: iniciar con fotos ANTES,
 * reportar el final con checklist y revisar (aprobación del administrador).
 */
(function () {
  'use strict';

  let datos = null;
  const borrador = {};      // respuesta de actividades.get
  let rol = 'CONTRATISTA';
  let fotosAntes = [];   // evidencias subidas en esta sesión
  let fotosDespues = [];

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoActividad');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  const ETIQUETAS = {
    PROGRAMADA: ['Programada', 'gray'], EN_EJECUCION: ['En ejecución', ''],
    REPORTADA: ['Reportada', 'warn'], APROBADA: ['Aprobada', 'ok'],
    RECHAZADA: ['Rechazada', 'danger'], CERRADA: ['Cerrada', 'ok'], CANCELADA: ['Cancelada', 'gray'],
  };

  async function abrir(id, rolUsuario) {
    rol = rolUsuario || 'CONTRATISTA';
    aviso('', 'info');
    const caja = document.getElementById('avisoActividad');
    if (caja) caja.className = 'msg';
    const r = await API.llamar('actividades.get', { id: id }, { token: Sesion.token() });
    if (!r.ok) return aviso(r.message || 'No se pudo abrir la actividad.', 'error');
    datos = r.data;
    fotosAntes = [];
    fotosDespues = [];
    pintar();
    mostrar(true);
  }

  function mostrar(visible) {
    const vista = document.getElementById('vistaActividad');
    const lista = document.getElementById('tarjetaActividades');
    if (vista) {
      if (visible && vista.hasAttribute('hidden')) vista.removeAttribute('hidden');
      vista.classList.toggle('oculto', !visible);
    }
    if (lista) lista.classList.toggle('oculto', !!visible);
    if (vista) {
      if (visible) vista.dataset.abierta = '1';
      else delete vista.dataset.abierta;
    }
    if (visible && window.App) App.pestana('actividades');
    if (visible && vista) vista.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cerrar() { mostrar(false); if (window.App) App.refrescar(); }

  function cabecera() {
    const a = datos.actividad;
    const caja = el('div', 'detalle-cab');
    const izq = el('div');
    const titulo = el('h2', null, a.titulo);
    const meta = el('p', 'bajada-tarjeta');
    const fechas = a.fecha_inicio_plan === a.fecha_fin_plan ? a.fecha_inicio_plan : a.fecha_inicio_plan + ' → ' + a.fecha_fin_plan;
    meta.textContent = (datos.nodo ? datos.nodo.codigo + ' · ' + datos.nodo.nombre : '') + ' · ' + fechas;
    const est = ETIQUETAS[a.estado] || [a.estado, 'gray'];
    const badge = el('span', 'badge ' + est[1], est[0]);
    izq.appendChild(titulo);
    izq.appendChild(meta);
    izq.appendChild(badge);
    caja.appendChild(izq);
    const volver = el('button', 'btn', 'Volver');
    volver.type = 'button';
    volver.addEventListener('click', cerrar);
    caja.appendChild(volver);
    return caja;
  }


  /**
   * Acta: solo tiene sentido cuando el trabajo ya se reportó o se aprobó.
   * Va al final del detalle porque es el cierre del expediente.
   */
  function bloqueActa() {
    const a = datos.actividad;
    const listo = ['REPORTADA', 'APROBADA', 'CERRADA'].indexOf(String(a.estado)) >= 0;
    if (!listo) return null;

    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Cierre'));
    caja.appendChild(el('p', 'bajada-tarjeta',
      'El acta reúne la ficha, el checklist respondido, las evidencias y la revisión. Queda guardada en Drive.'));

    const acciones = el('div', 'acciones-form');
    const btn = el('button', 'btn primary', 'Generar acta en PDF');
    btn.type = 'button';
    const enlace = el('a', 'btn oculto', 'Abrir el acta');
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    const nota = el('p', 'bajada-tarjeta');

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Generando…';
      nota.textContent = '';
      try {
        const r = await API.llamar('actividades.acta', { id: a.id }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) {
          nota.textContent = r.message || 'No se pudo generar el acta.';
          nota.className = 'bajada-tarjeta aviso-error';
          return;
        }
        enlace.href = r.data.url;
        enlace.classList.remove('oculto');
        enlace.textContent = 'Abrir ' + (r.data.nombre || 'el acta');
        nota.textContent = 'Acta lista: ' + (r.data.items || 0) + ' ítems y ' +
          (r.data.evidencias || 0) + ' evidencias.';
        nota.className = 'bajada-tarjeta';
      } catch (e) {
        nota.textContent = 'La generación tardó demasiado o falló. Intenta de nuevo.';
        nota.className = 'bajada-tarjeta aviso-error';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generar acta en PDF';
      }
    });

    acciones.appendChild(btn);
    acciones.appendChild(enlace);
    caja.appendChild(acciones);
    caja.appendChild(nota);
    return caja;
  }

  function bloqueEvidencias() {
    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Evidencia'));
    const ev = datos.evidencias || [];
    const antes = ev.filter(function (e) { return e.momento === 'ANTES'; });
    const despues = ev.filter(function (e) { return e.momento === 'DESPUES'; });
    function detalleFoto(e) {
      const subida = (e.fecha_subida || '').replace('T', ' ').slice(0, 16);
      const captura = (e.fecha_captura || '').replace('T', ' ').slice(0, 16);
      return captura && captura !== subida ? 'captura ' + captura + ' · subida ' + subida : 'subida ' + subida;
    }
    const lista = el('ul', 'lista-fotos');
    antes.concat(despues).forEach(function (e) {
      const li = el('li', 'fila-foto');
      li.appendChild(el('span', 'badge ' + (e.momento === 'ANTES' ? 'warn' : 'ok'), e.momento));
      li.appendChild(el('span', 'fila-foto-fecha', detalleFoto(e)));
      if (e.contiene_personas) li.appendChild(el('span', 'badge danger', 'con personas'));
      lista.appendChild(li);
    });
    caja.appendChild(lista);



    if (antes.length && despues.length) {
      const comp = el('div', 'comparador');
      [['ANTES', antes[0], 'comparador-antes'], ['DESPUÉS', despues[0], 'comparador-despues']].forEach(function (par) {
        const marco = el('figure', 'comparador-marco ' + par[2]);
        const img = el('img');
        img.alt = par[0] + ': evidencia de la actividad';
        img.loading = 'lazy';
        marco.appendChild(img);
        const pie = el('figcaption', null, par[0]);
        marco.appendChild(pie);
        comp.appendChild(marco);
        cargarMiniatura(par[1].id, img);
      });
      caja.appendChild(comp);
    }
    return caja;
  }

  async function cargarMiniatura(id, img) {
    const r = await API.llamar('evidencias.get', { id: id, tam: 'grande' }, { token: Sesion.token() });
    if (!r.ok) return;
    img.src = 'data:' + r.data.mime + ';base64,' + r.data.base64;
  }

  function guardarBorrador(input) {
    if (!datos || !datos.actividad) return;
    const id = datos.actividad.id;
    borrador[id] = borrador[id] || { respuestas: {}, condicion: '', descripcion: '' };
    if (input.dataset.item) borrador[id].respuestas[input.dataset.item] = input.value;
    else if (input.id === 'condicionFinal') borrador[id].condicion = input.value;
    else if (input.id === 'descripcionReporte') borrador[id].descripcion = input.value;
  }

  function borradorDe(id) {
    borrador[id] = borrador[id] || { respuestas: {}, condicion: '', descripcion: '' };
    return borrador[id];
  }

  function aplicarBorrador(input) {
    if (!datos || !datos.actividad) return;
    const b = borradorDe(datos.actividad.id);
    if (input.dataset.item && b.respuestas[input.dataset.item] !== undefined) {
      input.value = b.respuestas[input.dataset.item];
      return;
    }
    if (input.id === 'condicionFinal' && b.condicion) input.value = b.condicion;
    if (input.id === 'descripcionReporte' && b.descripcion) input.value = b.descripcion;
  }

  function bloqueChecklist(editable) {
    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Checklist'));
    if (!datos.plantilla || !datos.plantilla.items.length) {
      caja.appendChild(el('p', 'bajada-tarjeta', 'Esta actividad no tiene checklist: se reporta con la descripción y las fotos.'));
      return caja;
    }
    datos.plantilla.items.forEach(function (item) {
      const fila = el('div', 'item-check');
      const etiqueta = el('label', 'item-pregunta', item.pregunta);
      etiqueta.htmlFor = 'item_' + item.id;
      fila.appendChild(etiqueta);

      if (item.tipo_respuesta === 'SI_NO') {
        const sel = el('select', 'item-input');
        sel.id = 'item_' + item.id;
        sel.dataset.item = item.id;
        [['', 'Selecciona…'], ['SI', 'Sí'], ['NO', 'No'], ['NA', 'No aplica']].forEach(function (o) {
          const op = el('option', null, o[1]);
          op.value = o[0];
          sel.appendChild(op);
        });
        fila.appendChild(sel);
      } else if (item.tipo_respuesta === 'NUMERO') {
        const inp = el('input', 'item-input');
        inp.id = 'item_' + item.id;
        inp.type = 'number';
        inp.step = 'any';
        inp.dataset.item = item.id;
        inp.placeholder = item.unidad ? 'Valor en ' + item.unidad : 'Valor';
        fila.appendChild(inp);
      } else {
        const inp = el('input', 'item-input');
        inp.id = 'item_' + item.id;
        inp.type = 'text';
        inp.dataset.item = item.id;
        inp.placeholder = 'Observación';
        fila.appendChild(inp);
      }

      const control = fila.querySelector('.item-input');
      if (control) {
        aplicarBorrador(control);
        control.addEventListener('input', function () { guardarBorrador(control); });
        control.addEventListener('change', function () { guardarBorrador(control); });
      }

      if (item.criterio) {
        const crit = el('span', 'item-criterio', item.criterio);
        fila.appendChild(crit);
      }
      caja.appendChild(fila);
    });
    return caja;
  }

  function bloqueFotos(momento, destino, maximo) {
    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', momento === 'ANTES' ? 'Fotos de antes' : 'Fotos de después'));
    caja.appendChild(el('p', 'bajada-tarjeta',
      momento === 'ANTES'
        ? 'Toma 1 o 2 fotos del estado en que encuentras el área antes de trabajar.'
        : 'Toma 1 o 2 fotos del trabajo terminado, con el mismo encuadre del antes.'));

    const cont = el('div', 'fotos');
    destino.forEach(function (f) {
      const chip = el('span', 'badge ok', 'Foto lista (' + f.kb + ' KB)');
      cont.appendChild(chip);
    });
    caja.appendChild(cont);

    if (destino.length >= maximo) return caja;

    const inp = el('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.setAttribute('capture', 'environment');
    inp.className = 'oculto';
    inp.id = 'file_' + momento;

    const btn = el('button', 'btn', 'Tomar foto');
    btn.type = 'button';
    btn.addEventListener('click', function () { inp.click(); });

    inp.addEventListener('change', async function () {
      const file = inp.files && inp.files[0];
      if (!file) return;
      btn.disabled = true;
      btn.textContent = 'Comprimiendo…';
      try {
        const prep = await Fotos.preparar(file);
        const r = await API.llamar('evidencias.upload', {
          actividad_id: datos.actividad.id,
          momento: momento,
          base64: prep.base64,
          base64_mini: prep.base64_mini,
          mime: 'image/jpeg',
          sha256: prep.sha256,
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) throw new Error(r.message || 'No se pudo subir la foto.');
        destino.push({ id: r.data.evidencia_id, kb: prep.kb });

        // Confirmación visible: la foto queda a la vista, no solo un mensaje.
        const previa = document.createElement('img');
        previa.className = 'foto-previa';
        previa.alt = 'Foto de ' + momento.toLowerCase() + ' cargada';
        previa.src = 'data:image/jpeg;base64,' + prep.base64_mini;
        const ya = caja.querySelector('.foto-previa');
        if (ya) ya.remove();
        caja.appendChild(previa);

        btn.disabled = false;
        btn.textContent = 'Foto de ' + momento.toLowerCase() + ' lista ✓';
        btn.classList.add('cargada');
        aviso('Foto de ' + momento.toLowerCase() + ' cargada (' + prep.kb + ' KB).', 'ok');
        pintar();
      } catch (err) {
        aviso(err.message || 'No se pudo subir la foto.', 'error');
        btn.disabled = false;
        btn.textContent = 'Tomar foto';
      }
    });

    caja.appendChild(btn);
    caja.appendChild(inp);
    return caja;
  }

  function bloqueHitos() {
    const a = datos.actividad;
    const hitos = datos.hitos || [];
    if (!hitos.length && rol !== 'ADMIN') return null;

    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Etapas del trabajo'));

    if (a.ritmo) {
      const ritmo = el('div', 'ritmo');
      const esperado = el('span', 'ritmo-marca');
      esperado.style.left = Math.max(0, Math.min(100, a.ritmo.esperado)) + '%';
      esperado.title = 'Debería ir en ' + a.ritmo.esperado + '%';
      const barra = el('div', 'ritmo-barra');
      const relleno = el('i');
      relleno.style.width = Math.max(0, Math.min(100, a.avance_aprobado_pct)) + '%';
      barra.appendChild(relleno);
      barra.appendChild(esperado);
      ritmo.appendChild(barra);
      const txt = el('p', 'bajada-tarjeta');
      txt.textContent = 'Aprobado ' + a.avance_aprobado_pct + '% · esperado a hoy ' + a.ritmo.esperado +
        '% · día ' + a.ritmo.dias_transcurridos + ' de ' + a.ritmo.dias_plan +
        (a.ritmo.en_riesgo ? ' · va con retraso' : ' · al ritmo previsto');
      ritmo.appendChild(txt);
      if (a.ritmo.en_riesgo) ritmo.appendChild(el('span', 'badge danger', 'En riesgo'));
      caja.appendChild(ritmo);
    }

    if (!hitos.length) {
      caja.appendChild(el('p', 'bajada-tarjeta', 'Esta actividad no tiene etapas definidas.'));
    } else {
      hitos.forEach(function (h) {
        const fila = el('div', 'item-check');
        const cab = el('div', 'hito-cab');
        cab.appendChild(el('span', 'item-pregunta', h.orden + '. ' + h.nombre));
        const estado = { PENDIENTE: ['Pendiente', 'gray'], REPORTADO: ['Reportado', 'warn'], APROBADO: ['Aprobado', 'ok'], RECHAZADO: ['Rechazado', 'danger'], CANCELADO: ['Cancelado', 'gray'] }[h.estado] || [h.estado, 'gray'];
        cab.appendChild(el('span', 'badge ' + estado[1], estado[0]));
        fila.appendChild(cab);
        const meta = el('span', 'item-criterio', 'Peso ' + h.peso + (h.fecha_plan ? ' · ' + h.fecha_plan : ''));
        fila.appendChild(meta);

        if (rol !== 'ADMIN' && (h.estado === 'PENDIENTE' || h.estado === 'RECHAZADO') && a.estado === 'EN_EJECUCION') {
          const btn = el('button', 'btn sm', 'Reportar esta etapa');
          btn.type = 'button';
          btn.addEventListener('click', async function () {
            btn.disabled = true;
            const r = await API.llamar('reportes.crear', {
              actividad_id: a.id,
              tipo: 'AVANCE',
              hito_id: h.id,
              pct_declarado: h.peso,
              descripcion: 'Etapa reportada: ' + h.nombre,
            }, { token: Sesion.token(), idempotente: true });
            btn.disabled = false;
            if (!r.ok) return aviso(r.message || 'No se pudo reportar.', 'error');
            aviso('Etapa reportada. La administración debe aprobarla.', 'ok');
            abrir(a.id, rol);
          });
          fila.appendChild(btn);
        }
        caja.appendChild(fila);
      });
    }

    if (rol === 'ADMIN' && a.estado !== 'CERRADA' && a.estado !== 'CANCELADA') {
      const btn = el('button', 'btn sm', hitos.length ? 'Reemplazar etapas' : 'Definir etapas');
      btn.type = 'button';
      btn.addEventListener('click', function () { formularioHitos(); });
      caja.appendChild(btn);
    }
    return caja;
  }

  function formularioHitos() {
    const caja = bloqueFormulario('Etapas del trabajo');
    caja.appendChild(el('p', 'bajada-tarjeta', 'Una línea por etapa: nombre | peso | fecha. El peso define cuánto aporta al avance.'));
    const area = el('textarea', 'item-input');
    area.id = 'hitosTexto';
    area.placeholder = 'Desmontaje | 2 | 2026-11-03\nImpermeabilización | 5 | 2026-11-06\nRemate y limpieza | 1 | 2026-11-08';
    const actuales = (datos.hitos || []).filter(function (h) { return h.estado !== 'APROBADO'; });
    area.value = actuales.map(function (h) { return h.nombre + ' | ' + h.peso + ' | ' + (h.fecha_plan || ''); }).join('\n');
    caja.appendChild(area);

    const acciones = el('div', 'acciones-form');
    const guardar = el('button', 'btn primary', 'Guardar etapas');
    guardar.type = 'button';
    guardar.addEventListener('click', async function () {
      const lineas = area.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      const hitos = lineas.map(function (l) {
        const p = l.split('|').map(function (x) { return x.trim(); });
        return { nombre: p[0], peso: Number(p[1]) || 1, fecha_plan: p[2] || '' };
      });
      if (!hitos.length) return aviso('Escribe al menos una etapa.', 'error');
      guardar.disabled = true;
      const r = await API.llamar('hitos.guardar', {
        actividad_id: datos.actividad.id, hitos: hitos,
      }, { token: Sesion.token(), idempotente: true });
      guardar.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudieron guardar.', 'error');
      aviso('Etapas guardadas: ' + r.data.hitos + ' con peso total ' + r.data.peso_total + '.', 'ok');
      abrir(datos.actividad.id, rol);
    });
    const volver = el('button', 'btn', 'Volver');
    volver.type = 'button';
    volver.addEventListener('click', function () { pintar(); });
    acciones.appendChild(guardar);
    acciones.appendChild(volver);
    caja.appendChild(acciones);
    document.getElementById('contenidoActividad').appendChild(caja);
  }

  function acciones() {
    const caja = el('div', 'bloque acciones-detalle');
    const a = datos.actividad;

    if (a.estado === 'PROGRAMADA') {
      const btn = el('button', 'btn primary', 'Iniciar con fotos de antes');
      btn.type = 'button';
      btn.disabled = fotosAntes.length === 0;
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        const r = await API.llamar('actividades.iniciar', {
          id: a.id,
          evidencia_ids: fotosAntes.map(function (f) { return f.id; }),
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) {
          btn.disabled = false;
          return aviso(r.message || 'No se pudo iniciar.', 'error');
        }
        aviso('Actividad iniciada. Ya puedes reportar el final cuando termines.', 'ok');
        abrir(a.id, rol);
      });
      caja.appendChild(btn);
      if (fotosAntes.length === 0) caja.appendChild(el('p', 'bajada-tarjeta', 'Sube primero una foto de antes.'));
    }

    if (a.estado === 'EN_EJECUCION') {
      const cajaTexto = el('div', 'item-check');
      const etiquetaTexto = el('label', 'item-pregunta', '¿Qué se hizo?');
      etiquetaTexto.htmlFor = 'descripcionReporte';
      cajaTexto.appendChild(etiquetaTexto);
      const texto = el('textarea', 'item-input');
      texto.id = 'descripcionReporte';
      texto.rows = 3;
      texto.placeholder = 'Describe el trabajo realizado, las piezas cambiadas y lo que quede pendiente.';
      aplicarBorrador(texto);
      texto.addEventListener('input', function () { guardarBorrador(texto); });
      cajaTexto.appendChild(texto);
      caja.appendChild(cajaTexto);

      const btn = el('button', 'btn primary', 'Enviar reporte final');
      btn.type = 'button';
      btn.addEventListener('click', async function () {
        const respuestas = [];
        document.querySelectorAll('.item-input').forEach(function (i) {
          if (i.value) respuestas.push({ item_id: i.dataset.item, valor: i.value });
        });
        const cond = document.getElementById('condicionFinal');
        btn.disabled = true;
        const r = await API.llamar('reportes.crear', {
          actividad_id: a.id,
          tipo: 'FINAL',
          respuestas: respuestas,
          evidencia_ids: fotosDespues.map(function (f) { return f.id; }),
          condicion_operativa: cond ? cond.value : '',
          descripcion: (document.getElementById('descripcionReporte') || {}).value || '',
        }, { token: Sesion.token(), idempotente: true });
        btn.disabled = false;
        if (!r.ok) return aviso(r.message || 'No se pudo enviar el reporte.', 'error');
        aviso('Reporte enviado. Queda pendiente de revisión de la administración.', 'ok');
        abrir(a.id, rol);
      });
      caja.appendChild(btn);
    }

    if (rol === 'ADMIN' && ['CERRADA', 'CANCELADA'].indexOf(a.estado) < 0) {
      const editar = el('button', 'btn', 'Editar');
      editar.type = 'button';
      editar.addEventListener('click', function () { formularioEdicion(); });

      const cancelar = el('button', 'btn peligro', 'Cancelar actividad');
      cancelar.type = 'button';
      cancelar.addEventListener('click', function () { formularioCancelacion(); });

      caja.appendChild(editar);
      caja.appendChild(cancelar);
    }

    if (a.estado === 'REPORTADA' && rol === 'ADMIN') {
      const nota = el('textarea', 'item-input');
      nota.id = 'comentarioRevision';
      nota.placeholder = 'Observación de la revisión (obligatoria si rechazas)';
      caja.appendChild(nota);

      const aprobar = el('button', 'btn primary', 'Aprobar reporte');
      aprobar.type = 'button';
      aprobar.addEventListener('click', async function () {
        const r = await API.llamar('reportes.revisar', {
          reporte_id: datos.reportes[datos.reportes.length - 1].id,
          decision: 'APROBAR',
          comentario: nota.value,
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) return aviso(r.message || 'No se pudo aprobar.', 'error');
        aviso('Reporte aprobado. El avance ya cuenta y el semáforo se recalculó.', 'ok');
        abrir(a.id, rol);
      });

      const rechazar = el('button', 'btn', 'Rechazar');
      rechazar.type = 'button';
      rechazar.addEventListener('click', async function () {
        const r = await API.llamar('reportes.revisar', {
          reporte_id: datos.reportes[datos.reportes.length - 1].id,
          decision: 'RECHAZAR',
          comentario: nota.value,
        }, { token: Sesion.token(), idempotente: true });
        if (!r.ok) return aviso(r.message || 'No se pudo rechazar.', 'error');
        aviso('Reporte rechazado. El contratista verá el motivo.', 'ok');
        abrir(a.id, rol);
      });

      caja.appendChild(aprobar);
      caja.appendChild(rechazar);
    }

    return caja;
  }

  function bloqueFormulario(titulo) {
    const caja = el('div', 'bloque formulario-detalle');
    caja.appendChild(el('div', 'kicker', titulo));
    return caja;
  }

  function formularioEdicion() {
    const a = datos.actividad;
    const caja = bloqueFormulario('Editar actividad');

    const cTitulo = el('div', 'campo');
    const lTitulo = el('label', null, 'Título');
    lTitulo.htmlFor = 'edTitulo';
    const iTitulo = el('input', 'item-input');
    iTitulo.id = 'edTitulo';
    iTitulo.type = 'text';
    iTitulo.maxLength = 120;
    iTitulo.value = a.titulo;
    cTitulo.appendChild(lTitulo);
    cTitulo.appendChild(iTitulo);
    caja.appendChild(cTitulo);

    const fila = el('div', 'fila-campos');
    [['edInicio', 'Inicio', 'date', a.fecha_inicio_plan], ['edFin', 'Fin', 'date', a.fecha_fin_plan]].forEach(function (f) {
      const c = el('div', 'campo');
      const l = el('label', null, f[1]);
      l.htmlFor = f[0];
      const i = el('input', 'item-input');
      i.id = f[0];
      i.type = f[2];
      i.value = f[3] || '';
      c.appendChild(l);
      c.appendChild(i);
      fila.appendChild(c);
    });
    const cPrioridad = el('div', 'campo');
    const lPrioridad = el('label', null, 'Prioridad');
    lPrioridad.htmlFor = 'edPrioridad';
    const sPrioridad = el('select', 'item-input');
    sPrioridad.id = 'edPrioridad';
    ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'].forEach(function (p) {
      const op = el('option', null, p.charAt(0) + p.slice(1).toLowerCase());
      op.value = p;
      if (p === a.prioridad) op.selected = true;
      sPrioridad.appendChild(op);
    });
    cPrioridad.appendChild(lPrioridad);
    cPrioridad.appendChild(sPrioridad);
    fila.appendChild(cPrioridad);
    caja.appendChild(fila);

    const acciones = el('div', 'acciones-form');
    const guardar = el('button', 'btn primary', 'Guardar cambios');
    guardar.type = 'button';
    const volver = el('button', 'btn', 'Descartar');
    volver.type = 'button';
    volver.addEventListener('click', function () { pintar(); });
    guardar.addEventListener('click', async function () {
      guardar.disabled = true;
      const r = await API.llamar('actividades.editar', {
        id: a.id,
        titulo: iTitulo.value.trim(),
        fecha_inicio_plan: document.getElementById('edInicio').value,
        fecha_fin_plan: document.getElementById('edFin').value || document.getElementById('edInicio').value,
        prioridad: sPrioridad.value,
      }, { token: Sesion.token(), idempotente: true });
      guardar.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudo guardar.', 'error');
      aviso('Actividad actualizada.', 'ok');
      abrir(a.id, rol);
    });
    acciones.appendChild(guardar);
    acciones.appendChild(volver);
    caja.appendChild(acciones);

    const cont = document.getElementById('contenidoActividad');
    cont.appendChild(caja);
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function formularioCancelacion() {
    const a = datos.actividad;
    const caja = bloqueFormulario('Cancelar actividad');
    caja.appendChild(el('p', 'bajada-tarjeta',
      'La actividad no se borra: queda cancelada con su motivo, para que en el historial se sepa por qué no se hizo.'));

    const motivo = el('textarea', 'item-input');
    motivo.id = 'motivoCancelacion';
    motivo.placeholder = 'Motivo (por ejemplo: se programó por error, se cambió de empresa, se reprograma)';
    caja.appendChild(motivo);

    const acciones = el('div', 'acciones-form');
    const confirmar = el('button', 'btn peligro', 'Cancelar la actividad');
    confirmar.type = 'button';
    const volver = el('button', 'btn', 'Volver');
    volver.type = 'button';
    volver.addEventListener('click', function () { pintar(); });
    confirmar.addEventListener('click', async function () {
      if (motivo.value.trim().length < 10) {
        return aviso('Escribe el motivo (al menos 10 caracteres).', 'error');
      }
      confirmar.disabled = true;
      const r = await API.llamar('actividades.cancelar', {
        id: a.id,
        motivo: motivo.value.trim(),
      }, { token: Sesion.token(), idempotente: true });
      confirmar.disabled = false;
      if (!r.ok) return aviso(r.message || 'No se pudo cancelar.', 'error');
      aviso('Actividad cancelada y registrada en auditoría.', 'ok');
      abrir(a.id, rol);
    });
    acciones.appendChild(confirmar);
    acciones.appendChild(volver);
    caja.appendChild(acciones);

    const cont = document.getElementById('contenidoActividad');
    cont.appendChild(caja);
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function condicionSelect() {
    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Cómo queda el elemento'));
    const sel = el('select', 'item-input');
    sel.id = 'condicionFinal';
    const tipo = datos.plantilla && datos.plantilla.items ? null : null;
    ['', 'Operativo', 'Con falla', 'Con novedad', 'Fuera de servicio'].forEach(function (o) {
      const op = el('option', null, o || 'Selecciona…');
      op.value = o;
      sel.appendChild(op);
    });
    caja.appendChild(sel);
    return caja;
  }

  function pintar() {
    const cont = document.getElementById('contenidoActividad');
    if (!cont) return;
    cont.textContent = '';
    cont.appendChild(cabecera());
    const hitos = bloqueHitos();
    if (hitos) cont.appendChild(hitos);

    const a = datos.actividad;
    if (a.estado === 'PROGRAMADA') cont.appendChild(bloqueFotos('ANTES', fotosAntes, 2));
    if (a.estado === 'EN_EJECUCION') {
      cont.appendChild(bloqueChecklist(true));
      cont.appendChild(condicionSelect());
      cont.appendChild(bloqueFotos('DESPUES', fotosDespues, 2));
    }
    if (a.estado === 'REPORTADA' || a.estado === 'APROBADA' || a.estado === 'CERRADA') {
      cont.appendChild(bloqueChecklist(false));
    }
    // La evidencia cargada y el acta cierran el expediente.
    cont.appendChild(bloqueEvidencias());
    const acta = bloqueActa();
    if (acta) cont.appendChild(acta);
    cont.appendChild(acciones());
  }

  window.Actividad = { abrir: abrir };
})();
