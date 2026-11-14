/**
 * fotocache.js — guarda las miniaturas en el propio dispositivo.
 *
 * Cada foto es una llamada al servidor que devuelve la imagen como texto. Una
 * evidencia no cambia nunca, así que se guarda y no se vuelve a pedir. En el
 * portal público, la segunda visita no debería pedir ninguna foto.
 *
 * Si el navegador no tiene IndexedDB, todo sigue funcionando sin caché.
 */
(function () {
  'use strict';

  const BASE = 'ca-fotos';
  const ALMACEN = 'mini';
  const TOPE = 300;            // entradas guardadas antes de empezar a borrar

  let bd = null;
  let abriendo = null;
  const memoria = {};          // copia corta en RAM para el mismo pase

  function abrir() {
    if (bd) return Promise.resolve(bd);
    if (abriendo) return abriendo;
    abriendo = new Promise(function (resolver) {
      // Si el navegador no responde (origen restringido, IndexedDB bloqueado),
      // se sigue sin caché en vez de dejar la imagen esperando para siempre.
      const limite = setTimeout(function () { resolver(null); }, 1500);
      const terminar = function (base) { clearTimeout(limite); resolver(base); };
      try {
        if (!window.indexedDB) return terminar(null);
        const pedido = indexedDB.open(BASE, 1);
        pedido.onupgradeneeded = function () {
          const base = pedido.result;
          if (!base.objectStoreNames.contains(ALMACEN)) {
            const almacen = base.createObjectStore(ALMACEN, { keyPath: 'clave' });
            almacen.createIndex('usado', 'usado');
          }
        };
        pedido.onsuccess = function () { bd = pedido.result; terminar(bd); };
        pedido.onerror = function () { terminar(null); };
        pedido.onblocked = function () { terminar(null); };
      } catch (e) { terminar(null); }
    });
    return abriendo;
  }

  function leer(clave) {
    if (memoria[clave]) return Promise.resolve(memoria[clave]);
    return abrir().then(function (base) {
      if (!base) return null;
      return new Promise(function (resolver) {
        try {
          const tx = base.transaction(ALMACEN, 'readonly');
          const p = tx.objectStore(ALMACEN).get(clave);
          p.onsuccess = function () {
            const fila = p.result;
            if (fila) { memoria[clave] = fila; resolver(fila); } else resolver(null);
          };
          p.onerror = function () { resolver(null); };
        } catch (e) { resolver(null); }
      });
    });
  }

  function guardar(clave, base64, mime) {
    const fila = { clave: clave, base64: base64, mime: mime || 'image/jpeg', usado: Date.now() };
    memoria[clave] = fila;
    return abrir().then(function (base) {
      if (!base) return;
      try {
        const tx = base.transaction(ALMACEN, 'readwrite');
        const almacen = tx.objectStore(ALMACEN);
        almacen.put(fila);
        // Tope: si hay demasiadas, se borran las menos usadas.
        const cuenta = almacen.count();
        cuenta.onsuccess = function () {
          if (cuenta.result <= TOPE) return;
          const sobran = cuenta.result - TOPE;
          const cursor = almacen.index('usado').openCursor();
          let borradas = 0;
          cursor.onsuccess = function () {
            const c = cursor.result;
            if (!c || borradas >= sobran) return;
            almacen.delete(c.value.clave);
            borradas++;
            c.continue();
          };
        };
      } catch (e) { /* sin caché */ }
    });
  }

  function limpiar() {
    Object.keys(memoria).forEach(function (k) { delete memoria[k]; });
    return abrir().then(function (base) {
      if (!base) return;
      try { base.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).clear(); } catch (e) { /* nada */ }
    });
  }

  // --- Carga cuando la imagen entra en pantalla ---
  let observador = null;
  let vistas = 0;
  const INMEDIATAS = 6;   // las primeras se piden ya; el resto, al entrar en pantalla

  function observadorDe() {
    if (observador || !window.IntersectionObserver) return observador;
    observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        observador.unobserve(e.target);
        cargar(e.target);
      });
    }, { rootMargin: '200px' });
    return observador;
  }

  async function cargar(img) {
    if (!img || img.dataset.cargada === '1' || img.dataset.cargando === '1') return;
    const clave = img.dataset.clave;
    const tipo = img.dataset.tipo;
    if (!clave || !tipo) return;
    img.dataset.cargando = '1';
    try {
      await cargarDeVerdad(img, clave, tipo);
    } finally {
      delete img.dataset.cargando;
    }
  }

  async function cargarDeVerdad(img, clave, tipo) {
    // La caché no puede frenar la primera imagen: si IndexedDB no contesta en
    // 400 ms, se pide a la red y se sigue.
    const guardada = await Promise.race([
      leer(clave),
      new Promise(function (resolver) { setTimeout(function () { resolver(null); }, 400); }),
    ]);
    if (guardada) {
      img.src = 'data:' + guardada.mime + ';base64,' + guardada.base64;
      img.dataset.cargada = '1';
      return;
    }

    try {
      const r = await window.FotoCache.traer(tipo, img.dataset);
      if (r && r.base64) {
        img.src = 'data:' + (r.mime || 'image/jpeg') + ';base64,' + r.base64;
        img.dataset.cargada = '1';
        guardar(clave, r.base64, r.mime);
      }
    } catch (e) { /* queda el hueco */ }
  }

  /** Prepara una imagen: guarda cómo pedirla y la carga al entrar en pantalla. */
  function mostrar(img, datos) {
    img.dataset.clave = datos.clave;
    img.dataset.tipo = datos.tipo;
    if (datos.tam) img.dataset.tam = datos.tam;
    if (datos.id) img.dataset.id = datos.id;
    if (datos.propuesta) img.dataset.propuesta = datos.propuesta;
    // Si la imagen no está en la página (o no hay observador), se carga enseguida:
    // observarla sin estar en el documento la dejaría sin cargar para siempre.
    // Las primeras imágenes se piden de una vez: son las que se ven al abrir.
    if (vistas < INMEDIATAS) {
      vistas++;
      cargar(img);
      return;
    }

    const obs = observadorDe();
    if (obs && img.isConnected) {
      obs.observe(img);
      // Red de seguridad: si el observador no dispara (pestaña que se acaba de
      // mostrar, navegador antiguo), la imagen que ya está a la vista se carga igual.
      setTimeout(function () {
        if (img.dataset.cargada === '1' || img.dataset.cargando === '1') return;
        const caja = img.getBoundingClientRect();
        const alto = window.innerHeight || 800;
        if (caja.top < alto * 1.5 && caja.bottom > -alto * 0.5) cargar(img);
      }, 900);
    } else {
      cargar(img);
    }
  }

  // Quien usa el módulo dice cómo se pide cada tipo de foto.
  let traer = function () { return Promise.resolve(null); };

  window.FotoCache = {
    mostrar: mostrar,
    limpiar: limpiar,
    leer: leer,
    guardar: guardar,
    configurar: function (fn) { traer = fn; },
    traer: function (tipo, datos) { return traer(tipo, datos); },
    _cargar: cargar,
  };
})();
