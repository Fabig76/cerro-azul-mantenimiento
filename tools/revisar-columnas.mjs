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
// Cada tabla termina en su primer corchete; algunas usan .concat(CAMPOS_AUDITORIA) y otras no.
const reTabla = /^\s{2}([a-z_]+):\s*\[([^\]]*)\]/gm;
let m;
while ((m = reTabla.exec(schema)) !== null) {
  const cols = m[2].split(',').map((c) => c.trim().replace(/['"]/g, '')).filter(Boolean);
  tablas[m[1]] = new Set([...cols, ...audit]);
}

// Recorre un objeto literal desde la llave de apertura y devuelve sus claves de primer nivel
function clavesDe(texto, desde) {
  const claves = [];
  let nivel = 0;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return claves; }
    else if (nivel === 1 && c === '\n') {
      const resto = texto.slice(i + 1, i + 80);
      const k = /^\s*([a-z_][a-z0-9_]*)\s*:/.exec(resto);
      if (k) claves.push(k[1]);
    }
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
