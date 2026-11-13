/**
 * datos.js — listas compartidas del panel.
 *
 * El árbol de secciones, las empresas, los usuarios, los tipos y las plantillas
 * los piden varios módulos a la vez. Antes cada uno hacía su propia llamada: el
 * panel del administrador llegaba a pedir `nodos.arbol` seis veces al entrar.
 * Aquí la primera llamada va al servidor y las demás esperan la misma respuesta.
 *
 * Toda escritura que cambie una de esas listas debe llamar a Datos.invalidar.
 */
(function () {
  'use strict';

  const LISTAS = [
    'nodos.arbol',
    'empresas.listar',
    'usuarios.listar',
    'tipos.listar',
    'plantillas.listar',
  ];

  const enCurso = {};

  function obtener(accion, token) {
    if (LISTAS.indexOf(accion) < 0) return API.llamar(accion, {}, { token: token });
    if (!enCurso[accion]) {
      enCurso[accion] = API.llamar(accion, {}, { token: token }).then(function (r) {
        // Un fallo no se guarda: el siguiente intento vuelve a preguntar.
        if (!r || !r.ok) delete enCurso[accion];
        return r;
      }, function (e) {
        delete enCurso[accion];
        throw e;
      });
    }
    return enCurso[accion];
  }

  /** Se llama después de crear, editar o borrar algo de esas listas. */
  function invalidar(accion) {
    if (accion) delete enCurso[accion];
    else LISTAS.forEach(function (a) { delete enCurso[a]; });
  }

  window.Datos = {
    obtener: obtener,
    invalidar: invalidar,
    listas: LISTAS.slice(),
    // Solo para pruebas: cuántas listas están en curso ahora mismo.
    enCurso: function () { return Object.keys(enCurso); },
  };
})();
