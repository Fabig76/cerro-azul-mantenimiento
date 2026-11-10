/**
 * prueba-panel.mjs — carga el app.html real con un servidor simulado y comprueba,
 * en el navegador, lo que cada rol ve de verdad.
 *
 * Uso: node tools/prueba-panel.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const html = fs.readFileSync(path.join(raiz, 'web/app.html'), 'utf8');

const ROLES = ['ADMIN', 'CONTRATISTA'];

function armar(rol) {
  // Se quitan los scripts reales y el de Google: se dejan las marcas del panel intactas.
  let s = html.replace(/<script[^>]*><\/script>/g, '');
  // La CSP bloquea los guiones insertados; en la prueba se quita (la CSP real se
  // vigila aparte, en tools/auditar-frontend.mjs).
  s = s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  // Las hojas de estilo se referencian en absoluto: el archivo de prueba vive en otra carpeta.
  s = s.replace(/(<link[^>]*href=")\.\/([^"?]+)(\?[^"]*)?"/g,
    (m, a, ruta, v) => a + 'file://' + raiz + 'web/' + ruta + '"');
  const stubs = `
<script>
  window.CFG = { API_URL: '', GOOGLE_CLIENT_ID: '' };
  window.Fotos = { preparar: function () { return Promise.resolve({}); } };
  window.Tema = { alternar: function () {}, aplicar: function () {} };
  var RESPUESTAS = {
    'auth.me': { ok: true, data: { usuario: { id: 'USU_1', email: 'prueba@urbcerroazul.com',
      nombre: 'Prueba', rol: '${rol}' }, permisos: [] } },
    'nodos.arbol': { ok: true, data: { nodos: [] } },
    'actividades.listar': { ok: true, data: { actividades: [], total: 0 } },
    'propuestas.listar': { ok: true, data: { propuestas: [], total: 0 } }
  };
  window.API = { llamar: function (accion) {
    return Promise.resolve(RESPUESTAS[accion] || { ok: true, data: {} });
  } };
  window.Sesion = { token: function () { return 'token-de-prueba'; },
    limpiar: function () {}, usuario: function () { return null; } };
  window.permisos = [];
</script>
<script src="file://${raiz}web/js/propuestas.js"></script>
<script src="file://${raiz}web/js/app.js"></script>
<script>
  window.__errores = [];
  window.addEventListener('error', function (e) {
    window.__errores.push((e.message || 'error') + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errores.push('promesa: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });
  function medir() {
    setTimeout(function () {
      function ver(id) {
        var n = document.getElementById(id);
        if (!n) return 'no existe';
        return getComputedStyle(n).display === 'none' ? 'oculto' : 'visible';
      }
      var r = [];
      r.push('boton=' + ver('btnNuevaActividad'));
      r.push('nueva=' + ver('tarjetaNuevaActividad'));
      r.push('propuestas=' + ver('tarjetaPropuestas'));
      r.push('mias=' + ver('tarjetaMisPropuestas'));
      r.push('lista=' + ver('tarjetaActividades'));
      ['tarjetaNuevaActividad', 'tarjetaPropuestas', 'tarjetaMisPropuestas'].forEach(function (id) {
        var n = document.getElementById(id);
        r.push(id + '=«' + (n ? n.className : 'sin nodo') + '»');
      });
      // Ciclo completo del botón, solo cuando debe existir.
      var boton = document.getElementById('btnNuevaActividad');
      var tarjeta = document.getElementById('tarjetaNuevaActividad');
      if (boton && getComputedStyle(boton).display !== 'none' && tarjeta) {
        boton.click();
        r.push('trasPulsar=' + (tarjeta.classList.contains('oculto') ? 'oculto' : 'visible'));
        var cancelar = document.getElementById('btnCancelarActividad');
        if (cancelar) cancelar.click();
        r.push('trasCancelar=' + (tarjeta.classList.contains('oculto') ? 'oculto' : 'visible'));
        r.push('botonVuelve=' + (getComputedStyle(boton).display === 'none' ? 'oculto' : 'visible'));
      }
      if (window.__errores && window.__errores.length) r.push('errores=' + window.__errores.slice(0, 3).join(' | '));
      document.title = r.join(' ');
    }, 700);
  }
  // No se espera al evento load: con archivos locales puede no llegar.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', medir);
  else medir();
</script>`;
  return s.replace('</body>', stubs + '\n</body>');
}

const esperado = {
  ADMIN: { boton: 'visible', nueva: 'oculto', propuestas: 'visible', mias: 'oculto', lista: 'visible',
    trasPulsar: 'visible', trasCancelar: 'oculto', botonVuelve: 'visible' },
  CONTRATISTA: { boton: 'oculto', nueva: 'oculto', propuestas: 'oculto', mias: 'visible', lista: 'visible' },
};

let fallas = 0;
for (const rol of ROLES) {
  const archivo = path.join(os.tmpdir(), 'panel-' + rol + '.html');
  fs.writeFileSync(archivo, armar(rol));

  const salida = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=9000',
    '--dump-dom', 'file://' + archivo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const titulo = (salida.match(/<title>([^<]*)<\/title>/) || [])[1] || '(sin título)';
  if (process.env.VER) console.log(titulo);
  const visto = Object.fromEntries(titulo.split(' ').map((p) => p.split('=')));

  console.log('\n' + rol + ':');
  for (const [clave, valor] of Object.entries(esperado[rol])) {
    const real = visto[clave] || '?';
    const bien = real === valor;
    if (!bien) fallas++;
    console.log('  ' + (bien ? 'OK   ' : 'FALLA') + ' · ' + clave + ': ' + real + (bien ? '' : ' (debería ser ' + valor + ')'));
  }
}

console.log('\n' + (fallas ? 'FALLAS: ' + fallas : 'Todo como debe ser.'));
process.exit(fallas ? 1 : 0);
