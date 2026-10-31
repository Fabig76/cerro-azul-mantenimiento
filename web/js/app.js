/**
 * app.js — pantalla de ingreso y panel mínimo del portal.
 * Sin librerías: todo el HTML se construye con textContent (nunca innerHTML con datos).
 */
(function () {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };

  function ver(id, visible) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('oculto', !visible);
  }

  function aviso(id, texto, tipo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto;
    el.className = 'msg show ' + (tipo || 'info');
  }

  function ocultarAviso(id) {
    const el = document.getElementById(id);
    if (el) el.className = 'msg';
  }

  // --- Enlace de ingreso ---------------------------------------------------
  function tokenDelHash() {
    const h = window.location.hash || '';
    const m = h.match(/^#\/enlace\?t=([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  function limpiarHash() {
    if (window.history && history.replaceState) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  async function canjear(token) {
    aviso('avisoIngreso', 'Validando el enlace…', 'info');
    const r = await API.llamar('auth.enlace.canjear', { token_enlace: token });
    limpiarHash();
    if (!r.ok) {
      aviso('avisoIngreso', r.message || 'El enlace no es válido.', 'error');
      return false;
    }
    return procesarIngreso(r.data);
  }

  function procesarIngreso(data) {
    if (data.estado === 'PENDIENTE') {
      $('#pendienteNombre').textContent = data.usuario && data.usuario.email ? data.usuario.email : '';
      ver('pantallaPendiente', true);
      ver('pantallaLogin', false);
      ver('pantallaPanel', false);
      return true;
    }
    if (data.estado !== 'ACTIVO' || !data.sessionToken) {
      aviso('avisoLogin', 'Tu cuenta está inactiva. Habla con la administración.', 'error');
      return false;
    }
    Sesion.guardar({ token: data.sessionToken, expira_en: data.expira_en, usuario: data.usuario }, false);
    entrar();
    return true;
  }

  // --- Panel ---------------------------------------------------------------
  async function entrar() {
    const t = Sesion.token();
    if (!t) return mostrarLogin();
    const r = await API.llamar('auth.me', {}, { token: t });
    if (!r.ok) {
      if (r.code === 'SESION_VENCIDA' || r.code === 'NO_AUTENTICADO') {
        Sesion.limpiar();
        mostrarLogin();
        aviso('avisoLogin', 'Tu sesión terminó. Ingresa de nuevo.', 'info');
        return;
      }
      if (r.code === 'PENDIENTE') { ver('pantallaPendiente', true); ver('pantallaLogin', false); return; }
      aviso('avisoLogin', r.message || 'No pudimos validar tu sesión.', 'error');
      return mostrarLogin();
    }
    const me = r.data;
    ver('pantallaLogin', false);
    ver('pantallaPendiente', false);
    ver('pantallaPanel', true);
    $('#nombreUsuario').textContent = me.usuario.nombre || me.usuario.email;
    $('#rolUsuario').textContent = me.usuario.rol;
    cargarArbol(t, me);
  }

  async function cargarArbol(t, me) {
    const r = await API.llamar('nodos.arbol', {}, { token: t });
    const cont = $('#arbol');
    cont.textContent = '';
    if (!r.ok) {
      const p = document.createElement('p');
      p.textContent = r.message || 'No se pudo cargar el árbol.';
      cont.appendChild(p);
      return;
    }
    const nodos = r.data.nodos || [];
    if (!nodos.length) {
      $('#sinAsignacion').classList.remove('oculto');
      return;
    }
    const porPadre = {};
    nodos.forEach(function (n) {
      const p = n.parent_id || 'RAIZ';
      (porPadre[p] = porPadre[p] || []).push(n);
    });
    function pintar(padre) {
      const lista = document.createElement('ul');
      lista.className = 'arbol';
      (porPadre[padre] || [])
        .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
        .forEach(function (n) {
          const li = document.createElement('li');
          const nombre = document.createElement('span');
          nombre.textContent = n.nombre;
          const cod = document.createElement('span');
          cod.className = 'codigo';
          cod.textContent = n.codigo;
          li.appendChild(nombre);
          li.appendChild(cod);
          if (String(n.sensible) === 'true') {
            const pill = document.createElement('span');
            pill.className = 'pill sensible';
            pill.textContent = 'sensible';
            li.appendChild(pill);
          }
          if (porPadre[n.id]) li.appendChild(pintar(n.id));
          lista.appendChild(li);
        });
      return lista;
    }
    cont.appendChild(pintar('RAIZ'));
  }

  // --- Login ---------------------------------------------------------------
  function mostrarLogin() {
    ver('pantallaLogin', true);
    ver('pantallaPanel', false);
    ver('pantallaPendiente', false);
  }

  async function pedirEnlace(ev) {
    ev.preventDefault();
    const email = $('#correo').value.trim();
    if (!email) return;
    const b = $('#btnEnlace');
    b.disabled = true;
    b.textContent = 'Enviando…';
    const r = await API.llamar('auth.enlace.solicitar', { email: email }, { idempotente: true });
    b.disabled = false;
    b.textContent = 'Enviarme el enlace';
    if (!r.ok) return aviso('avisoLogin', r.message || 'No se pudo enviar el enlace.', 'error');
    aviso('avisoLogin', 'Listo. Revisa tu correo y abre el enlace; vence en 15 minutos.', 'ok');
  }

  function salir() {
    const t = Sesion.token();
    if (t) API.llamar('auth.salir', {}, { token: t });
    Sesion.limpiar();
    mostrarLogin();
    aviso('avisoLogin', 'Cerraste la sesión.', 'info');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const bt = document.getElementById('btnTema');
    if (bt) bt.addEventListener('click', function () { Tema.alternar(); });
    const form = document.getElementById('formLogin');
    if (form) form.addEventListener('submit', pedirEnlace);
    const bs = document.getElementById('btnSalir');
    if (bs) bs.addEventListener('click', salir);

    const g = document.getElementById('btnGoogle');
    if (g && !window.CFG.GOOGLE_CLIENT_ID) {
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
