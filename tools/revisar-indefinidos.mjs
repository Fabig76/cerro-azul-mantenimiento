/**
 * Falla si el código usa una función o una variable que no existe.
 *
 * `revisar-funciones.mjs` busca nombres con expresiones regulares: no ve las variables y da
 * por buena una función si el nombre existe en cualquier módulo. Así llegaron a producción
 * `enCurso` (Snapshot.gs), `campo` (usuarios.js), `aviso` (pruebas.js) y `recortar_`.
 * Este control usa un analizador de verdad (ESLint, regla `no-undef`) y respeta el alcance:
 *
 *   - apps-script/: todos los .gs juntos, porque Apps Script los carga en un solo espacio global.
 *   - web/: los scripts de cada página, en el orden en que la página los carga.
 *
 * También avisa de huecos en arreglos (`[a, , b]`) y de claves repetidas en un objeto.
 *
 * Uso:  node tools/revisar-indefinidos.mjs
 * La primera vez descarga ESLint con npx (necesita internet). No agrega nada a web/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;
const ESLINT = 'eslint@8.57.1';

const REGLAS = {
  'no-undef': 'error',
  'no-sparse-arrays': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-unsafe-negation': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};

const GLOBALES_APPS_SCRIPT = ['SpreadsheetApp', 'DriveApp', 'CacheService', 'LockService',
  'PropertiesService', 'MailApp', 'GmailApp', 'ContentService', 'ScriptApp', 'Utilities', 'Session',
  'UrlFetchApp', 'HtmlService', 'Logger', 'console', 'Drive', 'MimeType'];

/** Une varios archivos y recuerda de qué archivo y línea salió cada línea. */
function unir(rutas) {
  const lineas = [];
  const origen = [];
  for (const ruta of rutas) {
    fs.readFileSync(ruta, 'utf8').split('\n').forEach((texto, i) => {
      lineas.push(texto);
      origen.push({ archivo: path.relative(raiz, ruta), linea: i + 1 });
    });
  }
  return { texto: lineas.join('\n'), origen };
}

function revisar(nombre, rutas, entorno, globales) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'indefinidos-'));
  const { texto, origen } = unir(rutas);
  const archivo = path.join(tmp, 'todo.js');
  const config = path.join(tmp, 'eslintrc.json');
  fs.writeFileSync(archivo, texto);
  fs.writeFileSync(config, JSON.stringify({
    root: true,
    parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
    env: entorno,
    globals: Object.fromEntries(globales.map((g) => [g, 'readonly'])),
    rules: REGLAS,
  }));

  const r = spawnSync('npx', ['--yes', ESLINT, '--no-eslintrc', '-c', config, '--format', 'json', archivo],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(tmp, { recursive: true, force: true });

  let salida;
  try { salida = JSON.parse(r.stdout); } catch (e) {
    console.error('No se pudo ejecutar ESLint (' + nombre + '):\n' + (r.stderr || r.stdout || r.error));
    process.exit(2);
  }
  const hallazgos = (salida[0] && salida[0].messages) || [];
  hallazgos.forEach((m) => {
    const o = origen[m.line - 1] || { archivo: '?', linea: m.line };
    console.log('  ' + o.archivo + ':' + o.linea + ' · ' + m.message + ' (' + (m.ruleId || 'sintaxis') + ')');
  });
  console.log((hallazgos.length ? 'FALLA' : 'OK') + ' · ' + nombre + ' · ' + rutas.length +
    ' archivo(s), ' + hallazgos.length + ' hallazgo(s)');
  return hallazgos.length;
}

let total = 0;

// 1. Servidor: un solo espacio global.
const dirGs = path.join(raiz, 'apps-script');
const gs = fs.readdirSync(dirGs).filter((f) => f.endsWith('.gs')).sort().map((f) => path.join(dirGs, f));
total += revisar('apps-script', gs, { es2022: true }, GLOBALES_APPS_SCRIPT);

// 2. Pantallas: los scripts locales de cada página, en su orden.
const dirWeb = path.join(raiz, 'web');
for (const pagina of fs.readdirSync(dirWeb).filter((f) => f.endsWith('.html')).sort()) {
  const html = fs.readFileSync(path.join(dirWeb, pagina), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="(\.\/[^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => path.join(dirWeb, m[1]))
    .filter((ruta) => fs.existsSync(ruta));
  if (!scripts.length) continue;
  // Lo que los módulos de esta página publican en `window` (window.API = …) es global en ella.
  const publicados = new Set(['google']);
  for (const ruta of scripts) {
    for (const m of fs.readFileSync(ruta, 'utf8').matchAll(/window\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) publicados.add(m[1]);
  }
  total += revisar('web/' + pagina, scripts, { browser: true, es2022: true }, [...publicados]);
}

if (total) {
  console.error('\n' + total + ' hallazgo(s). Corrija antes de publicar.');
  process.exit(1);
}
console.log('\nSin nombres indefinidos.');
