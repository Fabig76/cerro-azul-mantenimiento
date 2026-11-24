/**
 * Falla si web/js llama a una función que no está definida en ninguna parte.
 * Este control habría atrapado la desaparición de bloqueFotos.
 */
import fs from 'node:fs';
import path from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const dir = path.join(raiz, 'web', 'js');
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

// Apps Script no tiene DOM ni temporizadores: esto rompe en producción y no en las pruebas.
const PROHIBIDOS_SERVIDOR = ['setTimeout', 'setInterval', 'requestAnimationFrame', 'window', 'document',
  'localStorage', 'alert', 'confirm', 'prompt'];

const conocidos = new Set([
  // navegador y lenguaje
  'document', 'window', 'console', 'fetch', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Math', 'Date', 'Promise', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'encodeURIComponent',
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

// --- Segundo control: el servidor (apps-script) no tiene DOM ni temporizadores ---
{
  const dirServidor = path.join(raiz, 'apps-script');
  const prohibidos = [];
  if (fs.existsSync(dirServidor)) {
    for (const f of fs.readdirSync(dirServidor).filter((x) => x.endsWith('.gs')).sort()) {
      const s = fs.readFileSync(path.join(dirServidor, f), 'utf8');
      const limpio = taparTextos(s);
      for (const nombre of PROHIBIDOS_SERVIDOR) {
        // `window` y `document` solo si se usan como objeto, no dentro de un texto.
        const re = new RegExp('(^|[^\\w$.])' + nombre + '\\s*[.(]', 'g');
        for (const m of limpio.matchAll(re)) {
          const linea = limpio.slice(0, m.index).length - limpio.slice(0, m.index).split('\n').pop().length;
          prohibidos.push(`${f}:${linea} · «${nombre}» no existe en Apps Script`);
        }
      }
    }
  }
  if (prohibidos.length) {
    console.log('CÓDIGO DE SERVIDOR INVÁLIDO (' + prohibidos.length + '):');
    [...new Set(prohibidos)].forEach((p) => console.log('  ' + p));
    process.exit(1);
  }
  console.log('OK: el servidor no usa DOM ni temporizadores');
}


// ---------------------------------------------------------------------------
// Funciones llamadas que no existen en ningún archivo.
// Pasó dos veces: se llamó a `recortar_` sin definirla y toda la creación de
// actividades respondía ERROR_INTERNO. La sintaxis no lo detecta: hay que buscar
// el nombre. Se saltan las llamadas a métodos (`.algo(`) y los globales del motor.
// ---------------------------------------------------------------------------
{
  const archivos = fs.readdirSync(path.join(raiz, 'apps-script'))
    .filter(function (f) { return f.endsWith('.gs'); });

  const definidas = new Set();
  archivos.forEach(function (f) {
    const src = fs.readFileSync(path.join(raiz, 'apps-script', f), 'utf8');
    let m;
    const reFn = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = reFn.exec(src))) definidas.add(m[1]);
    const reVar = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\(|async\s*function)/g;
    while ((m = reVar.exec(src))) definidas.add(m[1]);
  });

  // Globals del motor de Apps Script y de JavaScript: no están en el repositorio.
  const globales = new Set([
    'SpreadsheetApp', 'DriveApp', 'DocumentApp', 'ContentService', 'LockService', 'PropertiesService',
    'CacheService', 'Utilities', 'Session', 'ScriptApp', 'UrlFetchApp', 'MailApp', 'GmailApp',
    'CalendarApp', 'ContactsApp', 'XmlService', 'HtmlService', 'Chart', 'Logger', 'console',
    'JSON', 'Math', 'Date', 'String', 'Number', 'Boolean', 'Array', 'Object', 'RegExp', 'Error',
    'Set', 'Map', 'Promise', 'BigInt', 'Symbol', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'setTimeout', 'clearTimeout',
    'function', 'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'delete', 'void',
  ]);

  /** Quita comentarios y textos: solo interesa el código. */
  function soloCodigo(texto) {
    return String(texto)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1 ')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  // Un parámetro también es una función: `function conBloqueo(fn)` llama a `fn()`.
  archivos.forEach(function (f) {
    const src = soloCodigo(fs.readFileSync(path.join(raiz, 'apps-script', f), 'utf8'));
    const reParams = /function\s*[\w$]*\s*\(([^)]*)\)/g;
    let m;
    while ((m = reParams.exec(src))) {
      m[1].split(',').forEach(function (p) {
        const nombre = p.trim().split(/[\s=:]/)[0];
        if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
      });
    }
    const reArrow = /\(([^)]*)\)\s*=>/g;
    while ((m = reArrow.exec(src))) {
      m[1].split(',').forEach(function (p) {
        const nombre = p.trim().split(/[\s=:]/)[0];
        if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
      });
    }
  });

  const problemas = [];
  archivos.forEach(function (f) {
    const src = soloCodigo(fs.readFileSync(path.join(raiz, 'apps-script', f), 'utf8'));
    // Llamadas que no son métodos: se descarta lo que venga precedido por un punto.
    // Antes del nombre solo puede venir un separador: así «Pestañas(» no cuenta como «as(».
    const reLlamada = /(^|[\s=(,;[{!&|?:>+\-*\/%])([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = reLlamada.exec(src))) {
      const nombre = m[2];
      if (definidas.has(nombre) || globales.has(nombre)) continue;
      // Una función llamada desde otra hoja también vale: ya está en `definidas`.
      const linea = src.slice(0, m.index).split('\n').length;
      problemas.push(f + ':' + linea + ' · «' + nombre + '()» se llama y no está definida');
    }
  });

  if (problemas.length) {
    console.log('FUNCIONES QUE NO EXISTEN:');
    [...new Set(problemas)].slice(0, 20).forEach(function (x) { console.log('  ' + x); });
    process.exit(1);
  }
  console.log('OK: todas las funciones llamadas existen');
}
