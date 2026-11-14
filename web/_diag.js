(function () {
  var log = [];
  var s = document.createElement('script');
  s.src = '/js/fotocache.js';
  s.onload = function () {
    var img = document.createElement('img');
    document.body.appendChild(img);
    FotoCache.configurar(function (tipo, datos) {
      log.push('traer(' + tipo + ',' + datos.tipo + ')');
      return fetch(window.CFG.API_URL + '?action=public.foto&id=' + datos.id, { redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .catch(function (e) { log.push('fetch ' + e.message); return null; });
    });
    FotoCache.mostrar(img, { clave: 'publica:EVI_01M7DVN3DY4834C4CEE75646CD', tipo: 'publica', id: 'EVI_01M7DVN3DY4834C4CEE75646CD' });
    setTimeout(function () {
      log.push('src=' + (img.src.indexOf('data:') === 0 ? 'SÍ' : 'NO'));
      log.push('cargando=' + (img.dataset.cargando || '-'));
      document.title = log.join(' | ');
    }, 4000);
  };
  s.onerror = function () { document.title = 'no cargó fotocache.js'; };
  document.head.appendChild(s);
})();
