/**
 * empresas.js — pantalla de cumplimiento por empresa contratista.
 */
(function () {
  'use strict';

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    const caja = document.getElementById('avisoEmpresas');
    if (!caja) return;
    caja.textContent = texto;
    caja.className = 'msg mostrar ' + (tipo || 'info');
  }

  function colorCumplimiento(pct) {
    if (pct === null || pct === undefined) return 'gray';
    if (pct >= 80) return 'ok';
    if (pct >= 60) return 'warn';
    return 'danger';
  }

  // --- Ficha de cada empresa: ver, crear, corregir, activar o desactivar ---
  let fichas = [];
  let editando = null;

  function avisoFicha(texto, tipo) {
    const caja = document.getElementById('avisoFicha');
    if (!caja) return;
    caja.textContent = texto || '';
    caja.className = 'msg' + (texto ? ' mostrar ' + (tipo || 'ok') : '');
  }

  function campo(valor) { return valor === null || valor === undefined ? '—' : String(valor); }

  function pintarFichas() {
    const cont = document.getElementById('listaFichas');
    if (!cont) return;
    cont.textContent = '';

    const cuenta = document.getElementById('conteoFichas');
    if (cuenta) {
      const activas = fichas.filter(function (f) { return f.activo; }).length;
      cuenta.textContent = activas + ' activas · ' + fichas.length + ' en total';
    }

    const verInactivas = (document.getElementById('empVerInactivas') || {}).checked;
    const lista = fichas.filter(function (f) { return verInactivas || f.activo; });

    if (!lista.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay empresas registradas.'));
      return;
    }

    lista.forEach(function (f) {
      const caja = el('article', 'ficha' + (f.activo ? '' : ' ficha-inactiva'));

      const cab = el('div', 'ficha-cab');
      cab.appendChild(el('h3', null, f.razon_social));
      if (!f.activo) cab.appendChild(el('span', 'badge gray', 'Inactiva'));
      if (f.vencida) {
        cab.appendChild(el('span', 'badge danger', 'Contrato vencido'));
      } else {
        const dias = f.vigencia_hasta
          ? Math.round((new Date(f.vigencia_hasta) - new Date(new Date().toISOString().slice(0, 10))) / 86400000)
          : null;
        if (dias !== null && dias >= 0 && dias <= 30) {
          cab.appendChild(el('span', 'badge warn',
            dias === 0 ? 'Vence hoy' : 'Vence en ' + dias + (dias === 1 ? ' día' : ' días')));
        }
      }
      caja.appendChild(cab);

      const datos = el('div', 'ficha-datos');
      [['NIT', f.nit], ['Contacto', f.contacto], ['Correo', f.email], ['Teléfono', f.telefono],
       ['Contrato', f.contrato_numero], ['Vigencia', (f.vigencia_desde || f.vigencia_hasta)
         ? (f.vigencia_desde || '—') + ' → ' + (f.vigencia_hasta || 'sin fin') : ''],
       ['Usuarios', f.usuarios ? f.usuarios + ' registrado(s)' : ''],
      ].forEach(function (par) {
        if (!par[1]) return;
        const linea = el('p', 'ficha-linea');
        linea.appendChild(el('span', 'ficha-etiqueta', par[0]));
        linea.appendChild(el('span', null, campo(par[1])));
        datos.appendChild(linea);
      });
      caja.appendChild(datos);

      const acciones = el('div', 'ficha-acciones');
      // Los permisos son los del servidor (Router.gs): mirar la ficha y el desempeño pueden
      // el administrador, el supervisor y el consejo; escribir, solo el administrador.
      const esAdmin = document.body.dataset.rol === 'ADMIN';
      if (document.body.dataset.rol === 'CONSEJO' && !f.contacto && !f.email && !f.telefono) {
        caja.appendChild(el('p', 'bajada-tarjeta', 'Los datos de contacto no se muestran al consejo.'));
      }
      const desempeno = el('button', 'btn sm', 'Ver desempeño');
      desempeno.type = 'button';
      desempeno.addEventListener('click', function () { abrirFicha(f, desempeno); });
      acciones.appendChild(desempeno);

      if (esAdmin) {
        const editar = el('button', 'btn sm', 'Corregir');
        editar.type = 'button';
        editar.addEventListener('click', function () { abrirFormulario(f); });
        acciones.appendChild(editar);

        const cambiar = el('button', 'btn sm' + (f.activo ? '' : ' primary'),
          f.activo ? 'Desactivar' : 'Activar');
        cambiar.type = 'button';
        cambiar.addEventListener('click', function () { cambiarEstado(f); });
        acciones.appendChild(cambiar);

        // RN-57 · Eliminar: solo para una empresa creada por error o repetida.
        const eliminar = el('button', 'btn sm peligro', 'Eliminar');
        eliminar.type = 'button';
        eliminar.addEventListener('click', function () { eliminarEmpresa(f, caja, eliminar); });
        acciones.appendChild(eliminar);
      }
      caja.appendChild(acciones);

      if (esAdmin) {
        caja.appendChild(el('p', 'bajada-tarjeta',
          'Desactivar la saca de las listas para asignar y conserva su historial. ' +
          'Eliminar es para una empresa creada por error o repetida.'));
      }

      cont.appendChild(caja);
    });
  }

  /**
   * RN-57 a RN-59 · Eliminar una empresa. Pide motivo y doble confirmación; si tiene
   * historial, ofrece desactivarla o fusionarla en vez de perderlo.
   */
  async function eliminarEmpresa(f, caja, boton) {
    const h = f.historial || null;

    // Si no se puede eliminar de una vez (trabajos, planes, propuestas o usuarios),
    // se ofrecen las salidas que no pierden historial.
    if (!f.puede_eliminar) {
      mostrarBloqueoEmpresa(f, caja, h);
      return;
    }

    const motivo = window.prompt(
      '¿Por qué se elimina «' + f.razon_social + '»? (queda en la auditoría)', '');
    if (motivo === null) return;
    if (motivo.trim().length < 10) return aviso('Escribe al menos 10 caracteres de motivo.', 'error');

    // Doble confirmación de 6 segundos, como «Retirar del árbol».
    let armado = false;
    boton.disabled = true;
    boton.textContent = 'Confirmar eliminación (6 s)';
    const reloj = setInterval(function () {
      const quedan = Number((boton.dataset.quedan || '6')) - 1;
      boton.dataset.quedan = String(quedan);
      boton.textContent = quedan > 0 ? 'Confirmar eliminación (' + quedan + ' s)' : 'Eliminar';
      if (quedan <= 0) { clearInterval(reloj); armado = true; boton.disabled = false; }
    }, 1000);
    boton.dataset.quedan = '6';

    boton.addEventListener('click', async function () {
      if (!armado) return;
      clearInterval(reloj);
      boton.disabled = true;
      const r = await API.llamar('empresas.eliminar',
        { id: f.id, motivo: motivo.trim() }, { token: Sesion.token(), idempotente: true });
      if (!r.ok) {
        boton.disabled = false;
        return aviso(r.message || 'No se pudo eliminar.', 'error');
      }
      aviso('Empresa eliminada.', 'ok');
      await cargar();
    }, { once: true });
  }

  /** Con historial no se elimina: se ofrecen las salidas que no lo pierden. */
  function mostrarBloqueoEmpresa(f, caja, h) {
    const previo = caja.querySelector('.bloqueo-empresa');
    if (previo) previo.remove();
    const cajaAviso = el('div', 'bloque bloqueo-empresa');
    const conHistorial = (h.actividades + h.recurrencias + h.propuestas) > 0;
    cajaAviso.appendChild(el('strong', null,
      conHistorial ? 'No se puede eliminar' : 'Falta desvincular a su gente'));

    if (conHistorial) {
      cajaAviso.appendChild(el('p', null,
        'Tiene ' + h.actividades + ' trabajos, ' + h.recurrencias + ' plan(es) y ' +
        h.propuestas + ' propuesta(s) en el historial. Para no perderlo, desactívela o ' +
        'fusiónela con otra.'));
    } else if (h.usuarios) {
      // Solo usuarios: no hay historial que perder, falta decidir qué pasa con ellos.
      const nombres = (f.usuarios_vinculados || []).map(function (u) {
        return u.nombre ? u.nombre + ' (' + u.email + ')' : u.email;
      });
      cajaAviso.appendChild(el('p', null,
        'Tiene ' + h.usuarios + ' usuario(s) vinculado(s)' +
        (nombres.length ? ': ' + nombres.slice(0, 4).join(', ') +
          (nombres.length > 4 ? ' y ' + (nombres.length - 4) + ' más' : '') : '') +
        '. Si la elimina sin más, esa persona queda sin empresa y no puede hacer nada.'));
    }

    if (h.usuarios && !(h.actividades + h.recurrencias + h.propuestas)) {
      const desvincular = el('button', 'btn sm primary', 'Desvincular usuarios y eliminar');
      desvincular.type = 'button';
      desvincular.addEventListener('click', async function () {
        const motivo = window.prompt('Motivo (queda en la auditoría)', '');
        if (!motivo || motivo.trim().length < 10) return aviso('Escribe el motivo.', 'error');
        desvincular.disabled = true;
        const r = await API.llamar('empresas.eliminar',
          { id: f.id, motivo: motivo.trim(), desvincular_usuarios: true },
          { token: Sesion.token(), idempotente: true });
        desvincular.disabled = false;
        if (!r.ok) return aviso(r.message || 'No se pudo eliminar.', 'error');
        aviso('Empresa eliminada y ' + r.data.desvinculados + ' usuario(s) desvinculado(s).', 'ok');
        await cargar();
      });
      cajaAviso.appendChild(desvincular);
    }

    // RN-60 · Fusionar: mover todo a la empresa correcta y conservar el historial.
    if ((h.actividades + h.recurrencias + h.propuestas) > 0) {
      const otras = fichas.filter(function (x) {
        return x.activo && String(x.id) !== String(f.id);
      });
      if (otras.length) {
        const sel = el('select', 'item-input');
        otras.forEach(function (x) {
          const op = el('option', null, x.razon_social + (x.nit ? ' · ' + x.nit : ''));
          op.value = x.id;
          sel.appendChild(op);
        });
        const etiquetaSel = el('p', 'bajada-tarjeta', 'Fusionar con');
        cajaAviso.appendChild(etiquetaSel);
        cajaAviso.appendChild(sel);
        const fusionar = el('button', 'btn sm primary', 'Fusionar');
        fusionar.type = 'button';
        fusionar.addEventListener('click', async function () {
          const destino = otras.filter(function (x) { return String(x.id) === String(sel.value); })[0];
          const motivo = window.prompt('Motivo de la fusión (queda en la auditoría)', '');
          if (motivo === null) return;
          if (motivo.trim().length < 10) return aviso('Escribe al menos 10 caracteres.', 'error');
          if (!window.confirm('Se moverán ' + h.usuarios + ' usuario(s), ' + h.actividades +
              ' trabajo(s), ' + h.recurrencias + ' plan(es) y ' + h.propuestas +
              ' propuesta(s) a ' + (destino ? destino.razon_social : 'la otra empresa') +
              '. Esto no se puede deshacer. ¿Seguir?')) return;
          fusionar.disabled = true;
          const r = await API.llamar('empresas.fusionar',
            { id: f.id, destino_id: sel.value, motivo: motivo.trim() },
            { token: Sesion.token(), idempotente: true });
          fusionar.disabled = false;
          if (!r.ok) return aviso(r.message || 'No se pudo fusionar.', 'error');
          const m = r.data.movidos || {};
          aviso('Fusionada en ' + r.data.destino.razon_social + ': ' + (m.usuarios || 0) +
            ' usuario(s), ' + (m.actividades || 0) + ' trabajo(s), ' + (m.recurrencias || 0) +
            ' plan(es) y ' + (m.propuestas || 0) + ' propuesta(s).', 'ok');
          await cargar();
        });
        cajaAviso.appendChild(fusionar);
      }
    }

    const cerrar = el('button', 'btn sm', 'Entendido');
    cerrar.type = 'button';
    cerrar.addEventListener('click', function () { cajaAviso.remove(); });
    cajaAviso.appendChild(cerrar);
    caja.appendChild(cajaAviso);
  }

  /** Ficha de desempeño de una empresa, con su semáforo y su tendencia. */
  async function abrirFicha(f, boton) {
    const previa = document.getElementById('fichaDesempeno');
    if (previa) { previa.remove(); if (boton.dataset.abierta === '1') { boton.dataset.abierta = '0'; return; } }
    boton.dataset.abierta = '1';
    boton.disabled = true;

    const caja = el('div', 'ficha-desempeno');
    caja.id = 'fichaDesempeno';
    caja.appendChild(el('p', 'bajada-tarjeta', 'Calculando el desempeño…'));
    const contenedor = boton.closest('.ficha');
    if (contenedor) contenedor.appendChild(caja);

    const r = await API.llamar('empresas.ficha', { empresa_id: f.id }, { token: Sesion.token() });
    boton.disabled = false;
    if (!r.ok) {
      caja.textContent = '';
      caja.appendChild(el('p', 'msg mostrar error', r.message || 'No se pudo calcular la ficha.'));
      return;
    }
    caja.textContent = '';

    const d = r.data;
    const s = d.semaforo || {};
    const semaforo = el('div', 'ficha-semaforo ' + String(s.estado || '').toLowerCase());
    semaforo.appendChild(el('strong', null, s.etiqueta || s.estado || ''));
    if (s.motivo) semaforo.appendChild(el('span', null, ' · ' + s.motivo));
    caja.appendChild(semaforo);

    const ind = d.indicadores || {};
    const filas = [
      ['Trabajos asignados', ind.asignados],
      ['Terminados', ind.terminados],
      ['A tiempo', ind.a_tiempo_pct === null ? '—' : ind.a_tiempo_pct + ' %'],
      ['Devueltos', ind.devueltos_pct === null ? '—' : ind.devueltos_pct + ' %'],
      ['Vencidos hoy', ind.vencidos_hoy],
      ['Días para empezar', ind.dias_para_iniciar === null ? '—' : ind.dias_para_iniciar + ' d'],
      ['Novedades en sus equipos', ind.novedades_abiertas + ' abiertas · ' + ind.novedades_resueltas + ' resueltas'],
      ['Propuestas', ind.propuestas_enviadas + ' enviadas · ' + ind.propuestas_aprobadas + ' aprobadas'],
      ['Valor aprobado', '$ ' + Number(ind.valor_aprobado || 0).toLocaleString('es-CO')],
      ['Contrato', d.empresa.vigencia_hasta
        ? d.empresa.vigencia_hasta + (d.empresa.dias_contrato !== null ? ' · ' + d.empresa.dias_contrato + ' días' : '')
        : 'Sin fecha'],
    ];
    const lista = el('div', 'ficha-indicadores');
    filas.forEach(function (par) {
      const linea = el('p', 'ficha-linea');
      linea.appendChild(el('span', 'ficha-etiqueta', par[0]));
      linea.appendChild(el('span', null, String(par[1] === null || par[1] === undefined ? '—' : par[1])));
      lista.appendChild(linea);
    });
    caja.appendChild(lista);

    // Tendencia: barras propias, sin librerías
    const tendencia = d.tendencia || [];
    if (tendencia.length) {
      caja.appendChild(el('p', 'ficha-etiqueta', 'A tiempo y devueltos por mes'));
      const grafica = el('div', 'ficha-tendencia');
      tendencia.forEach(function (t) {
        const col = el('div', 'ficha-mes');
        const barra = el('div', 'ficha-barra');
        const alto = t.a_tiempo_pct === null ? 0 : Math.max(2, t.a_tiempo_pct);
        barra.style.height = alto + '%';
        barra.title = t.mes + ': ' + (t.a_tiempo_pct === null ? 'sin datos' : t.a_tiempo_pct + ' % a tiempo');
        if (t.rechazo_pct) barra.classList.add('con-devueltos');
        col.appendChild(barra);
        col.appendChild(el('span', 'ficha-mes-etiqueta', t.mes.slice(5)));
        grafica.appendChild(col);
      });
      caja.appendChild(grafica);
      if ((d.meses_sin_datos || []).length) {
        caja.appendChild(el('p', 'bajada-tarjeta',
          'Sin datos de ' + d.meses_sin_datos.join(', ') + '.'));
      }
    }
  }

  function abrirFormulario(f) {
    editando = f || null;
    const form = document.getElementById('formEmpresa');
    if (!form) return;
    form.classList.remove('oculto');
    const v = function (id) { return document.getElementById(id); };
    v('empRazon').value = f ? (f.razon_social || '') : '';
    v('empNit').value = f ? (f.nit || '') : '';
    v('empContacto').value = f ? (f.contacto || '') : '';
    v('empCorreo').value = f ? (f.email || '') : '';
    v('empTelefono').value = f ? (f.telefono || '') : '';
    v('empContrato').value = f ? (f.contrato_numero || '') : '';
    v('empDesde').value = f ? (f.vigencia_desde || '') : '';
    v('empHasta').value = f ? (f.vigencia_hasta || '') : '';
    avisoFicha('');
    v('empRazon').focus();
  }

  function cerrarFormulario() {
    editando = null;
    const form = document.getElementById('formEmpresa');
    if (form) form.classList.add('oculto');
    avisoFicha('');
  }

  async function cargarFichas() {
    const verInactivas = (document.getElementById('empVerInactivas') || {}).checked;
    const r = await API.llamar('empresas.listar', { todas: verInactivas || true },
      { token: Sesion.token() });
    if (!r.ok) {
      const cont = document.getElementById('listaFichas');
      if (cont) { cont.textContent = ''; cont.appendChild(el('div', 'vacio', r.message || 'No se pudieron cargar las empresas.')); }
      return;
    }
    fichas = r.data.empresas || [];
    Datos.invalidar('empresas.listar');
    pintarFichas();
  }

  async function cambiarEstado(f) {
    const que = f.activo ? 'desactivar' : 'activar';
    let apagarUsuarios = false;
    if (f.activo) {
      const cuantos = Number(f.usuarios || 0);
      const texto = '¿Desactivar «' + f.razon_social + '»?\n\nDejará de aparecer al asignar trabajo.' +
        (cuantos ? '\n\nTiene ' + cuantos + ' usuario(s) vinculado(s). Se desactivarán también.' : '');
      if (!window.confirm(texto)) return;
      apagarUsuarios = cuantos > 0;
    }
    const r = await API.llamar('empresas.estado',
      { id: f.id, activo: !f.activo, desactivar_usuarios: apagarUsuarios },
      { token: Sesion.token(), idempotente: true });
    if (!r.ok) { avisoFicha(r.message || 'No se pudo ' + que + ' la empresa.', 'error'); return; }
    const apagados = (r.data && r.data.usuarios_apagados) || 0;
    avisoFicha('Empresa ' + (f.activo ? 'desactivada' : 'activada') + '.' +
      (apagados ? ' Se desactivaron ' + apagados + ' usuario(s).' : ''), 'ok');
    await cargarFichas();
  }

  function prepararFichas() {
    const form = document.getElementById('formEmpresa');
    const nueva = document.getElementById('btnNuevaEmpresa');
    const cancelar = document.getElementById('btnCancelarEmpresa');
    const ver = document.getElementById('empVerInactivas');
    if (ver) ver.addEventListener('change', pintarFichas);
    if (nueva) nueva.addEventListener('click', function () { abrirFormulario(null); });
    if (cancelar) cancelar.addEventListener('click', cerrarFormulario);
    if (!form) return;

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const boton = document.getElementById('btnGuardarEmpresa');
      boton.disabled = true;
      const payload = {
        razon_social: document.getElementById('empRazon').value.trim(),
        nit: document.getElementById('empNit').value.trim(),
        contacto: document.getElementById('empContacto').value.trim(),
        email: document.getElementById('empCorreo').value.trim(),
        telefono: document.getElementById('empTelefono').value.trim(),
        contrato_numero: document.getElementById('empContrato').value.trim(),
        vigencia_desde: document.getElementById('empDesde').value,
        vigencia_hasta: document.getElementById('empHasta').value,
      };
      if (editando) payload.id = editando.id;
      const r = await API.llamar('empresas.guardar', payload, { token: Sesion.token(), idempotente: true });
      boton.disabled = false;
      if (!r.ok) { avisoFicha(r.message || 'No se pudo guardar la empresa.', 'error'); return; }
      avisoFicha(editando ? 'Empresa corregida.' : 'Empresa creada.', 'ok');
      cerrarFormulario();
      await cargarFichas();
    });
  }

  async function cargar(mes) {
    const r = await API.llamar('kpi.panel', mes ? { mes: mes } : {}, { token: Sesion.token() });
    if (!r.ok) return aviso(r.message || 'No se pudieron cargar los indicadores.', 'error');

    const conjunto = r.data.conjunto || {};
    const resumen = document.getElementById('kpiConjunto');
    if (resumen) {
      resumen.textContent = '';
      [
        { n: conjunto.programadas || 0, l: 'Programadas del mes', a: 'indigo' },
        { n: conjunto.ejecutadas || 0, l: 'Ejecutadas', a: 'ok' },
        { n: (conjunto.cumplimiento_pct === null ? '—' : conjunto.cumplimiento_pct + '%'), l: 'Cumplimiento', a: colorCumplimiento(conjunto.cumplimiento_pct) },
        { n: conjunto.vencidas || 0, l: 'Vencidas', a: conjunto.vencidas ? 'danger' : 'ok' },
        { n: conjunto.reportes_pendientes || 0, l: 'Reportes por revisar', a: conjunto.reportes_pendientes ? 'warn' : 'ok' },
      ].forEach(function (k) {
        const caja = el('div', 'kpi acento-' + k.a);
        caja.appendChild(el('div', 'kpi-n', String(k.n)));
        caja.appendChild(el('div', 'kpi-l', k.l));
        resumen.appendChild(caja);
      });
    }

    const cont = document.getElementById('listaEmpresas');
    if (!cont) return;
    cont.textContent = '';
    const empresas = r.data.empresas || [];
    if (!empresas.length) {
      cont.appendChild(el('div', 'vacio', 'Todavía no hay empresas con actividades.'));
      return;
    }

    const tabla = el('div', 'tabla-empresas');
    const cab = el('div', 'tabla-fila tabla-cab');
    ['Empresa', 'Programadas', 'Cumplidas', 'Cumplimiento', 'A tiempo', 'Vencidas', 'Rechazo', 'Días para iniciar'].forEach(function (t) {
      cab.appendChild(el('span', null, t));
    });
    tabla.appendChild(cab);

    empresas.forEach(function (e) {
      const fila = el('div', 'tabla-fila');
      fila.appendChild(el('span', 'tabla-empresa', e.razon_social));
      fila.appendChild(el('span', null, String(e.programadas)));
      fila.appendChild(el('span', null, String(e.cumplidas)));
      const cum = el('span');
      cum.appendChild(el('span', 'badge ' + colorCumplimiento(e.cumplimiento_pct),
        e.cumplimiento_pct === null ? '—' : e.cumplimiento_pct + '%'));
      fila.appendChild(cum);
      fila.appendChild(el('span', null, e.a_tiempo_pct === null ? '—' : e.a_tiempo_pct + '%'));
      fila.appendChild(el('span', e.vencidas ? 'texto-danger' : null, String(e.vencidas)));
      fila.appendChild(el('span', null, e.rechazo_pct === null ? '—' : e.rechazo_pct + '%'));
      fila.appendChild(el('span', null, e.dias_para_iniciar === null ? '—' : e.dias_para_iniciar + ' d'));
      if (e.vencida) fila.appendChild(el('span', 'badge danger', 'Contrato vencido'));
      tabla.appendChild(fila);
    });
    cont.appendChild(tabla);
  }

  function preparar() {
    // Solo el administrador administra empresas; los demás ven la ficha, sin escritura.
    const soloLectura = document.body.dataset.rol !== 'ADMIN';
    if (soloLectura) {
      const form = document.getElementById('formEmpresa');
      const nueva = document.getElementById('btnNuevaEmpresa');
      if (form) form.remove();
      if (nueva) nueva.remove();
    }
    prepararFichas();
    cargarFichas();

    const sel = document.getElementById('empMes');
    if (!sel) return;
    const hoy = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const valor = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      const op = el('option', null, d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }));
      op.value = valor;
      sel.appendChild(op);
    }
    sel.addEventListener('change', function () { cargar(sel.value); });

    const btn = document.getElementById('btnInforme');
    if (btn) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = 'Generando…';
        const r = await API.llamar('informes.mensual', { mes: sel.value || undefined }, { token: Sesion.token() });
        btn.disabled = false;
        btn.textContent = 'Generar informe mensual';
        if (!r.ok) return aviso(r.message || 'No se pudo generar el informe.', 'error');
        aviso('Informe del mes listo y guardado en Drive.', 'ok');
        const enlace = document.getElementById('enlaceInforme');
        if (enlace) {
          enlace.textContent = '';
          enlace.href = r.data.url;
          enlace.target = '_blank';
          enlace.rel = 'noopener';
          enlace.textContent = 'Abrir ' + r.data.nombre;
          enlace.classList.remove('oculto');
        }
      });
    }
  }

  window.Empresas = { cargar: cargar, preparar: preparar, cargarFichas: cargarFichas };
})();
