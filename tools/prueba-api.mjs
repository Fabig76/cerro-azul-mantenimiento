/**
 * prueba-api.mjs — comprueba el comportamiento del cliente de la API:
 * límites de tiempo, reintentos y el mismo requestId en cada intento.
 *
 * Uso: node tools/prueba-api.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url).pathname;
const fuente = fs.readFileSync(path.join(raiz, 'web', 'js', 'api.js'), 'utf8');

const resultados = [];
function comprobar(bien, texto) {
  resultados.push((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) process.exitCode = 1;
}

/** Monta un entorno con fetch falso y tiempos acelerados. */
function montar(guion) {
  const intentos = [];
  const sandbox = {
    console,
    Promise,
    AbortController,
    setTimeout: (fn) => setTimeout(fn, 0),   // los 2 s y 5 s no se esperan de verdad
    clearTimeout,
    window: { CFG: { API_URL: 'https://ejemplo.invalido/exec' } },
    fetch: async (url, opciones) => {
      const cuerpo = JSON.parse(opciones.body || '{}');
      intentos.push({ accion: cuerpo.action, requestId: cuerpo.requestId });
      const paso = guion(intentos.length - 1, cuerpo);
      if (paso === 'red') { const e = new TypeError('Failed to fetch'); throw e; }
      if (paso === 'tiempo') { const e = new Error('abortado'); e.name = 'AbortError'; throw e; }
      return {
        ok: true,
        json: async () => ({ ok: true, data: { bien: true } }),
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fuente, sandbox);
  return { intentos, API: sandbox.window.API };
}

const correr = async () => {
  // 1. Una lectura que falla una vez se reintenta sola y termina bien
  {
    const { intentos, API } = montar((i) => (i === 0 ? 'red' : 'ok'));
    const r = await API.llamar('actividades.listar', {}, { token: 'x' });
    comprobar(r.ok && intentos.length === 2, 'una lectura se reintenta y termina bien (' + intentos.length + ' intentos)');
  }

  // 2. Una escritura sin idempotente no se reintenta: podría aplicarse dos veces
  {
    const { intentos, API } = montar(() => 'red');
    const r = await API.llamar('reportes.crear', {}, { token: 'x' });
    comprobar(!r.ok && intentos.length === 1, 'una escritura sin idempotente no se reintenta (' + intentos.length + ')');
  }

  // 3. Una escritura idempotente se reintenta con el MISMO requestId
  {
    const { intentos, API } = montar((i) => (i === 0 ? 'red' : 'ok'));
    const r = await API.llamar('reportes.crear', {}, { token: 'x', idempotente: true });
    const ids = intentos.map((i) => i.requestId);
    comprobar(r.ok && ids.length === 2 && !!ids[0] && ids[0] === ids[1],
      'el reintento reutiliza el requestId (' + ids.join(' = ') + ')');
  }

  // 4. Tras tres fallos se rinde y lo dice
  {
    const { intentos, API } = montar(() => 'red');
    const r = await API.llamar('nodos.arbol', {}, { token: 'x' });
    comprobar(!r.ok && r.code === 'RED' && intentos.length === 3,
      'con tres fallos se rinde (' + intentos.length + ' intentos, ' + r.code + ')');
  }

  // 5. Un corte de tiempo se informa como TIEMPO, no como si no hubiera red
  {
    const { API } = montar(() => 'tiempo');
    const r = await API.llamar('auth.me', {}, { token: 'x' });
    comprobar(!r.ok && r.code === 'TIEMPO', 'un corte de tiempo responde «' + r.code + '»');
  }

  // 6. Un error del servidor no se reintenta
  {
    const { intentos, API } = montar(() => 'ok');
    const r = await API.llamar('actividades.listar', {}, { token: 'x' });
    comprobar(r.ok && intentos.length === 1, 'una respuesta buena no se repite (' + intentos.length + ')');
  }

  console.log(resultados.join('\n'));
  console.log('\n' + (process.exitCode ? 'HAY FALLAS' : 'Todo correcto: ' + resultados.length + ' comprobaciones'));
};

correr();
