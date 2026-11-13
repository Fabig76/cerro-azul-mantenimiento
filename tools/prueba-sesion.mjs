/**
 * prueba-sesion.mjs — la sesión en el celular propio.
 * Comprueba el almacenamiento del cliente y la duración que pide al servidor.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url).pathname;
const fuente = fs.readFileSync(path.join(raiz, 'web', 'js', 'sesion.js'), 'utf8');

const resultados = [];
function comprobar(bien, texto) {
  resultados.push((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) process.exitCode = 1;
}

function montar() {
  const almacen = {
    sessionStorage: (() => { const m = {}; return {
      getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
      removeItem: (k) => { delete m[k]; } }; })(),
    localStorage: (() => { const m = {}; return {
      getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
      removeItem: (k) => { delete m[k]; } }; })(),
  };
  const sandbox = { window: {}, sessionStorage: almacen.sessionStorage, localStorage: almacen.localStorage };
  vm.createContext(sandbox);
  vm.runInContext(fuente, sandbox);
  return { Sesion: sandbox.window.Sesion, almacen };
}

// Sesión normal: solo en la pestaña
{
  const { Sesion, almacen } = montar();
  Sesion.guardar({ token: 'T1', usuario: { rol: 'CONTRATISTA' } }, false);
  comprobar(Sesion.token() === 'T1', 'la sesión normal guarda el token');
  comprobar(almacen.localStorage.getItem('ca_sesion') === null,
    'sin marcar la casilla, nada queda en el almacenamiento permanente');
}

// Sesión larga: sobrevive al cierre de la pestaña
{
  const { Sesion, almacen } = montar();
  Sesion.guardar({ token: 'T2', usuario: { rol: 'CONTRATISTA' } }, true);
  comprobar(almacen.localStorage.getItem('ca_sesion') !== null,
    'con la casilla marcada, el token queda en el almacenamiento permanente');
  almacen.sessionStorage.removeItem('ca_sesion');   // se cierra la pestaña
  comprobar(Sesion.token() === 'T2', 'al cerrar la pestaña la sesión sigue viva');
}

// Cerrar sesión borra todo
{
  const { Sesion, almacen } = montar();
  Sesion.guardar({ token: 'T3' }, true);
  Sesion.limpiar();
  comprobar(Sesion.token() === null && almacen.localStorage.getItem('ca_sesion') === null,
    '«Cerrar sesión» borra también la sesión larga');
}

// El servidor usa la duración larga solo cuando se pide
{
  const auth = fs.readFileSync(path.join(raiz, 'apps-script', 'Auth.gs'), 'utf8');
  comprobar(/propio\s*\?\s*configNumero\('sesion_horas_propio', 168\)/.test(auth),
    'el servidor usa sesion_horas_propio cuando se pide');
  comprobar(/:\s*configNumero\('sesion_horas', 12\)/.test(auth),
    'y sesion_horas normales cuando no');
  const seed = fs.readFileSync(path.join(raiz, 'apps-script', 'Seed.gs'), 'utf8');
  comprobar(seed.includes('sesion_horas_propio'), 'la configuración nueva está en la semilla');
}

console.log(resultados.join('\n'));
console.log('\n' + (process.exitCode ? 'HAY FALLAS' : 'Todo correcto: ' + resultados.length + ' comprobaciones'));
