/**
 * propuestas.js — el contratista propone una actividad; el administrador la revisa.
 * Todo va dentro de la pestaña Actividades: no añade pestañas nuevas.
 */
(function () {
  'use strict';

  const ETIQUETAS = {
    PENDIENTE: ['Pendiente de aprobación', 'warn'],
    APROBADA: ['Aprobada', 'ok'],
    RECHAZADA: ['No aprobada', 'danger'],
    RETIRADA: ['Retirada', 'gray'],
  };

  let rolActual = 'CONTRATISTA';
  let propuestas = [];
  let nodos = [];
  let fotosNuevas = [];
  let abierta = null;

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    let caja = document.getElementById('avisoPropuestas');
    if (!caja) {
      // Nunca dejar un mensaje sin sitio donde verse.
      caja = el('div', 'msg');
      caja.id = 'avisoPropuestas';
      caja.setAttribute('role', 'status');
      const ancla = document.getElementById('tarjetaActividades')
        || document.getElementById('bloquePropuestasContratista');
      if (!ancla) return;
      ancla.parentNode.insertBefore(caja, ancla);
    }
    caja.textContent = texto || '';
    caja.className = texto ? 'msg mostrar ' + (tipo || 'info') : 'msg';
    if (texto) caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function campo(etiqueta, control, ayuda) {
    const c = el('div', 'campo');
    const l = el('label', null, etiqueta);
    if (control.id) l.htmlFor = control.id;
    c.appendChild(l);
    c.appendChild(control);
    if (ayuda) c.appendChild(el('p', 'bajada-tarjeta', ayuda));
    return c;
  }

  function textarea(id, placeholder, maximo) {
    const t = el('textarea', 'item-input');
    t.id = id;
    t.rows = 3;
    t.maxLength = maximo || 2000;
    t.placeholder = placeholder;
    return t;
  }

  function boton(texto, clase) {
    const b = el('button', clase || 'btn', texto);
    b.type = 'button';
    return b;
  }

  // ---------- carga ----------

  async function cargar(rol, nodosDelArbol) {
    rolActual = rol || 'CONTRATISTA';
    if (nodosDelArbol) nodos = nodosDelArbol;

    // Cada rol ve su bloque y nada más.
    const bloqueContratista = document.getElementById('bloquePropuestasContratista');
    const tarjetaAdmin = document.getElementById('tarjetaPropuestas');
    if (bloqueContratista) bloqueContratista.classList.toggle('oculto', rolActual !== 'CONTRATISTA');
    if (tarjetaAdmin) tarjetaAdmin.classList.toggle('oculto', rolActual === 'CONTRATISTA');

    if (rolActual === 'CONTRATISTA' && !nodos.length && window.App) {
      // Sin árbol cargado no se puede elegir sección: se pide aparte.
      const raiz = await API.llamar('nodos.arbol', {}, { token: Sesion.token() });
      if (raiz.ok) nodos = raiz.data.nodos || [];
    }

    const r = await API.llamar('propuestas.listar', {}, { token: Sesion.token() });
    propuestas = r.ok ? (r.data.propuestas || []) : [];

    if (rolActual === 'CONTRATISTA') pintarContratista();
    else pintarAdministrador();
  }

  // ---------- contratista ----------

  function pintarContratista() {
    const cont = document.getElementById('bloquePropuestasContratista');
    if (!cont) return;
    cont.textContent = '';

    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Propuestas'));
    caja.appendChild(el('p', 'bajada-tarjeta',
      'Si en una visita encuentras algo que hay que hacer, propónlo aquí. La administración lo revisa y decide.'));

    const nuevo = boton('Proponer una actividad', 'btn primary');
    nuevo.addEventListener('click', formulario);
    caja.appendChild(nuevo);

    const pendientes = propuestas.filter(function (p) { return p.estado === 'PENDIENTE'; }).length;
    if (pendientes) {
      caja.appendChild(el('p', 'bajada-tarjeta aviso-paso',
        'Tienes ' + pendientes + ' propuesta(s) esperando revisión.'));
    }

    if (propuestas.length) caja.appendChild(tarjetas(false));
    cont.appendChild(caja);
  }

  function tarjetas(soloLectura) {
    const lista = el('div', 'lista-propuestas');
    propuestas.forEach(function (p) {
      const et = ETIQUETAS[p.estado] || ['', 'gray'];
      const card = el('article', 'propuesta');
      const cab = el('div', 'propuesta-cab');
      cab.appendChild(el('h3', null, p.titulo));
      cab.appendChild(el('span', 'badge ' + et[1], et[0]));
      card.appendChild(cab);

      const meta = el('p', 'propuesta-meta');
      meta.textContent = p.nodo_codigo + ' · ' + p.nodo_nombre +
        ' · inicio ' + p.fecha_inicio_sugerida + ' · ' + p.fotos.length + ' foto(s)';
      card.appendChild(meta);

      if (p.estado === 'RECHAZADA' && p.motivo_rechazo) {
        card.appendChild(el('p', 'propuesta-motivo', 'Motivo: ' + p.motivo_rechazo));
      }
      if (p.estado === 'APROBADA') {
        const ver = boton('Ver la actividad', 'btn-mini');
        ver.addEventListener('click', function () {
          if (window.Actividad) Actividad.abrir(p.actividad_id, rolActual);
        });
        card.appendChild(ver);
      }
      if (p.estado === 'PENDIENTE' && !soloLectura) {
        const retirar = boton('Retirar', 'btn-mini');
        let confirmado = false;
        retirar.addEventListener('click', async function () {
          if (!confirmado) {
            confirmado = true;
            retirar.textContent = 'Confirmar retiro';
            setTimeout(function () { confirmado = false; retirar.textContent = 'Retirar'; }, 6000);
            return;
          }
          const r = await API.llamar('propuestas.retirar', { id: p.id }, { token: Sesion.token(), idempotente: true });
          if (!r.ok) return aviso(r.message || 'No se pudo retirar.', 'error');
          aviso('Propuesta retirada.', 'ok');
          cargar(rolActual);
        });
        card.appendChild(retirar);
      }
      lista.appendChild(card);
    });
    return lista;
  }

  function formulario() {
    const cont = document.getElementById('bloquePropuestasContratista');
    if (!cont) return;
    cont.textContent = '';
    fotosNuevas = [];

    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Nueva propuesta'));

    const sel = el('select', 'item-input');
    sel.id = 'prNodo';
    nodos.forEach(function (n) {
      const op = el('option', null, n.codigo + ' · ' + n.nombre);
      op.value = n.id;
      sel.appendChild(op);
    });

    const titulo = el('input', 'item-input');
    titulo.id = 'prTitulo';
    titulo.type = 'text';
    titulo.maxLength = 120;
    titulo.placeholder = 'Impermeabilizar el cuarto de bombas';

    const hallazgo = textarea('prHallazgo', 'Humedad en el muro sur, junto a la bomba 2. Se ve desde hace dos semanas.');
    const alcance = textarea('prAlcance', 'Tareas, materiales, cuántas personas, cuánto tiempo.');
    const inicio = el('input', 'item-input');
    inicio.id = 'prInicio';
    inicio.type = 'date';
    const fin = el('input', 'item-input');
    fin.id = 'prFin';
    fin.type = 'date';

    const prioridad = el('select', 'item-input');
    prioridad.id = 'prPrioridad';
    [['BAJA', 'Baja'], ['MEDIA', 'Media'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']].forEach(function (o) {
      const op = el('option', null, o[1]);
      op.value = o[0];
      if (o[0] === 'MEDIA') op.selected = true;
      prioridad.appendChild(op);
    });

    const afecta = el('input');
    afecta.type = 'checkbox';
    afecta.id = 'prAfecta';
    const etiquetaAfecta = el('label', 'casilla-datos', null);
    etiquetaAfecta.appendChild(afecta);
    etiquetaAfecta.appendChild(el('span', null, 'Afecta el uso de la zona mientras se trabaja'));

    const fotos = el('div', 'fotos');
    const inp = el('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.setAttribute('capture', 'environment');
    inp.className = 'oculto';
    const btnFoto = boton('Añadir foto de la visita');
    btnFoto.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', async function () {
      const file = inp.files && inp.files[0];
      if (!file || fotosNuevas.length >= 3) return;
      btnFoto.disabled = true;
      btnFoto.textContent = 'Comprimiendo…';
      try {
        const prep = await Fotos.preparar(file);
        fotosNuevas.push(prep);
        const figura = el('figure', 'foto-item');
        const hueco = el('div', 'foto-hueco');
        const img = document.createElement('img');
        img.className = 'foto-mini';
        img.alt = 'Foto de la visita ' + fotosNuevas.length;
        img.src = 'data:image/jpeg;base64,' + prep.base64_mini;
        hueco.appendChild(img);
        figura.appendChild(hueco);
        figura.appendChild(el('figcaption', 'foto-pie', 'Visita ' + fotosNuevas.length));
        fotos.appendChild(figura);
      } catch (e) {
        aviso('No se pudo preparar la foto.', 'error');
      }
      btnFoto.disabled = false;
      btnFoto.textContent = fotosNuevas.length >= 3 ? 'Ya hay 3 fotos' : 'Añadir foto de la visita';
    });

    const acciones = el('div', 'acciones-form');
    const enviar = boton('Enviar propuesta', 'btn primary');
    const volver = boton('Volver');
    volver.addEventListener('click', function () { cargar(rolActual); });
    acciones.appendChild(enviar);
    acciones.appendChild(volver);

    enviar.addEventListener('click', async function () {
      if (!sel.value) return aviso('Elige la sección donde hiciste la visita.', 'error');
      if (hallazgo.value.trim().length < 20) return aviso('Cuenta con al menos 20 caracteres qué encontraste.', 'error');
      if (alcance.value.trim().length < 20) return aviso('Cuenta con al menos 20 caracteres qué propones hacer.', 'error');
      if (!inicio.value) return aviso('Indica una fecha de inicio.', 'error');

      enviar.disabled = true;
      enviar.textContent = 'Enviando…';
      const r = await API.llamar('propuestas.crear', {
        nodo_id: sel.value,
        titulo: titulo.value.trim(),
        hallazgo: hallazgo.value.trim(),
        alcance: alcance.value.trim(),
        fecha_inicio_sugerida: inicio.value,
        fecha_fin_sugerida: fin.value || inicio.value,
        prioridad_sugerida: prioridad.value,
        afecta_uso: afecta.checked,
      }, { token: Sesion.token(), idempotente: true });
      if (!r.ok) {
        enviar.disabled = false;
        enviar.textContent = 'Enviar propuesta';
        return aviso(r.message || 'No se pudo enviar.', 'error');
      }

      const id = r.data.propuesta.id;
      let subidas = 0;
      for (let i = 0; i < fotosNuevas.length; i++) {
        enviar.textContent = 'Subiendo foto ' + (i + 1) + ' de ' + fotosNuevas.length + '…';
        const f = await API.llamar('propuestas.foto.subir', {
          propuesta_id: id,
          base64: fotosNuevas[i].base64,
          base64_mini: fotosNuevas[i].base64_mini,
          mime: 'image/jpeg',
        }, { token: Sesion.token(), idempotente: true });
        if (f.ok) subidas++;
      }

      enviar.disabled = false;
      enviar.textContent = 'Enviar propuesta';
      if (fotosNuevas.length && subidas < fotosNuevas.length) {
        aviso('La propuesta se envió, pero faltan ' + (fotosNuevas.length - subidas) + ' foto(s).', 'info');
      } else {
        aviso('Propuesta enviada. La administración la revisará.', 'ok');
      }
      cargar(rolActual);
    });

    caja.appendChild(campo('Sección', sel));
    caja.appendChild(campo('Título', titulo));
    caja.appendChild(campo('¿Qué encontraste en la visita?', hallazgo));
    caja.appendChild(campo('¿Qué propones hacer?', alcance, 'Tareas, materiales, cuántas personas, cuánto tiempo.'));
    const fila = el('div', 'fila-campos');
    fila.appendChild(campo('Inicio sugerido', inicio));
    fila.appendChild(campo('Fin sugerido', fin));
    fila.appendChild(campo('Prioridad', prioridad));
    caja.appendChild(fila);
    caja.appendChild(etiquetaAfecta);
    caja.appendChild(campo('Fotos de la visita (0 a 3)', fotos,
      'Estas fotos no reemplazan la foto de antes.'));
    caja.appendChild(btnFoto);
    caja.appendChild(inp);
    caja.appendChild(acciones);
    cont.appendChild(caja);
  }

  // ---------- administrador ----------

  function pintarAdministrador() {
    const cont = document.getElementById('tarjetaPropuestas');
    if (!cont) return;
    cont.textContent = '';
    const pendientes = propuestas.filter(function (p) { return p.estado === 'PENDIENTE'; });

    const cab = el('div', 'cabecera-seccion');
    cab.appendChild(el('h2', null, 'Propuestas por aprobar'));
    cab.appendChild(el('span', 'codigo', String(pendientes.length)));
    cont.appendChild(cab);
    cont.appendChild(el('p', 'bajada-tarjeta',
      'Lo que los contratistas proponen después de una visita. Al aprobar se crea la actividad.'));

    if (!pendientes.length) {
      cont.appendChild(el('div', 'vacio', 'No hay propuestas pendientes.'));
      return;
    }

    pendientes.forEach(function (p) {
      const fila = el('article', 'propuesta fila-propuesta');
      fila.tabIndex = 0;
      fila.setAttribute('role', 'button');
      const cab2 = el('div', 'propuesta-cab');
      cab2.appendChild(el('h3', null, p.titulo));
      cab2.appendChild(el('span', 'badge warn', 'Pendiente'));
      fila.appendChild(cab2);
      const meta = el('p', 'propuesta-meta');
      meta.textContent = p.nodo_codigo + ' · ' + p.propuesta_por_nombre +
        (p.empresa_nombre ? ' · ' + p.empresa_nombre : '') + ' · ' + p.fotos.length + ' foto(s)';
      fila.appendChild(meta);
      fila.addEventListener('click', function () { revision(p.id); });
      cont.appendChild(fila);
    });
  }

  async function revision(id) {
    const cont = document.getElementById('tarjetaPropuestas');
    if (!cont) return;
    const r = await API.llamar('propuestas.get', { id: id }, { token: Sesion.token() });
    if (!r.ok) return aviso(r.message || 'No se pudo abrir la propuesta.', 'error');
    abierta = r.data;

    cont.textContent = '';
    const cab = el('div', 'cabecera-seccion');
    cab.appendChild(el('h2', null, 'Revisar propuesta'));
    cont.appendChild(cab);
    cont.appendChild(el('p', 'bajada-tarjeta',
      'A cargo de: ' + abierta.propuesta.propuesta_por_nombre +
      (abierta.propuesta.empresa_nombre ? ' · ' + abierta.propuesta.empresa_nombre : '')));

    const original = el('div', 'bloque');
    original.appendChild(el('div', 'kicker', 'Lo que propuso el contratista'));
    original.appendChild(el('p', 'texto-reportado', abierta.propuesta.hallazgo));
    original.appendChild(el('p', 'bajada-tarjeta', 'Propone: ' + abierta.propuesta.alcance));
    const fotos = el('div', 'fotos');
    (abierta.propuesta.fotos || []).forEach(function (fotoId, i) {
      const figura = el('figure', 'foto-item');
      const hueco = el('div', 'foto-hueco');
      const img = document.createElement('img');
      img.className = 'foto-mini';
      img.alt = 'Foto de la visita ' + (i + 1);
      hueco.appendChild(img);
      figura.appendChild(hueco);
      figura.appendChild(el('figcaption', 'foto-pie', 'Visita ' + (i + 1)));
      API.llamar('propuestas.foto.get', { propuesta_id: abierta.propuesta.id, foto_id: fotoId, tam: 'mini' },
        { token: Sesion.token() }).then(function (rf) {
        if (rf.ok) img.src = 'data:' + (rf.data.mime || 'image/jpeg') + ';base64,' + rf.data.base64;
      }).catch(function () {});
      fotos.appendChild(figura);
    });
    original.appendChild(fotos);
    cont.appendChild(original);

    const ver = abierta.verificacion || {};
    const avisos = [];
    if (ver.usuario_activo === false) avisos.push('Quien propuso ya no está activo.');
    if (ver.asignacion_vigente === false) avisos.push('Quien propuso ya no tiene asignada esa sección.');
    if (ver.empresa_sin_cambios === false) avisos.push('El contratista cambió de empresa desde que propuso.');
    if (ver.empresa_vigente === false) avisos.push('La empresa tiene el contrato vencido.');
    if (ver.actividades_abiertas) avisos.push('Ya hay ' + ver.actividades_abiertas + ' actividad(es) abierta(s) en esta sección.');
    if (avisos.length) {
      const cajaAvisos = el('div', 'aviso-rechazo');
      cajaAvisos.appendChild(el('strong', null, 'Revisa esto antes de aprobar'));
      avisos.forEach(function (a) { cajaAvisos.appendChild(el('p', null, a)); });
      cajaAvisos.appendChild(el('p', 'aviso-rechazo-fecha',
        'Es una ayuda: la comprobación definitiva la hace el servidor al aprobar.'));
      cont.appendChild(cajaAvisos);
    }

    const form = el('div', 'bloque');
    form.appendChild(el('div', 'kicker', 'La actividad que se va a crear'));

    const titulo = el('input', 'item-input');
    titulo.id = 'rvTitulo';
    titulo.type = 'text';
    titulo.maxLength = 120;
    titulo.value = abierta.propuesta.titulo;

    const sel = el('select', 'item-input');
    sel.id = 'rvNodo';
    nodos.forEach(function (n) {
      const op = el('option', null, n.codigo + ' · ' + n.nombre);
      op.value = n.id;
      if (String(n.id) === String(abierta.propuesta.nodo_id)) op.selected = true;
      sel.appendChild(op);
    });

    const descripcion = textarea('rvDescripcion', '');
    descripcion.value = abierta.propuesta.alcance;

    const inicio = el('input', 'item-input');
    inicio.id = 'rvInicio';
    inicio.type = 'date';
    inicio.value = abierta.propuesta.fecha_inicio_sugerida;
    const fin = el('input', 'item-input');
    fin.id = 'rvFin';
    fin.type = 'date';
    fin.value = abierta.propuesta.fecha_fin_sugerida;

    const prioridad = el('select', 'item-input');
    prioridad.id = 'rvPrioridad';
    [['BAJA', 'Baja'], ['MEDIA', 'Media'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']].forEach(function (o) {
      const op = el('option', null, o[1]);
      op.value = o[0];
      if (o[0] === abierta.propuesta.prioridad_sugerida) op.selected = true;
      prioridad.appendChild(op);
    });

    form.appendChild(campo('Título', titulo));
    form.appendChild(campo('Sección', sel));
    form.appendChild(campo('Descripción', descripcion));
    const fila = el('div', 'fila-campos');
    fila.appendChild(campo('Inicio', inicio));
    fila.appendChild(campo('Fin', fin));
    fila.appendChild(campo('Prioridad', prioridad));
    form.appendChild(fila);
    form.appendChild(el('p', 'bajada-tarjeta',
      'La plantilla, las etapas y la publicación se ajustan después en la actividad, como siempre.'));

    const acciones = el('div', 'acciones-form');
    const aprobar = boton('Aprobar y crear la actividad', 'btn primary');
    const rechazar = boton('No aprobar', 'btn peligro');
    const volver = boton('Volver');
    volver.addEventListener('click', function () { cargar(rolActual); });

    const motivo = textarea('rvMotivo', 'Explica al contratista por qué no se aprueba.');
    motivo.classList.add('oculto');
    form.appendChild(motivo);

    aprobar.addEventListener('click', async function () {
      aprobar.disabled = true;
      aprobar.textContent = 'Creando…';
      const res = await API.llamar('propuestas.aprobar', {
        id: abierta.propuesta.id,
        titulo: titulo.value.trim(),
        nodo_id: sel.value,
        descripcion: descripcion.value.trim(),
        fecha_inicio_plan: inicio.value,
        fecha_fin_plan: fin.value || inicio.value,
        prioridad: prioridad.value,
      }, { token: Sesion.token(), idempotente: true });
      aprobar.disabled = false;
      aprobar.textContent = 'Aprobar y crear la actividad';
      if (!res.ok) return aviso(res.message || 'No se pudo aprobar.', 'error');
      aviso('Actividad creada.', 'ok');
      if (window.App) App.refrescar();
      cargar(rolActual);
    });

    rechazar.addEventListener('click', async function () {
      if (motivo.classList.contains('oculto')) {
        motivo.classList.remove('oculto');
        motivo.focus();
        return;
      }
      if (motivo.value.trim().length < 10) return aviso('Escribe el motivo (al menos 10 caracteres).', 'error');
      rechazar.disabled = true;
      const res = await API.llamar('propuestas.rechazar', {
        id: abierta.propuesta.id, motivo: motivo.value.trim(),
      }, { token: Sesion.token(), idempotente: true });
      rechazar.disabled = false;
      if (!res.ok) return aviso(res.message || 'No se pudo rechazar.', 'error');
      aviso('Propuesta rechazada.', 'ok');
      cargar(rolActual);
    });

    acciones.appendChild(aprobar);
    acciones.appendChild(rechazar);
    acciones.appendChild(volver);
    form.appendChild(acciones);
    cont.appendChild(form);
  }

  window.Propuestas = { cargar: cargar };
})();
