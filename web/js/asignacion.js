/**
 * asignacion.js — los desplegables de Empresa y Responsable de una actividad.
 *
 * Lo usan el formulario de creación y el de edición: una sola implementación, no
 * dos copias (CLAUDE.md, error 4). Mientras las listas no lleguen, los dos
 * desplegables quedan deshabilitados con el valor actual: si se guardara antes,
 * se borrarían la empresa y el responsable.
 */
(function () {
  'use strict';

  function opcion(valor, texto, deshabilitada) {
    const o = document.createElement('option');
    o.value = valor;
    o.textContent = texto;
    if (deshabilitada) o.disabled = true;
    return o;
  }

  /** ¿El nodo cae dentro de alguna asignación vigente del usuario? */
  function tieneAcceso(usuario, nodo) {
    if (!usuario || !nodo) return true;
    const asignaciones = usuario.asignaciones || [];
    if (!asignaciones.length) return false;
    const propio = String(nodo.ruta_ids || '') + '/' + nodo.id;
    return asignaciones.some(function (a) {
      const raiz = a.nodo_id;
      return propio === raiz || propio.indexOf(String(raiz) + '/') >= 0 ||
        String(a.nodo_id) === String(nodo.id);
    });
  }

  /**
   * montar(selEmpresa, selPersona, opciones) → { listo, alCambiarEmpresa }
   * opciones: { empresa, responsable, nodo, alAvisar(texto) }
   */
  function montar(selEmpresa, selPersona, opciones) {
    const opt = opciones || {};
    if (!selEmpresa || !selPersona) return { listo: Promise.resolve(false) };

    selEmpresa.disabled = true;
    selPersona.disabled = true;
    selEmpresa.textContent = '';
    selEmpresa.appendChild(opcion(opt.empresa || '', 'Cargando…', false));
    selPersona.textContent = '';
    selPersona.appendChild(opcion(opt.responsable || '', 'Cargando…', false));

    const listo = Promise.all([
      Datos.obtener('empresas.listar', Sesion.token()),
      Datos.obtener('usuarios.listar', Sesion.token()),
    ]).then(function (res) {
      const empresas = res[0] && res[0].ok ? (res[0].data.empresas || []) : null;
      const usuarios = res[1] && res[1].ok ? (res[1].data.usuarios || []) : null;
      if (!empresas || !usuarios) {
        if (opt.alAvisar) opt.alAvisar('No se pudieron cargar las empresas o los responsables. Se conserva lo que tenía.');
        return false;
      }

      selEmpresa.textContent = '';
      selEmpresa.appendChild(opcion('', 'Sin empresa asignada', false));
      empresas.sort(function (a, b) { return String(a.razon_social).localeCompare(String(b.razon_social)); })
        .forEach(function (e) {
          const o = opcion(e.id, e.razon_social + (e.vencida ? ' (contrato vencido)' : ''), e.vencida);
          if (String(e.id) === String(opt.empresa || '')) o.selected = true;
          selEmpresa.appendChild(o);
        });
      // La empresa actual se muestra aunque esté vencida: hay que poder verla.
      if (opt.empresa && !empresas.some(function (e) { return String(e.id) === String(opt.empresa); })) {
        selEmpresa.appendChild(opcion(opt.empresa, 'Empresa actual', false)).selected = true;
      }

      const elegibles = usuarios.filter(function (u) {
        return String(u.estado) === 'ACTIVO' &&
          ['CONTRATISTA', 'SUPERVISOR'].indexOf(String(u.rol)) >= 0;
      });

      const actual = usuarios.filter(function (u) { return String(u.id) === String(opt.responsable || ''); })[0];

      const pintarPersonas = function () {
        const empresaId = selEmpresa.value;
        const previo = selPersona.value || opt.responsable || '';
        selPersona.textContent = '';
        selPersona.appendChild(opcion('', 'Sin responsable', false));

        elegibles
          .filter(function (u) { return !empresaId || String(u.empresa_id || '') === String(empresaId); })
          .sort(function (a, b) { return String(a.nombre || a.email).localeCompare(String(b.nombre || b.email)); })
          .forEach(function (u) {
            const sinAcceso = opt.nodo ? !tieneAcceso(u, opt.nodo) : false;
            const o = opcion(u.id, (u.nombre || u.email) + (sinAcceso ? ' (sin acceso a esta sección)' : ''), false);
            if (String(u.id) === String(previo)) o.selected = true;
            selPersona.appendChild(o);
          });

        // Si el responsable actual no está en la nueva empresa, se conserva y se avisa.
        if (empresaId && previo && !Array.prototype.slice.call(selPersona.options)
          .some(function (o) { return o.value === previo; })) {
          const o = opcion(previo, (actual ? (actual.nombre || actual.email) : 'Responsable actual') +
            ' (no es de esta empresa)', false);
          o.selected = true;
          selPersona.appendChild(o);
          if (opt.alAvisar) opt.alAvisar('El responsable no es de la nueva empresa; elija otro.');
        }
        return previo;
      };

      pintarPersonas();
      selEmpresa.addEventListener('change', pintarPersonas);

      selEmpresa.disabled = false;
      selPersona.disabled = false;

      if (opt.alAvisar && opt.empresa) {
        const actualEmpresa = empresas.filter(function (e) { return String(e.id) === String(opt.empresa); })[0];
        if (actualEmpresa && actualEmpresa.vencida) {
          opt.alAvisar('El contrato de esta empresa está vencido. Puede dejarla o cambiarla por otra.');
        }
      }
      return true;
    }).catch(function () {
      if (opt.alAvisar) opt.alAvisar('No se pudieron cargar las empresas. Se conserva lo que tenía.');
      return false;
    });

    return { listo: listo };
  }

  window.Asignacion = { montar: montar, tieneAcceso: tieneAcceso };
})();
