/**
 * app.js — ingreso y panel del portal.
 * Todo el texto se inserta con textContent: no se usa innerHTML con datos.
 */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  let rolActual = 'CONTRATISTA';
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
      const tarjetaUsuarios = document.getElementById('tarjetaUsuarios');
      if (tarjetaUsuarios) tarjetaUsuarios.classList.remove('oculto');
      if (window.Usuarios) {
        Usuarios.cargar();
        Usuarios.prepararEmpresa();
      }
    }
  }

  function filaNodo(nodo) {
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

    function pintar(padre) {
      const lista = document.createElement('ul');
      lista.className = 'arbol';
      (porPadre[padre] || [])
        .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
        .forEach(function (n) {
          const li = document.createElement('li');
          li.appendChild(filaNodo(n));
          if (porPadre[n.id]) li.appendChild(pintar(n.id));
          lista.appendChild(li);
        });
      return lista;
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
    if (resumen.childNodes.length) cont.appendChild(resumen);

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

  window.App = { refrescar: function () { cargarActividades(Sesion.token()); } };

  document.addEventListener('DOMContentLoaded', async function () {
    const bt = document.getElementById('btnTema');
    if (bt) bt.addEventListener('click', function () { Tema.alternar(); });

    const form = document.getElementById('formLogin');
    if (form) form.addEventListener('submit', pedirEnlace);

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
