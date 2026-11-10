/**
 * Compara las columnas del esquema con las que escribe el código.
 * Detecta el error que ya apareció tres veces: escribir en una tabla una columna
 * que pertenece a otra («nodos no tiene columna salud_calculado_en»).
 */
import fs from 'node:fs';
import path from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const dir = path.join(raiz, 'apps-script');

const schema = fs.readFileSync(path.join(dir, 'Schema.gs'), 'utf8');

// Columnas de auditoría, comunes a todas las tablas
const audit = (schema.match(/CAMPOS_AUDITORIA\s*=\s*\[([^\]]*)\]/) || [, ''])[1]
  .split(',').map((c) => c.trim().replace(/['"]/g, '')).filter(Boolean);

// Tablas y sus columnas
const tablas = {};
// Cada tabla termina en su primer corchete. Las columnas de auditoría solo existen
// en las que usan .concat(CAMPOS_AUDITORIA): darlas por hechas ocultaba errores reales.
const reTabla = /^\s{2}([a-z_]+):\s*\[([^\]]*)\]\s*(\.[a-z]+)?/gm;
let m;
while ((m = reTabla.exec(schema)) !== null) {
  const cols = m[2].split(',').map((c) => c.trim().replace(/['"]/g, '')).filter(Boolean);
  const conAuditoria = String(m[3] || '').indexOf('concat') >= 0;
  tablas[m[1]] = new Set(conAuditoria ? [...cols, ...audit] : cols);
}

// Recorre un objeto literal desde su llave de apertura y devuelve las claves de
// primer nivel, estén en su propia línea o no.
function clavesDe(texto, desde) {
  const claves = [];
  let nivel = 0;
  let i = desde;
  let enCadena = null;

  while (i < texto.length) {
    const c = texto[i];

    if (enCadena) {
      if (c === '\\') { i += 2; continue; }
      if (c === enCadena) enCadena = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { enCadena = c; i++; continue; }
    if (c === '/' && texto[i + 1] === '/') { i = texto.indexOf('\n', i); if (i < 0) break; continue; }

    if (c === '{' || c === '[') { nivel++; i++; continue; }
    if (c === '}' || c === ']') {
      nivel--;
      if (nivel === 0) return claves;
      i++;
      continue;
    }

    if (nivel === 1 && /[a-z_]/i.test(c)) {
      let j = i;
      while (j < texto.length && /[a-z0-9_]/i.test(texto[j])) j++;
      const palabra = texto.slice(i, j);
      let k = j;
      while (k < texto.length && /\s/.test(texto[k])) k++;
      // Solo es clave si viene después de «{» o de una coma: así no se confunden
      // con las ramas de un ternario (`cond ? algo : otro`).
      let p = i - 1;
      while (p >= 0 && /\s/.test(texto[p])) p--;
      const anterior = p >= 0 ? texto[p] : '';
      if ((anterior === '{' || anterior === ',') && texto[k] === ':' && texto[k + 1] !== ':') {
        claves.push(palabra);
      }
      i = j;
      continue;
    }
    i++;
  }
  return claves;
}

const problemas = [];
let revisadas = 0;

for (const archivo of fs.readdirSync(dir).filter((f) => f.endsWith('.gs'))) {
  const texto = fs.readFileSync(path.join(dir, archivo), 'utf8');
  const patrones = [
    /insertar\(\s*'([a-z_]+)'\s*,\s*\{/g,
    /actualizar\(\s*'([a-z_]+)'\s*,\s*[^,]+,\s*\{/g,
  ];
  for (const re of patrones) {
    let r;
    while ((r = re.exec(texto)) !== null) {
      const tabla = r[1];
      if (!tablas[tabla]) continue;
      const inicio = texto.indexOf('{', r.index);
      const claves = clavesDe(texto, inicio);
      revisadas++;
      for (const clave of claves) {
        if (!tablas[tabla].has(clave)) {
          const linea = texto.slice(0, r.index).split('\n').length;
          problemas.push(`${archivo}:${linea} · ${tabla} no tiene «${clave}»`);
        }
      }
    }
  }
}

if (problemas.length) {
  console.log('COLUMNAS INEXISTENTES (' + problemas.length + '):');
  problemas.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('OK: ' + revisadas + ' escrituras revisadas contra ' + Object.keys(tablas).length + ' tablas');
