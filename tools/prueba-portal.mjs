/**
 * prueba-portal.mjs — el portal público en el celular: lo primero es el estado.
 * Mide con el navegador a 390 px de ancho.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function dump(ancho, alto) {
  return execFileSync(CHROME, ['--headless=new', '--disable-gpu',
    '--window-size=' + ancho + ',' + alto, '--virtual-time-budget=5000',
    '--host-resolver-rules=MAP * 127.0.0.1:1',
    '--dump-dom', 'file://' + path.join(raiz, 'web', 'index.html')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 45000 });
}

const resultados = [];
function comprobar(bien, texto) {
  resultados.push((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) process.exitCode = 1;
}

const movil = dump(500, 900);
const iCifras = movil.indexOf('id="cifrasFinal"');
const iStatsDentroDelFinal = movil.indexOf('class="stats"', iCifras);
comprobar(iCifras > 0 && iStatsDentroDelFinal > iCifras,
  'en el celular las cuatro cifras fijas quedan al final de la página');

const iEstado = movil.indexOf('id="estado"');
comprobar(iEstado > 0 && iEstado < movil.indexOf('class="stats"'),
  'el estado del conjunto aparece antes que las cifras');

// La presentación no debe ocupar la primera pantalla
comprobar(movil.indexOf('Cada trabajo queda con su foto') < iEstado,
  'el párrafo largo de presentación sigue existiendo (solo se oculta por CSS)');

// «Mi torre»: el selector existe y las listas se filtran con la elección guardada
{
  const pagina = fs.readFileSync(path.join(raiz, 'web', 'index.html'), 'utf8');
  comprobar(pagina.indexOf('id="miTorre"') > 0 && pagina.indexOf('id="selTorre"') > 0,
    'el portal tiene el selector «Mi torre»');

  const js = fs.readFileSync(path.join(raiz, 'web', 'js', 'publico.js'), 'utf8');
  comprobar(js.indexOf('ca_torre') > 0, 'la elección se guarda en el dispositivo');
  comprobar(/pintarProximos[\s\S]{0,400}pasaFiltro/.test(js), 'los próximos mantenimientos se filtran');
  comprobar(/recientes = \(snap\.recientes \|\| \[\]\)\.filter\(pasaFiltro\)/.test(js),
    'lo último que se hizo se filtra');
  comprobar(/novedades = \(snap\.novedades \|\| \[\]\)\.filter\(pasaFiltro\)/.test(js),
    'las novedades se filtran');
  comprobar(/return !id \|\| id === filtroSeccion/.test(js),
    'lo que no tiene sección (áreas comunes) siempre se muestra');
}

// «Qué me afecta esta semana»
{
  const pagina = fs.readFileSync(path.join(raiz, 'web', 'index.html'), 'utf8');
  comprobar(pagina.indexOf('id="afectaSemana"') > 0 && pagina.indexOf('id="listaAfecta"') > 0,
    'el portal tiene la tarjeta «Qué me afecta»');

  const js = fs.readFileSync(path.join(raiz, 'web', 'js', 'publico.js'), 'utf8');
  comprobar(/function pintarAfecta/.test(js), 'la tarjeta se pinta desde el snapshot');
  comprobar(/if \(!p\.afecta_uso\) return false/.test(js), 'solo cuenta lo que afecta el uso');
  comprobar(/7 \* 86400000/.test(js), 'solo mira los próximos siete días');
  comprobar(js.indexOf('ningún trabajo afecta el uso') > 0, 'dice algo cuando no hay nada');
}

// 4.4 · Explicar los números
{
  const js = fs.readFileSync(path.join(raiz, 'web', 'js', 'publico.js'), 'utf8');
  comprobar(/function cuandoEnPalabras/.test(js), 'la fecha se convierte a palabras');
  comprobar(js.indexOf("'hoy a las '") > 0, 'dice «hoy a las …» cuando es del día');
  comprobar(js.indexOf('¿Qué significa?') > 0, 'la salud general ofrece «¿Qué significa?»');
  comprobar(js.indexOf('Verde: todo al día') > 0 && js.indexOf('Rojo:') > 0,
    'explica qué significan verde, naranja y rojo');
  comprobar(js.indexOf('cada noche') > 0, 'dice cada cuánto se recalcula');
  comprobar(js.indexOf('trabajos del mes terminados y aprobados') > 0,
    'el conteo del mes se lee en palabras');
  comprobar(js.indexOf("'Aprobadas de programadas'") < 0, 'ya no queda el texto técnico anterior');
}

const css = fs.readFileSync(path.join(raiz, 'web', 'css', 'home.css'), 'utf8');
comprobar(/@media \(max-width: 767px\)[\s\S]*?\.hero \.lead, \.hero \.chips \{ display: none; \}/.test(css),
  'en el celular se ocultan la presentación larga y los chips');
comprobar(/\.hero h1 \.grad::before \{ content: " "; \}/.test(css),
  'el título conserva el espacio al quitar el salto de línea');

console.log(resultados.join('\n'));
console.log('\n' + (process.exitCode ? 'HAY FALLAS' : 'Todo correcto: ' + resultados.length + ' comprobaciones'));
