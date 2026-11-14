(function () {
  var log = [];
  var id = 'EVI_01M7DVN3DY4834C4CEE75646CD';
  fetch(window.CFG.API_URL + '?action=public.foto&id=' + id, { redirect: 'follow' })
    .then(function (r) { log.push('HTTP ' + r.status); return r.text(); })
    .then(function (t) { log.push('bytes ' + t.length + ' · ' + t.slice(0, 30)); })
    .catch(function (e) { log.push('FALLÓ: ' + e.message); })
    .then(function () { document.title = log.join(' | '); });
})();
