/**
 * app.js — ingreso y panel del portal.
 * Todo el texto se inserta con textContent: no se usa innerHTML con datos.
 */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  const PESTANAS = [
    { id: 'actividades', nombre: 'Actividades', acento: 'indigo', roles: ['ADMIN', 'SUPERVISOR', 'CONTRATISTA'] },
    { id: 'secciones', nombre: 'Secciones', acento: 'cian', roles: ['ADMIN', 'SUPERVISOR', 'CONTRATISTA'] },
    { id: 'novedades', nombre: 'Novedades', acento: 'warn', roles: ['ADMIN', 'SUPERVISOR', 'CONTRATISTA'] },
    { id: 'plan', nombre: 'Plan', acento: 'violeta', roles: ['ADMIN'] },
    { id: 'empresas', nombre: 'Empresas', acento: 'ok', roles: ['ADMIN', 'SUPERVISOR'] },
    { id: 'usuarios', nombre: 'Usuarios', acento: 'indigo', roles: ['ADMIN'] },
    { id: 'alertas', nombre: 'Alertas', acento: 'danger', roles: ['ADMIN'] },
    { id: 'sistema', nombre: 'Sistema', acento: 'neutro', roles: ['ADMIN'] },
  ];

  function pestanasDe(rol) {
    return PESTANAS.filter(function (p) { return p.roles.indexOf(rol) >= 0; });
  }

  function construirPestanas(rol) {
    const barra = document.getElementById('barraPestanas');
    if (!barra) return;

    // Los botones vienen en el HTML; aquí solo se habilitan según el rol.
    const botones = Array.prototype.slice.call(barra.querySelectorAll('.pestana'));
    const permitidas = [];
    botones.forEach(function (b) {
      const roles = String(b.dataset.roles || '').split(',');
      const puede = roles.indexOf(rol) >= 0;
      b.hidden = !puede;
      if (puede) {
        permitidas.push(b.dataset.pestana);
        if (!b.dataset.cableada) {
          b.addEventListener('click', function () { mostrarPestana(b.dataset.pestana); });
          b.dataset.cableada = '1';
        }
      }
    });

    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      const permitido = permitidas.indexOf(panel.dataset.panel) >= 0;
      if (!permitido) panel.classList.add('oculto');
    });

    const inicial = (window.location.hash || '').replace('#/', '');
    const elegida = permitidas.indexOf(inicial) >= 0 ? inicial : permitidas[0];
    mostrarPestana(elegida);
  }

  function mostrarPestana(id) {
    document.querySelectorAll('#barraPestanas .pestana').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.pestana === id);
      b.setAttribute('aria-selected', b.dataset.pestana === id ? 'true' : 'false');
    });
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      const visible = panel.dataset.panel === id;
      panel.classList.toggle('oculto', !visible);
    });
    // El detalle de una actividad solo vive dentro de su pestaña y nunca se duplica con la lista.
    const detalle = document.getElementById('vistaActividad');
    const lista = document.getElementById('tarjetaActividades');
    if (detalle) {
      if (id !== 'actividades') detalle.classList.add('oculto');
      else if (detalle.dataset.abierta === '1') {
        detalle.classList.remove('oculto');
        if (lista) lista.classList.add('oculto');
      }
    }
    if (window.history && history.replaceState) {
      history.replaceState(null, '', window.location.pathname + '#/' + id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let rolActual = 'CONTRATISTA';
  let registroToken = null;
  let nodosActuales = [];

  function ver(id, visible) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('oculto', !visible);
  }

  function aviso(texto, tipo) {
    const el = document.getElementById('avisoLogin');
    if (!el) return;
    el.textContent = texto;
    el.className = 'msg mostrar ' + (tipo || 'info');
  }

  function ocultarAviso() {
    const el = document.getElementById('avisoLogin');
    if (el) el.className = 'msg';
  }

  // --- Enlace de ingreso ---------------------------------------------------
  function tokenDelHash() {
    const m = (window.location.hash || '').match(/^#\/enlace\?t=([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  function limpiarHash() {
    if (window.history && history.replaceState) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  async function canjear(token) {
    aviso('Validando el enlace…', 'info');
    const r = await API.llamar('auth.enlace.canjear', { token_enlace: token });
    limpiarHash();
    if (!r.ok) {
      aviso(r.message || 'El enlace no es válido.', 'error');
      return false;
    }
    return procesarIngreso(r.data);
  }

  function procesarIngreso(data) {
    if (!data) return false;
    if (data.estado === 'NO_REGISTRADO') {
      registroToken = data.registro_token;
      const correo = document.getElementById('regCorreo');
      if (correo) correo.textContent = data.email || '';
      ver('pantallaLogin', false);
      ver('pantallaPanel', false);
      ver('pantallaPendiente', false);
      ver('pantallaRegistro', true);
      return true;
    }
    if (data.estado === 'PENDIENTE') {
      const quien = document.getElementById('pendienteNombre');
      if (quien) quien.textContent = (data.usuario && data.usuario.email) || '';
      ver('pantallaLogin', false);
      ver('pantallaPanel', false);
      ver('pantallaPendiente', true);
      return true;
    }
    if (data.estado !== 'ACTIVO' || !data.sessionToken) {
      aviso('Tu cuenta está inactiva. Habla con la administración.', 'error');
      return false;
    }
    Sesion.guardar({ token: data.sessionToken, expira_en: data.expira_en, usuario: data.usuario }, false);
    entrar();
    return true;
  }

  // --- Panel ---------------------------------------------------------------
  function iniciales(nombre, correo) {
    const base = String(nombre || correo || 'CA').trim();
    const partes = base.split(/\s+/).filter(Boolean);
    if (partes.length >= 2) return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
    return base.slice(0, 2).toUpperCase();
  }

  async function entrar() {
    const t = Sesion.token();
    if (!t) return mostrarLogin();
    const r = await API.llamar('auth.me', {}, { token: t });
    if (!r.ok) {
      if (r.code === 'SESION_VENCIDA' || r.code === 'NO_AUTENTICADO') {
        Sesion.limpiar();
        mostrarLogin();
        aviso('Tu sesión terminó. Ingresa de nuevo.', 'info');
        return;
      }
      if (r.code === 'PENDIENTE') {
        ver('pantallaLogin', false);
        ver('pantallaPendiente', true);
        return;
      }
      aviso(r.message || 'No pudimos validar tu sesión.', 'error');
      return mostrarLogin();
    }
    const me = r.data;
    ver('pantallaLogin', false);
    ver('pantallaPendiente', false);
    ver('pantallaPanel', true);

    const nombre = document.getElementById('nombreUsuario');
    if (nombre) nombre.textContent = me.usuario.nombre || me.usuario.email;
    const rol = document.getElementById('rolUsuario');
    if (rol) rol.textContent = me.usuario.rol;
    const av = document.getElementById('avatar');
    if (av) av.textContent = iniciales(me.usuario.nombre, me.usuario.email);

    rolActual = me.usuario.rol;
    window.__rol = rolActual;
    construirPestanas(rolActual);
    cargarArbol(t, me);
    cargarActividades(t, me);
    if (window.Novedades) { Novedades.cargar(); Novedades.preparar(); }
    if (rolActual === 'ADMIN') {
      prepararFormulario(t);
      const formElemento = document.getElementById('formElemento');
      if (formElemento) {
        formElemento.classList.remove('oculto');
        if (window.Elementos) { Elementos.cargar(); Elementos.preparar(); }
      }
      if (window.Pruebas) Pruebas.preparar();
      if (window.Respaldo) { Respaldo.cargar(); Respaldo.preparar(); Respaldo.prepararEjemplo(); }
      if (window.Empresas) { Empresas.preparar(); Empresas.cargar(); }
      if (window.Plan) { Plan.cargar(); Plan.preparar(); }
      if (window.Catalogo) { Catalogo.cargar(); Catalogo.preparar(); }
      if (window.Alertas) { Alertas.cargar(); Alertas.preparar(); }
      if (window.Usuarios) {
        Usuarios.cargar();
        Usuarios.prepararEmpresa();
      }
    }
  }

  const nodosAbiertos = {};
  let tiposCache = null;

  async function tiposDisponibles(t) {
    if (tiposCache) return tiposCache;
    const r = await API.llamar('tipos.listar', {}, { token: t });
    tiposCache = (r.ok && r.data.tipos) ? r.data.tipos : [];
    return tiposCache;
  }

  /** Formulario de edición en línea para un nodo. */
  async function editorNodo(nodo, t, alGuardar, todos) {
    const caja = document.createElement('form');
    caja.className = 'editor-nodo';

    function campo(etiqueta, input) {
      const c = document.createElement('div');
      c.className = 'campo';
      const l = document.createElement('label');
      l.textContent = etiqueta;
      c.appendChild(l);
      c.appendChild(input);
      return c;
    }

    const nombre = document.createElement('input');
    nombre.type = 'text';
    nombre.maxLength = 120;
    nombre.value = nodo.nombre;
    nombre.required = true;

    const descripcion = document.createElement('input');
    descripcion.type = 'text';
    descripcion.maxLength = 200;
    descripcion.value = nodo.descripcion || '';

    const tipos = await tiposDisponibles(t);
    let selectTipo = null;
    if (String(nodo.clase) === 'ELEMENTO') {
      selectTipo = document.createElement('select');
      selectTipo.className = 'item-input';
      const vacio = document.createElement('option');
      vacio.value = '';
      vacio.textContent = 'Sin tipo';
      selectTipo.appendChild(vacio);
      tipos.forEach(function (tp) {
        const op = document.createElement('option');
        op.value = tp.id;
        op.textContent = tp.nombre;
        if (String(tp.id) === String(nodo.tipo_elemento_id)) op.selected = true;
        selectTipo.appendChild(op);
      });
    }

    const sensible = document.createElement('input');
    sensible.type = 'checkbox';
    sensible.checked = String(nodo.sensible) === 'true';
    const etiquetaSensible = document.createElement('label');
    etiquetaSensible.className = 'casilla-datos compacta';
    etiquetaSensible.appendChild(sensible);
    const textoS = document.createElement('span');
    textoS.textContent = 'Sistema sensible: no se publica su detalle';
    etiquetaSensible.appendChild(textoS);

    // Mover a otro padre (sin permitir ciclos)
    const mover = document.createElement('select');
    mover.className = 'item-input';
    const raizOp = document.createElement('option');
    raizOp.value = '';
    raizOp.textContent = '— Sin mover —';
    mover.appendChild(raizOp);
    const rutaPropia = String(nodo.ruta_ids || '') + '/' + nodo.id;
    (todos || []).forEach(function (otro) {
      if (String(otro.id) === String(nodo.id)) return;
      const rutaOtro = String(otro.ruta_ids || '') + '/' + otro.id;
      if (rutaOtro.indexOf(rutaPropia) === 0) return; // descendiente
      if (String(otro.clase) === 'ELEMENTO') return;
      const op = document.createElement('option');
      op.value = otro.id;
      op.textContent = otro.codigo + ' · ' + otro.nombre;
      mover.appendChild(op);
    });

    caja.appendChild(campo('Nombre', nombre));
    if (selectTipo) caja.appendChild(campo('Tipo de equipo', selectTipo));
    caja.appendChild(campo('Descripción', descripcion));
    if (!String(nodo.parent_id || '').trim() === false) caja.appendChild(campo('Mover a otra sección', mover));
    caja.appendChild(etiquetaSensible);

    const acciones = document.createElement('div');
    acciones.className = 'acciones-form';

    const guardar = document.createElement('button');
    guardar.type = 'submit';
    guardar.className = 'btn primary';
    guardar.textContent = 'Guardar';

    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'btn';
    cancelar.textContent = 'Cancelar';
    cancelar.addEventListener('click', function () { caja.remove(); });

    acciones.appendChild(guardar);
    acciones.appendChild(cancelar);

    // Retirar del árbol (borrado lógico, con confirmación)
    if (nodo.parent_id) {
      const retirar = document.createElement('button');
      retirar.type = 'button';
      retirar.className = 'btn peligro';
      retirar.textContent = 'Retirar del árbol';
      let confirmado = false;
      retirar.addEventListener('click', async function () {
        if (!confirmado) {
          confirmado = true;
          retirar.textContent = 'Confirmar retiro';
          setTimeout(function () { confirmado = false; retirar.textContent = 'Retirar del árbol'; }, 6000);
          return;
        }
        const r = await API.llamar('nodos.desactivar', { id: nodo.id }, { token: t, idempotente: true });
        if (!r.ok) {
          aviso.textContent = r.message || 'No se pudo retirar.';
          aviso.className = 'msg mostrar error';
          return;
        }
        caja.remove();
        alGuardar();
      });
      acciones.appendChild(retirar);
    }
    caja.appendChild(acciones);

    const aviso = document.createElement('div');
    aviso.className = 'msg';
    aviso.setAttribute('role', 'status');
    caja.appendChild(aviso);

    caja.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      guardar.disabled = true;
      const payload = {
        id: nodo.id,
        nombre: nombre.value.trim(),
        descripcion: descripcion.value.trim(),
        sensible: sensible.checked,
      };
      if (selectTipo) payload.tipo_elemento_id = selectTipo.value;
      const r = await API.llamar('nodos.editar', payload, { token: t, idempotente: true });
      if (!r.ok) {
        guardar.disabled = false;
        aviso.textContent = r.message || 'No se pudo guardar.';
        aviso.className = 'msg mostrar error';
        return;
      }
      if (mover.value) {
        const rm = await API.llamar('nodos.mover', { id: nodo.id, nuevo_parent_id: mover.value }, { token: t, idempotente: true });
        if (!rm.ok) {
          guardar.disabled = false;
          aviso.textContent = rm.message || 'Se guardó, pero no se pudo mover.';
          aviso.className = 'msg mostrar error';
          alGuardar();
          return;
        }
      }
      guardar.disabled = false;
      caja.remove();
      alGuardar();
    });

    return caja;
  }

  function filaNodo(nodo, opciones) {
    const opts = opciones || {};
    const fila = document.createElement('div');
    fila.className = 'fila-nodo';

    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = nodo.nombre;

    const cod = document.createElement('span');
    cod.className = 'codigo';
    cod.textContent = nodo.codigo;

    fila.appendChild(nombre);
    fila.appendChild(cod);

    const estado = String(nodo.salud_estado || 'SIN_DATOS');
    const punto = document.createElement('span');
    punto.className = 'semaforo semaforo-' + estado.toLowerCase();
    punto.title = 'Estado: ' + estado + (nodo.salud_puntaje !== '' ? ' · ' + nodo.salud_puntaje + '/100' : '');
    punto.setAttribute('aria-label', punto.title);
    fila.insertBefore(punto, fila.firstChild);

    if (nodo.salud_puntaje !== '' && nodo.salud_puntaje !== null && nodo.salud_puntaje !== undefined) {
      const puntaje = document.createElement('span');
      puntaje.className = 'puntaje';
      puntaje.textContent = nodo.salud_puntaje;
      fila.appendChild(puntaje);
    }

    if (String(nodo.sensible) === 'true') {
      const pill = document.createElement('span');
      pill.className = 'pill sensible';
      pill.textContent = 'sensible';
      fila.appendChild(pill);
    }

    if (opts.conHijos) {
      const flecha = document.createElement('button');
      flecha.type = 'button';
      flecha.className = 'boton-plegar';
      flecha.setAttribute('aria-label', 'Mostrar u ocultar subsecciones');
      flecha.textContent = nodosAbiertos[nodo.id] ? '▾' : '▸';
      flecha.addEventListener('click', function (ev) {
        ev.stopPropagation();
        nodosAbiertos[nodo.id] = !nodosAbiertos[nodo.id];
        opts.alPlegar();
      });
      fila.insertBefore(flecha, fila.firstChild);
    } else {
      const hueco = document.createElement('span');
      hueco.className = 'boton-plegar hueco';
      fila.insertBefore(hueco, fila.firstChild);
    }

    if (opts.editable) {
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'btn-mini';
      editar.textContent = 'Editar';
      editar.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const existente = fila.parentNode.querySelector('.editor-nodo');
        if (existente) existente.remove();
        editorNodo(nodo, opts.token, opts.alGuardar, opts.todos).then(function (form) {
          fila.parentNode.insertBefore(form, fila.nextSibling);
          form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
      fila.appendChild(editar);
    }

    return fila;
  }

  async function cargarArbol(t) {
    const cont = document.getElementById('arbol');
    if (!cont) return;
    cont.textContent = '';
    const r = await API.llamar('nodos.arbol', {}, { token: t });
    if (!r.ok) {
      const p = document.createElement('p');
      p.className = 'msg info mostrar';
      p.textContent = r.message || 'No se pudo cargar el árbol.';
      cont.appendChild(p);
      return;
    }
    const nodos = r.data.nodos || [];
    const conteo = document.getElementById('conteoNodos');
    if (conteo) conteo.textContent = nodos.length + ' nodos';

    if (!nodos.length) {
      ver('sinAsignacion', true);
      return;
    }

    // Un contratista solo recibe su rama: el padre de la raíz de esa rama no viene.
    // Sin esto, el árbol salía vacío aunque hubiera nodos.
    const ids = {};
    nodos.forEach(function (n) { ids[n.id] = true; });
    const porPadre = {};
    nodos.forEach(function (n) {
      const p = (n.parent_id && ids[n.parent_id]) ? n.parent_id : 'RAIZ';
      (porPadre[p] = porPadre[p] || []).push(n);
    });

    const puedeEditar = String(rolActual) === 'ADMIN';

    function pintar(padre) {
      const lista = document.createElement('ul');
      lista.className = 'arbol';
      (porPadre[padre] || [])
        .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
        .forEach(function (n) {
          const li = document.createElement('li');
          const tieneHijos = !!porPadre[n.id];
          li.appendChild(filaNodo(n, {
            conHijos: tieneHijos,
            editable: puedeEditar,
            token: t,
            todos: nodos,
            alPlegar: function () { cargarArbol(t); },
            alGuardar: function () { nodosAbiertos[n.id] = true; cargarArbol(t); },
          }));
          if (tieneHijos && nodosAbiertos[n.id]) li.appendChild(pintar(n.id));
          lista.appendChild(li);
        });
      return lista;
    }

    // Al entrar, solo el primer nivel está abierto.
    if (!Object.keys(nodosAbiertos).length) {
      (porPadre['RAIZ'] || []).forEach(function (n) { if (porPadre[n.id]) nodosAbiertos[n.id] = true; });
    }

    const resumen = document.createElement('div');
    resumen.className = 'resumen-semaforo';
    [['AL_DIA', 'Al día'], ['ATENCION', 'Atención'], ['CRITICO', 'Crítico'], ['SIN_DATOS', 'Sin datos']].forEach(function (par) {
      const cuantos = nodos.filter(function (n) { return String(n.salud_estado) === par[0]; }).length;
      if (!cuantos) return;
      const chip = document.createElement('span');
      chip.className = 'chip-estado';
      const punto = document.createElement('span');
      punto.className = 'semaforo semaforo-' + par[0].toLowerCase();
      chip.appendChild(punto);
      chip.appendChild(document.createTextNode(cuantos + ' ' + par[1].toLowerCase()));
      resumen.appendChild(chip);
    });
    const controles = document.createElement('div');
    controles.className = 'controles-arbol';
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'btn-mini';
    abrir.textContent = 'Desplegar todo';
    abrir.addEventListener('click', function () {
      nodos.forEach(function (n) { nodosAbiertos[n.id] = true; });
      cargarArbol(t);
    });
    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-mini';
    cerrar.textContent = 'Plegar todo';
    cerrar.addEventListener('click', function () {
      Object.keys(nodosAbiertos).forEach(function (k) { delete nodosAbiertos[k]; });
      cargarArbol(t);
    });
    controles.appendChild(abrir);
    controles.appendChild(cerrar);

    if (resumen.childNodes.length) cont.appendChild(resumen);
    cont.appendChild(controles);

    cont.appendChild(pintar('RAIZ'));
  }

  const ESTADOS = {
    PROGRAMADA: { texto: 'Programada', clase: 'gray' },
    EN_EJECUCION: { texto: 'En ejecución', clase: '' },
    REPORTADA: { texto: 'Reportada', clase: 'warn' },
    APROBADA: { texto: 'Aprobada', clase: 'ok' },
    RECHAZADA: { texto: 'Rechazada', clase: 'danger' },
    CERRADA: { texto: 'Cerrada', clase: 'ok' },
    CANCELADA: { texto: 'Cancelada', clase: 'gray' },
  };

  function tarjetaActividad(a) {
    const el = document.createElement('article');
    el.className = 'actividad';

    const cab = document.createElement('div');
    cab.className = 'actividad-cab';

    const titulo = document.createElement('h3');
    titulo.textContent = a.titulo;

    const est = ESTADOS[a.estado] || { texto: a.estado, clase: 'gray' };
    const badge = document.createElement('span');
    badge.className = 'badge ' + est.clase;
    badge.textContent = est.texto;

    cab.appendChild(titulo);
    cab.appendChild(badge);

    const meta = document.createElement('p');
    meta.className = 'actividad-meta';
    const fechas = a.fecha_inicio_plan === a.fecha_fin_plan
      ? a.fecha_inicio_plan
      : a.fecha_inicio_plan + ' → ' + a.fecha_fin_plan;
    meta.textContent = fechas;

    const avance = document.createElement('div');
    avance.className = 'avance';
    const barra = document.createElement('div');
    barra.className = 'avance-barra';
    const relleno = document.createElement('i');
    relleno.style.width = Math.max(0, Math.min(100, a.avance_aprobado_pct)) + '%';
    barra.appendChild(relleno);
    const pct = document.createElement('b');
    pct.textContent = a.avance_aprobado_pct + '%';
    avance.appendChild(barra);
    avance.appendChild(pct);

    el.appendChild(cab);
    el.appendChild(meta);
    el.appendChild(avance);

    if (a.vencida) {
      const v = document.createElement('span');
      v.className = 'badge danger';
      v.textContent = 'Vencida';
      el.appendChild(v);
    }
    return el;
  }

  async function cargarActividades(t) {
    const cont = document.getElementById('listaActividades');
    if (!cont) return;
    cont.textContent = '';
    const r = await API.llamar('actividades.listar', { tam: 20 }, { token: t });
    if (!r.ok) return;
    const lista = r.data.actividades || [];
    const conteo = document.getElementById('conteoActividades');
    if (conteo) conteo.textContent = r.data.total + (r.data.total === 1 ? ' trabajo' : ' trabajos');
    if (!lista.length) {
      ver('sinActividades', true);
      return;
    }
    lista.forEach(function (a) {
      const card = tarjetaActividad(a);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('click', function () {
        if (window.Actividad) Actividad.abrir(a.id, rolActual);
      });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && window.Actividad) Actividad.abrir(a.id, rolActual);
      });
      cont.appendChild(card);
    });
  }

  // --- Login ---------------------------------------------------------------
  function mostrarLogin() {
    ver('pantallaLogin', true);
    ver('pantallaPanel', false);
    ver('pantallaPendiente', false);
    ver('pantallaRegistro', false);
  }

  async function enviarRegistro(ev) {
    ev.preventDefault();
    const caja = document.getElementById('avisoRegistro');
    const acepta = document.getElementById('regAcepta');
    if (!acepta || !acepta.checked) {
      caja.textContent = 'Debes autorizar el tratamiento de tus datos para continuar.';
      caja.className = 'msg mostrar error';
      return;
    }
    const boton = document.getElementById('btnRegistro');
    boton.disabled = true;
    const empresa = document.getElementById('regEmpresa').value.trim();
    const nit = document.getElementById('regNit').value.trim();
    const r = await API.llamar('auth.registrar', {
      registro_token: registroToken,
      nombre: document.getElementById('regNombre').value.trim(),
      telefono: document.getElementById('regTelefono').value.trim(),
      empresa_nueva: empresa ? { razon_social: empresa, nit: nit } : null,
      acepta_datos: true,
    }, { idempotente: true });
    boton.disabled = false;
    if (!r.ok) {
      caja.textContent = r.message || 'No se pudo completar el registro.';
      caja.className = 'msg mostrar error';
      return;
    }
    caja.textContent = r.data.mensaje || 'Registro enviado. La administración lo revisará.';
    caja.className = 'msg mostrar ok';
  }

  async function pedirEnlace(ev) {
    ev.preventDefault();
    const correo = document.getElementById('correo');
    const email = (correo && correo.value ? correo.value : '').trim();
    if (!email) return;
    const b = document.getElementById('btnEnlace');
    b.disabled = true;
    b.textContent = 'Enviando…';
    const r = await API.llamar('auth.enlace.solicitar', { email: email }, { idempotente: true });
    b.disabled = false;
    b.textContent = 'Enviarme el enlace';
    if (!r.ok) return aviso(r.message || 'No se pudo enviar el enlace.', 'error');
    aviso('Listo. Revisa tu correo y abre el enlace; vence en 15 minutos.', 'ok');
  }

  function salir() {
    const t = Sesion.token();
    if (t) API.llamar('auth.salir', {}, { token: t });
    Sesion.limpiar();
    mostrarLogin();
    ocultarAviso();
    aviso('Cerraste la sesión.', 'info');
  }

  function prepararFormulario(t) {
    const form = document.getElementById('formActividad');
    if (!form) return;
    form.classList.remove('oculto');
    cargarNodosEnFormulario(t);
    const cancelar = document.getElementById('btnCancelarActividad');
    if (cancelar) cancelar.addEventListener('click', function () {
      document.getElementById('actTitulo').value = '';
      document.getElementById('actDescripcion').value = '';
    });
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const avisoCrear = document.getElementById('avisoCrear');
      const boton = document.getElementById('btnCrearActividad');
      boton.disabled = true;
      const r = await API.llamar('actividades.crear', {
        titulo: document.getElementById('actTitulo').value.trim(),
        nodo_id: document.getElementById('actNodo').value,
        fecha_inicio_plan: document.getElementById('actInicio').value,
        fecha_fin_plan: document.getElementById('actFin').value || document.getElementById('actInicio').value,
        prioridad: document.getElementById('actPrioridad').value,
        descripcion: document.getElementById('actDescripcion').value.trim(),
      }, { token: Sesion.token(), idempotente: true });
      boton.disabled = false;
      if (!r.ok) {
        avisoCrear.textContent = r.message || 'No se pudo crear.';
        avisoCrear.className = 'msg mostrar error';
        return;
      }
      avisoCrear.textContent = 'Actividad creada.';
      avisoCrear.className = 'msg mostrar ok';
      document.getElementById('actTitulo').value = '';
      cargarActividades(Sesion.token());
    });
  }

  async function cargarNodosEnFormulario(t) {
    const sel = document.getElementById('actNodo');
    if (!sel) return;
    const r = await API.llamar('nodos.arbol', {}, { token: t });
    if (!r.ok) return;
    nodosActuales = (r.data.nodos || []).slice();
    sel.textContent = '';
    nodosActuales
      .sort(function (a, b) { return String(a.codigo).localeCompare(String(b.codigo)); })
      .forEach(function (n) {
        const op = document.createElement('option');
        op.value = n.id;
        op.textContent = n.codigo + ' · ' + n.nombre;
        sel.appendChild(op);
      });
  }

  window.App = {
    refrescar: function () { cargarActividades(Sesion.token()); },
    pestana: mostrarPestana,
  };

  document.addEventListener('DOMContentLoaded', async function () {
    const bt = document.getElementById('btnTema');
    if (bt) bt.addEventListener('click', function () { Tema.alternar(); });

    const form = document.getElementById('formLogin');
    if (form) form.addEventListener('submit', pedirEnlace);

    const formRegistro = document.getElementById('formRegistro');
    if (formRegistro) formRegistro.addEventListener('submit', enviarRegistro);
    const acepta = document.getElementById('regAcepta');
    const botonRegistro = document.getElementById('btnRegistro');
    if (acepta && botonRegistro) {
      acepta.addEventListener('change', function () { botonRegistro.disabled = !acepta.checked; });
    }

    const bs = document.getElementById('btnSalir');
    if (bs) bs.addEventListener('click', salir);

    const g = document.getElementById('btnGoogle');
    const caja = document.getElementById('cajaGoogle');

    const alEntrarGoogle = function (ok, data) {
      if (!ok) return;
      procesarIngreso(data || {});
    };

    let intentos = 0;
    const montarGoogle = function () {
      if (!window.CFG || !window.CFG.GOOGLE_CLIENT_ID) return;
      if (window.Google && Google.montar(caja, alEntrarGoogle)) return;
      if (++intentos < 25) setTimeout(montarGoogle, 400);
    };
    montarGoogle();

    if (g && window.CFG && window.CFG.GOOGLE_CLIENT_ID) {
      g.hidden = false;
      g.addEventListener('click', function () {
        if (window.Google && Google.disparar()) return;
        aviso('El ingreso con Google está cargando. Intenta de nuevo en un segundo.', 'info');
      });
    }

    if (g && (!window.CFG || !window.CFG.GOOGLE_CLIENT_ID)) {
      g.disabled = true;
      g.title = 'Pendiente configurar el Client ID de Google';
      g.textContent = 'Ingresar con Google (próximamente)';
    }

    const t = tokenDelHash();
    if (t) {
      const entro = await canjear(t);
      if (entro) return;
    }
    entrar();
  });
})();
