/**
 * prueba-datos.mjs — comprueba que las listas compartidas se piden una sola vez
 * y que una escritura las invalida.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url).pathname;
const fuente = fs.readFileSync(path.join(raiz, 'web', 'js', 'datos.js'), 'utf8');

const resultados = [];
function comprobar(bien, texto) {
  resultados.push((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) process.exitCode = 1;
}

function montar(respuesta) {
  const llamadas = [];
  const sandbox = {
    window: {},
    API: {
      llamar: async (accion) => {
        llamadas.push(accion);
        return typeof respuesta === 'function' ? respuesta(accion) : { ok: true, data: {} };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fuente, sandbox);
  return { llamadas, Datos: sandbox.window.Datos };
}

const correr = async () => {
  // Cinco módulos piden el árbol a la vez: una sola llamada
  {
    const { llamadas, Datos } = montar();
    await Promise.all([Datos.obtener('nodos.arbol', 't'), Datos.obtener('nodos.arbol', 't'),
      Datos.obtener('nodos.arbol', 't'), Datos.obtener('nodos.arbol', 't'), Datos.obtener('nodos.arbol', 't')]);
    comprobar(llamadas.length === 1, 'cinco pedidos del árbol hacen una sola llamada (' + llamadas.length + ')');
  }

  // Después de la primera, las siguientes tampoco van al servidor
  {
    const { llamadas, Datos } = montar();
    await Datos.obtener('empresas.listar', 't');
    await Datos.obtener('empresas.listar', 't');
    comprobar(llamadas.length === 1, 'la segunda consulta usa la respuesta guardada');
  }

  // Invalidar obliga a preguntar de nuevo
  {
    const { llamadas, Datos } = montar();
    await Datos.obtener('usuarios.listar', 't');
    Datos.invalidar('usuarios.listar');
    await Datos.obtener('usuarios.listar', 't');
    comprobar(llamadas.length === 2, 'invalidar hace que se vuelva a preguntar');
  }

  // Un fallo no se guarda: el siguiente intento reintenta
  {
    let primera = true;
    const { llamadas, Datos } = montar(() => {
      if (primera) { primera = false; return { ok: false, code: 'RED' }; }
      return { ok: true, data: {} };
    });
    await Datos.obtener('tipos.listar', 't');
    await Datos.obtener('tipos.listar', 't');
    comprobar(llamadas.length === 2, 'un fallo no queda guardado como respuesta');
  }

  // Lo que no es lista compartida pasa derecho
  {
    const { llamadas, Datos } = montar();
    await Datos.obtener('actividades.listar', 't');
    await Datos.obtener('actividades.listar', 't');
    comprobar(llamadas.length === 2, 'las demás acciones no se guardan');
  }

  console.log(resultados.join('\n'));
  console.log('\n' + (process.exitCode ? 'HAY FALLAS' : 'Todo correcto: ' + resultados.length + ' comprobaciones'));
};

correr();
