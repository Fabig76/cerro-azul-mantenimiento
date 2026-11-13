/**
 * contar-llamadas.mjs — mide cuántas llamadas hace el panel al entrar, por rol,
 * y falla si se pasa de la meta o si repite la misma.
 *
 * Meta (SPEC v1.4, 2.2): administrador ≤ 6, contratista ≤ 5, sin repetidas.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const html = fs.readFileSync(path.join(raiz, 'web', 'app.html'), 'utf8');

// El contratista pasó de 4 a 5 cuando se agregó «Novedades para usted» (3.2):
// es una llamada nueva y deliberada, no una repetición. Lo que no se admite es
// que la misma acción se pida dos veces.
const META = { ADMIN: 6, CONTRATISTA: 5 };

function armar(rol) {
  let s = html.replace(/<script[^>]*><\/script>/g, '');
  s = s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  s = s.replace(/(<link[^>]*href=")\.\/([^"?]+)(\?[^"]*)?"/g, (m, a, ruta) => a + 'file://' + raiz + 'web/' + ruta + '"');

  const scripts = ['api', 'datos', 'sesion', 'fotos', 'etapas', 'propuestas', 'actividad',
    'usuarios', 'elemento', 'novedades', 'alertas', 'plan', 'catalogo', 'empresas',
    'respaldo', 'pruebas', 'app'];

  const stubs = `
<script>
  window.CFG = { API_URL: '', GOOGLE_CLIENT_ID: '' };
  window.Tema = { alternar: function () {}, aplicar: function () {} };
  window.__llamadas = [];
  var DATOS = {
    'auth.me': { usuario: { id: 'U1', email: 'a@b.c', nombre: 'Prueba', rol: '${rol}' }, permisos: [] },
    'nodos.arbol': { nodos: [] },
    'actividades.listar': { actividades: [], total: 0, conteos: {} },
    'propuestas.listar': { propuestas: [], total: 0 },
    'empresas.listar': { empresas: [] },
    'usuarios.listar': { usuarios: [] },
    'tipos.listar': { tipos: [] },
    'plantillas.listar': { plantillas: [] },
    'alertas.listar': { alertas: [] },
    'respaldos.listar': { respaldos: [] },
    'sistema.estado': { correos: { pendientes: 0, errores: 0 }, disparadores: [], faltan: [] }
  };
  window.__errores = [];

  window.addEventListener('error', function (e) { window.__errores.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errores.push('promesa: ' + ((e.reason && e.reason.message) || e.reason));
  });
</script>
${scripts.map((n) => '<script src="file://' + raiz + 'web/js/' + n + '.js"></script>').join('\n')}
<script>
  // api.js y sesion.js definen window.API y window.Sesion: los dobles van después.
  window.Sesion = { token: function () { return 'x'; }, limpiar: function () {},
    usuario: function () { return null; } };
  window.API = { llamar: function (accion) {
    window.__llamadas.push(accion);
    return Promise.resolve({ ok: true, data: DATOS[accion] || {} });
  }, publico: function () { return Promise.resolve({ ok: true, data: {} }); } };
  function medir() {
    setTimeout(function () {
      document.title = 'llamadas=' + window.__llamadas.join(',') + '||' +
        (window.__errores.length ? 'ERRORES: ' + window.__errores.slice(0, 2).join(' / ') : 'sin errores');
    }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', medir); else medir();
</script>`;
  return s.replace('</body>', stubs + '\n</body>');
}

let fallas = 0;
for (const rol of Object.keys(META)) {
  const archivo = path.join(os.tmpdir(), 'llamadas-' + rol + '.html');
  fs.writeFileSync(archivo, armar(rol));
  const salida = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=9000',
    '--dump-dom', 'file://' + archivo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const titulo = (salida.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const partes = titulo.split('||');
  const lista = (partes[0] || '').replace('llamadas=', '').split(',').filter(Boolean);
  const nota = (partes[1] || '').trim();
  const repetidas = lista.filter((a, i) => lista.indexOf(a) !== i);
  const meta = META[rol];

  console.log('\n' + rol + ': ' + lista.length + ' llamadas (meta ≤ ' + meta + ')');
  console.log('  ' + (lista.join(', ') || '(ninguna)'));
  if (nota && nota !== 'sin errores') console.log('  ' + nota);
  if (lista.length > meta) { console.log('  FALLA · pasa de la meta'); fallas++; }
  if (repetidas.length) { console.log('  FALLA · repetidas: ' + [...new Set(repetidas)].join(', ')); fallas++; }
  if (lista.length <= meta && !repetidas.length) console.log('  OK · dentro de la meta y sin repetidas');
}

console.log('\n' + (fallas ? 'HAY ' + fallas + ' FALLA(S)' : 'Dentro de la meta en los dos roles.'));
process.exit(fallas ? 1 : 0);
