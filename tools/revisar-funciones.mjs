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
  // Sin paréntesis anidados: así se lee el parámetro real de una función dentro de otra.
  for (const m of s.matchAll(/(?:function\s*[A-Za-z_$\w]*\s*)?\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const parte of m[1].split(',')) {
      const nombre = parte.trim().split(/[\s=:]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
    }
  }
}

/**
 * Devuelve el código con comentarios y textos reemplazados por espacios.
 * Conserva la longitud para que los números de línea sigan siendo exactos.
 */
function taparTextos(codigo) {
  const salida = codigo.split('');
  let i = 0;
  const tapar = function (desde, hasta) {
    for (let k = desde; k < hasta; k++) if (salida[k] !== '\n') salida[k] = ' ';
  };
  while (i < codigo.length) {
    const c = codigo[i];
    const siguiente = codigo[i + 1];
    if (c === '/' && siguiente === '/') {
      const fin = codigo.indexOf('\n', i);
      const hasta = fin === -1 ? codigo.length : fin;
      tapar(i, hasta); i = hasta; continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = codigo.indexOf('*/', i + 2);
      const hasta = fin === -1 ? codigo.length : fin + 2;
      tapar(i, hasta); i = hasta; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let k = i + 1;
      while (k < codigo.length) {
        if (codigo[k] === '\\') { k += 2; continue; }
        if (codigo[k] === c) break;
        k++;
      }
      tapar(i + 1, Math.min(k, codigo.length));
      i = k + 1; continue;
    }
    i++;
  }
  return salida.join('');
}

const problemas = [];
for (const f of archivos) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  // Se tapan comentarios y textos con espacios (misma longitud, para que las líneas
  // del aviso sigan siendo las del archivo). Sin esto, un texto como
  // 'Qué se hizo (opcional)' parece una llamada a la función «hizo».
  const limpio = taparTextos(s);

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
