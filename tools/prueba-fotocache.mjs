/**
 * prueba-fotocache.mjs — la caché de fotos: guarda, reutiliza y borra.
 * Se ejecuta en un navegador de verdad, porque IndexedDB no existe en Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const pagina = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>cargando</title></head><body>
<script src="/web/js/fotocache.js"></script>
<script>
(function () {
  const r = [];
  window.__err = [];
  window.addEventListener('error', function (e) { window.__err.push(e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    window.__err.push('promesa: ' + ((e.reason && e.reason.message) || e.reason));
  });
  let pedidas = 0;
  FotoCache.configurar(function () {
    pedidas++;
    return Promise.resolve({ base64: 'QUJD', mime: 'image/jpeg' });
  });

  async function esperar(ms) { return new Promise(function (x) { setTimeout(x, ms); }); }

  (async function () {
    try {
      // 1. La primera vez se pide
      let img = document.createElement('img');
      document.body.appendChild(img);
      FotoCache.mostrar(img, { clave: 'evidencia:E1', tipo: 'evidencia', id: 'E1' });
      await FotoCache._cargar(img);
      await esperar(100);
      r.push((pedidas === 1 && img.src.indexOf('data:') === 0 ? 'OK   ' : 'FALLA') +
        ' · la primera vez pide la foto y la pinta');

      // 2. La segunda vez no se pide: sale de la caché
      let img2 = document.createElement('img');
      document.body.appendChild(img2);
      FotoCache.mostrar(img2, { clave: 'evidencia:E1', tipo: 'evidencia', id: 'E1' });
      await FotoCache._cargar(img2);
      await esperar(100);
      r.push((pedidas === 1 && img2.src.indexOf('data:') === 0 ? 'OK   ' : 'FALLA') +
        ' · la segunda vez no pide nada (pedidas=' + pedidas + ')');

      // 3. Otra foto sí se pide
      let img3 = document.createElement('img');
      document.body.appendChild(img3);
      FotoCache.mostrar(img3, { clave: 'evidencia:E2', tipo: 'evidencia', id: 'E2' });
      await FotoCache._cargar(img3);
      await esperar(100);
      r.push((pedidas === 2 ? 'OK   ' : 'FALLA') + ' · una foto distinta se pide (pedidas=' + pedidas + ')');

      // 4. Limpiar borra la caché
      await FotoCache.limpiar();
      let img4 = document.createElement('img');
      document.body.appendChild(img4);
      FotoCache.mostrar(img4, { clave: 'evidencia:E1', tipo: 'evidencia', id: 'E1' });
      await FotoCache._cargar(img4);
      await esperar(100);
      r.push((pedidas === 3 ? 'OK   ' : 'FALLA') + ' · tras limpiar se vuelve a pedir (pedidas=' + pedidas + ')');
    } catch (e) { r.push('FALLA · ' + e.message); }
    if (window.__err.length) r.push('ERRORES: ' + window.__err.slice(0, 3).join(' / '));
    document.title = r.join(' | ');
  })();
})();
</script></body></html>`;

// IndexedDB no funciona en file://: se sirve por HTTP desde un proceso propio.
const { spawn } = await import('node:child_process');
const puerto = 8931;
const servidor = spawn('python3', ['-m', 'http.server', String(puerto), '--bind', '127.0.0.1'],
  { cwd: raiz, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const archivo = path.join(raiz, 'web', '_prueba-fotocache.html');
fs.writeFileSync(archivo, pagina);
let salida = '';
try {
  salida = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=12000',
    '--dump-dom', 'http://127.0.0.1:' + puerto + '/web/_prueba-fotocache.html'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} finally {
  servidor.kill();
  fs.unlinkSync(archivo);
}
const titulo = (salida.match(/<title>([^<]*)<\/title>/) || [])[1] || '(sin título)';
console.log(titulo.split('|').join('\n'));
if (titulo.indexOf('FALLA') >= 0) process.exit(1);
