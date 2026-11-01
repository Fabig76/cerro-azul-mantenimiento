import fs from 'node:fs';

/** Sube el ?v= de todos los recursos locales de web/ y deja la versión anotada. */
const ruta = new URL('../web/VERSION', import.meta.url);
const actual = Number(fs.readFileSync(ruta, 'utf8').trim() || '0');
const nueva = String(actual + 1);

for (const archivo of ['web/app.html', 'web/index.html']) {
  const rutaArchivo = new URL('../' + archivo, import.meta.url);
  let texto = fs.readFileSync(rutaArchivo, 'utf8');
  texto = texto.replace(/\?v=\d+/g, '?v=' + nueva);
  fs.writeFileSync(rutaArchivo, texto);
}

fs.writeFileSync(ruta, nueva + '\n');
console.log('versión de recursos:', nueva);
