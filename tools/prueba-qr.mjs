/**
 * prueba-qr.mjs — el codificador propio se comprueba con un decodificador de verdad.
 *
 * El decodificador (jsQR) se usa SOLO aquí, nunca en web/: si el QR no se lee, no
 * sirve de nada que el dibujo se vea bonito.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import jsQR from 'jsqr';

const raiz = new URL('..', import.meta.url).pathname;
const fuente = fs.readFileSync(path.join(raiz, 'web', 'js', 'qr.js'), 'utf8');

const sandbox = { window: {}, TextEncoder };
vm.createContext(sandbox);
vm.runInContext(fuente, sandbox);
const QR = sandbox.window.QR;

/** Convierte la matriz en la imagen RGBA que espera el decodificador. */
function aImagen(m, escala, margen) {
  const lado = (m.tam + margen * 2) * escala;
  const datos = new Uint8ClampedArray(lado * lado * 4).fill(255);
  for (let y = 0; y < m.tam; y++) {
    for (let x = 0; x < m.tam; x++) {
      if (!m.celdas[y][x]) continue;
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const px = ((y + margen) * escala + dy) * lado + ((x + margen) * escala + dx);
          datos[px * 4] = 0;
          datos[px * 4 + 1] = 0;
          datos[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { datos, lado };
}

const textos = [
  'https://fabig76.github.io/cerro-azul-mantenimiento/index.html#/equipo/NOD_01M69S4WSRFF84816708FC4009',
  'https://fabig76.github.io/cerro-azul-mantenimiento/index.html#/equipo/NOD_01M6AEWA38F6415A01FA8C4F99',
  'https://fabig76.github.io/cerro-azul-mantenimiento/index.html#/equipo/NOD_01M69S4WSS52A7D4AFE5A54276',
  'CA-AC · Áreas comunes · Cerro Azul',
  'https://fabig76.github.io/cerro-azul-mantenimiento/index.html#/equipo/X',
  'Cerro Azul · Mantenimiento · 4009',
  'texto corto',
  'Ñandú, cigüeña y años después: acentuación',
];

const resultados = [];
function comprobar(bien, texto) {
  resultados.push((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) process.exitCode = 1;
}

for (const texto of textos) {
  const m = QR.matriz(texto);
  if (!m) {
    comprobar(false, 'no se pudo codificar: ' + texto.slice(0, 40));
    continue;
  }
  const { datos, lado } = aImagen(m, 4, 4);
  const leido = jsQR(datos, lado, lado);
  const igual = leido && leido.data === texto;
  comprobar(igual, 'v' + m.version + ' · ' + (texto.length > 46 ? texto.slice(0, 44) + '…' : texto));
  if (!igual) {
    console.log('   esperado: ' + JSON.stringify(texto));
    console.log('   leído  : ' + JSON.stringify(leido ? leido.data : null));
  }
}

// Los tamaños deben crecer con el contenido
const versiones = textos.map((t) => (QR.matriz(t) || {}).version);
comprobar(versiones.every((v) => v >= 1 && v <= 10), 'todas las versiones caben entre 1 y 10');
comprobar(new Set(versiones).size >= 3, 'usa varias versiones según el largo (' + versiones.join(', ') + ')');

// Un texto enorme no cabe: devuelve null en vez de romper
comprobar(QR.matriz('x'.repeat(400)) === null, 'un texto que no cabe devuelve null');

console.log(resultados.join('\n'));
console.log('\n' + (process.exitCode ? 'HAY FALLAS' : 'Todo correcto: ' + resultados.length + ' comprobaciones'));
