/** Auditoría estática: acciones, archivos y campos que el panel espera encontrar. */
import fs from 'node:fs';
import path from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const web = path.join(raiz, 'web');
const leer = (p) => fs.readFileSync(p, 'utf8');
const problemas = [];
const ok = [];

// 1. Acciones que llama el frontend y existen en el router
const router = leer(path.join(raiz, 'apps-script', 'Router.gs'));
const registradas = new Set([...router.matchAll(/^\s{2}'([a-z][a-z.]*)':/gm)].map((m) => m[1]));
const llamadas = new Set();
for (const f of fs.readdirSync(path.join(web, 'js'))) {
  for (const m of leer(path.join(web, 'js', f)).matchAll(/API\.llamar\(\s*'([a-z][a-z.]*)'/g)) llamadas.add(m[1]);
}
for (const a of llamadas) {
  if (registradas.has(a)) ok.push('acción registrada: ' + a);
  else problemas.push('el frontend llama una acción inexistente: ' + a);
}

// 2. Archivos referenciados que no existen
for (const html of ['index.html', 'app.html', 'estilo.html', 'guia-contratistas.html',
                    'legal/politica.html', 'legal/aviso.html']) {
  const ruta = path.join(web, html);
  if (!fs.existsSync(ruta)) { problemas.push('falta la página ' + html); continue; }
  const texto = leer(ruta);
  for (const m of texto.matchAll(/(?:src|href)="(\.\/[^"?#]+)/g)) {
    const rel = m[1].replace(/^\.\//, '');
    const destino = path.join(path.dirname(ruta), rel);
    if (!fs.existsSync(destino)) problemas.push(html + ' apunta a un archivo que no existe: ' + m[1]);
  }
}

// 3. Campos que el JS busca por id y no están en el HTML
const html = leer(path.join(web, 'app.html')) + leer(path.join(web, 'index.html'));
const ids = new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
const buscados = new Set();
for (const f of fs.readdirSync(path.join(web, 'js'))) {
  const texto = leer(path.join(web, 'js', f));
  for (const m of texto.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) buscados.add(m[1] + '|' + f);
}
for (const f of fs.readdirSync(path.join(web, 'js'))) {
  const texto = leer(path.join(web, 'js', f));
  for (const m of texto.matchAll(/\.id\s*=\s*'([A-Za-z0-9_-]+)'/g)) ids.add(m[1]);
  for (const m of texto.matchAll(/\bid:\s*'([A-Za-z0-9_-]+)'/g)) ids.add(m[1]);
}
const dinamicos = new Set();
for (const f of fs.readdirSync(path.join(web, 'js'))) {
  const texto = leer(path.join(web, 'js', f));
  // Si el archivo crea ids desde una lista (i.id = f[0]), todos los literales
  // de ese archivo pueden ser ids de campo válidos.
  const desdeLista = /\.id\s*=\s*f\[/.test(texto);
  if (desdeLista) {
    for (const m of texto.matchAll(/'([A-Za-z0-9_-]{4,})'/g)) dinamicos.add(m[1]);
  }
}

const generados = new Set([
  // nodos que el JS crea en tiempo de ejecución
  'avisoActividad', 'hitosTexto', 'item_', 'novTituloAct', 'novTipoAct', 'novGravedadAct', 'novDescripcionAct',
  'descripcionReporte', 'condicionFinal', 'etapasNueva', 'etapasPlantilla', 'etapas', 'detalleGrafica',
  'migas', 'detalleNombre', 'detalleEstado', 'detalleKpis', 'detalleHijos', 'detalleProximos', 'detalleRecientes',
  'resumenImportante', 'cuentaNovedades', 'listaAlertasPublicas', 'pantallaAlertas', 'avisoPortal',
]);
for (const par of buscados) {
  const [id, archivo] = par.split('|');
  if (ids.has(id) || generados.has(id) || dinamicos.has(id) || /^(nov|item|etapa|detalle|reg|pla|tip|act|ele|emp|usu|ale|res)/i.test(id)) continue;
  problemas.push(archivo + ' busca #' + id + ' y no está en el HTML');
}

// 4. Versión de recursos coherente
const versiones = new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]));
if (versiones.size > 1) problemas.push('versiones de recursos mezcladas: ' + [...versiones].join(', '));
else ok.push('versión de recursos uniforme: ' + [...versiones][0]);

// 5. Sin estilos en línea ni emoji en el HTML servido
for (const archivo of ['app.html', 'index.html']) {
  const texto = leer(path.join(web, archivo));
  if (/style="/.test(texto)) problemas.push(archivo + ' tiene estilos en línea (la CSP los bloquea)');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(texto)) problemas.push(archivo + ' tiene emoji');
}

console.log('Comprobaciones correctas: ' + ok.length);
if (problemas.length) {
  console.log('\nPROBLEMAS (' + problemas.length + '):');
  problemas.forEach((p) => console.log('  · ' + p));
  process.exit(1);
}
console.log('Sin problemas de frontend.');
