/**
 * Falla si web/js llama a una función que no está definida en ninguna parte.
 * Este control habría atrapado la desaparición de bloqueFotos.
 */
import fs from 'node:fs';
import path from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const dir = path.join(raiz, 'web', 'js');
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

const conocidos = new Set([
  // navegador y lenguaje
  'document', 'window', 'console', 'fetch', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Math', 'Date', 'Promise', 'setTimeout', 'clearTimeout', 'setInterval', 'encodeURIComponent',
  'decodeURIComponent', 'URL', 'Blob', 'File', 'FormData', 'atob', 'btoa', 'parseInt', 'parseFloat',
  'isNaN', 'RegExp', 'Error', 'Uint8Array', 'localStorage', 'sessionStorage', 'history', 'location',
  'alert', 'confirm', 'requestAnimationFrame', 'Intl', 'Map', 'Set', 'Boolean', 'Symbol',
  // módulos del propio proyecto, expuestos en window
  'API', 'Sesion', 'Fotos', 'Google', 'Tema', 'App', 'Actividad', 'Usuarios', 'Elementos',
  'Novedades', 'Alertas', 'Plan', 'Empresas', 'Respaldo', 'Pruebas', 'Catalogo', 'Etapas',
  'Publico', 'Contratistas',
]);

const definidas = new Set();
for (const f of archivos) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  // Los parámetros también se pueden llamar (callbacks): const fn = (ok) => ok()
  for (const m of s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) definidas.add(m[1]);
  // Cualquier variable declarada puede contener una función (const leer = Etapas.crear(...))
  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) definidas.add(m[1]);
  for (const m of s.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) definidas.add(m[1]);
  // Nombres de parámetros: se aceptan como funciones llamables
  for (const m of s.matchAll(/(?:function\s*[A-Za-z_$\w]*\s*)?\(([^)]*)\)\s*(?:=>|\{)/g)) {
    for (const parte of m[1].split(',')) {
      const nombre = parte.trim().split(/[\s=:]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
    }
  }
}

const problemas = [];
for (const f of archivos) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  // Se quitan comentarios y textos para no confundir nombres
  const limpio = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
                  .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');

  for (const m of limpio.matchAll(/(^|[^\w$.])([a-z][\w$]*)\s*\(/g)) {
    const nombre = m[2];
    if (conocidos.has(nombre)) continue;
    if (definidas.has(nombre)) continue;
    // palabras clave y métodos de cadena habituales
    if (['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await',
         'map', 'filter', 'forEach', 'slice', 'join', 'split', 'then', 'catch', 'push', 'some',
         'every', 'reduce', 'sort', 'trim', 'replace', 'match', 'test', 'indexOf', 'includes',
         'concat', 'toString', 'toUpperCase', 'toLowerCase', 'charCodeAt', 'padStart', 'find',
         'keys', 'values', 'entries', 'apply', 'call', 'bind', 'toFixed', 'round', 'floor',
         'ceil', 'max', 'min', 'abs', 'random', 'stringify', 'parse', 'stringify'].includes(nombre)) continue;
    const linea = limpio.slice(0, m.index).split('\n').length;
    problemas.push(`${f}:${linea} · «${nombre}()» no está definida`);
  }
}

if (problemas.length) {
  console.log('FUNCIONES SIN DEFINIR (' + problemas.length + '):');
  [...new Set(problemas)].forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('OK: ' + archivos.length + ' módulos, todas las funciones llamadas existen');
