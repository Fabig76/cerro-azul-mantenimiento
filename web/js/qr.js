/**
 * qr.js — codificador QR propio. Sin librerías y sin servicios externos: la CSP no
 * permite traerlas y mandar los ids del conjunto a un tercero no es opción.
 *
 * Modelo 2, modo byte (UTF-8), corrección M, versiones 1 a 10, las 8 máscaras.
 * API: QR.matriz(texto) → { version, tam, celdas: boolean[][] }
 *      QR.svg(texto, { modulo, margen }) → SVGElement
 */
(function () {
  'use strict';

  // Corrección M: [total de codewords, ec por bloque, bloques, datos por bloque, bloques2, datos2]
  const VERSIONES = {
    1: [26, 10, 1, 16, 0, 0],
    2: [44, 16, 1, 28, 0, 0],
    3: [70, 26, 1, 44, 0, 0],
    4: [100, 18, 2, 32, 0, 0],
    5: [134, 24, 2, 43, 0, 0],
    6: [172, 16, 4, 27, 0, 0],
    7: [196, 18, 4, 31, 0, 0],
    8: [242, 22, 2, 38, 2, 39],
    9: [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44],
  };

  const ALINEACION = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  // --- Galois GF(256), polinomio 0x11D ---
  const EXP = new Array(512);
  const LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function multiplicar(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /** Polinomio generador de Reed-Solomon para `grado` codewords de corrección. */
  function generador(grado) {
    let poli = [1];
    for (let i = 0; i < grado; i++) {
      const nuevo = new Array(poli.length + 1).fill(0);
      for (let j = 0; j < poli.length; j++) {
        nuevo[j] ^= poli[j];
        nuevo[j + 1] ^= multiplicar(poli[j], EXP[i]);
      }
      poli = nuevo;
    }
    return poli;
  }

  function correccion(datos, grado) {
    const gen = generador(grado);
    const resto = datos.concat(new Array(grado).fill(0));
    for (let i = 0; i < datos.length; i++) {
      const factor = resto[i];
      if (!factor) continue;
      for (let j = 0; j < gen.length; j++) resto[i + j] ^= multiplicar(gen[j], factor);
    }
    return resto.slice(datos.length);
  }

  // --- Bits ---
  function aBytes(texto) {
    const bytes = new TextEncoder().encode(String(texto));
    const salida = [];
    for (let i = 0; i < bytes.length; i++) salida.push(bytes[i]);
    return salida;
  }

  function elegirVersion(cantidad) {
    for (let v = 1; v <= 10; v++) {
      const [total, ec, b1, d1, b2, d2] = VERSIONES[v];
      const capacidad = b1 * d1 + b2 * d2;
      const bitsCabecera = 4 + (v <= 9 ? 8 : 16);
      if (bitsCabecera + cantidad * 8 <= capacidad * 8) return v;
    }
    return null;
  }

  /** Datos con cabecera, relleno y reparto en bloques, más su corrección. */
  function codewords(bytes, version) {
    const [total, ec, b1, d1, b2, d2] = VERSIONES[version];
    const capacidad = b1 * d1 + b2 * d2;

    const bits = [];
    const poner = function (valor, largo) {
      for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
    };
    poner(0b0100, 4);
    poner(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach(function (b) { poner(b, 8); });

    // Terminador y relleno hasta el límite de la versión
    const limite = capacidad * 8;
    for (let i = 0; i < 4 && bits.length < limite; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const datos = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      datos.push(byte);
    }
    const relleno = [0xEC, 0x11];
    let k = 0;
    while (datos.length < capacidad) {
      datos.push(relleno[k % 2]);
      k++;
    }

    // Bloques: primero los cortos, luego los largos
    const bloques = [];
    let pos = 0;
    for (let i = 0; i < b1; i++) { bloques.push(datos.slice(pos, pos + d1)); pos += d1; }
    for (let i = 0; i < b2; i++) { bloques.push(datos.slice(pos, pos + d2)); pos += d2; }

    const ecs = bloques.map(function (b) { return correccion(b, ec); });

    // Entrelazado
    const salida = [];
    const maxDatos = Math.max.apply(null, bloques.map(function (b) { return b.length; }));
    for (let i = 0; i < maxDatos; i++) {
      bloques.forEach(function (b) { if (i < b.length) salida.push(b[i]); });
    }
    for (let i = 0; i < ec; i++) {
      ecs.forEach(function (b) { salida.push(b[i]); });
    }
    return salida;
  }

  // --- Matriz ---
  function base(version) {
    const tam = version * 4 + 17;
    const celdas = [];
    const reservado = [];
    for (let i = 0; i < tam; i++) {
      celdas.push(new Array(tam).fill(false));
      reservado.push(new Array(tam).fill(false));
    }

    const marcar = function (x, y, oscuro) {
      celdas[y][x] = !!oscuro;
      reservado[y][x] = true;
    };

    // Patrones de posición
    [[0, 0], [tam - 7, 0], [0, tam - 7]].forEach(function (esquina) {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const x = esquina[0] + dx;
          const y = esquina[1] + dy;
          if (x < 0 || y < 0 || x >= tam || y >= tam) continue;
          const dentro = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          const borde = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const centro = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          marcar(x, y, dentro && (borde || centro));
        }
      }
    });

    // Sincronización
    for (let i = 8; i < tam - 8; i++) {
      marcar(i, 6, i % 2 === 0);
      marcar(6, i, i % 2 === 0);
    }

    // Alineación
    const posiciones = ALINEACION[version];
    posiciones.forEach(function (ax) {
      posiciones.forEach(function (ay) {
        if ((ax === 6 && ay === 6) || (ax === 6 && ay === tam - 7) || (ax === tam - 7 && ay === 6)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            marcar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      });
    });

    // Reservas de formato y versión
    for (let i = 0; i < 9; i++) {
      if (!reservado[8][i]) reservado[8][i] = true;
      if (!reservado[i][8]) reservado[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
      reservado[8][tam - 1 - i] = true;
      reservado[tam - 1 - i][8] = true;
    }
    reservado[tam - 8][8] = true;
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          reservado[tam - 11 + j][i] = true;
          reservado[i][tam - 11 + j] = true;
        }
      }
    }

    return { tam: tam, celdas: celdas, reservado: reservado, marcar: marcar };
  }

  function colocarDatos(m, codigos) {
    const tam = m.tam;
    let bit = 0;
    let subiendo = true;
    for (let columna = tam - 1; columna > 0; columna -= 2) {
      if (columna === 6) columna--;
      for (let i = 0; i < tam; i++) {
        const fila = subiendo ? tam - 1 - i : i;
        for (let j = 0; j < 2; j++) {
          const x = columna - j;
          if (m.reservado[fila][x]) continue;
          let valor = false;
          if (bit < codigos.length * 8) {
            valor = ((codigos[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
            bit++;
          }
          m.celdas[fila][x] = valor;
        }
      }
      subiendo = !subiendo;
    }
  }

  const MASCARAS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; },
    function (x, y) { return ((x * y) % 2) + ((x * y) % 3) === 0; },
    function (x, y) { return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; },
    function (x, y) { return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; },
  ];

  function aplicarMascara(m, indice) {
    const fn = MASCARAS[indice];
    for (let y = 0; y < m.tam; y++) {
      for (let x = 0; x < m.tam; x++) {
        if (m.reservado[y][x]) continue;
        if (fn(x, y)) m.celdas[y][x] = !m.celdas[y][x];
      }
    }
  }

  /** Formato: 5 bits + BCH(15,5) con máscara 0x5412. */
  function formato(mascara) {
    let datos = (0b00 << 3) | mascara;   // 00 = corrección M
    let resto = datos << 10;
    for (let i = 4; i >= 0; i--) {
      if ((resto >>> (i + 10)) & 1) resto ^= 0x537 << i;
    }
    return ((datos << 10) | resto) ^ 0x5412;
  }

  function escribirFormato(m, mascara) {
    const bits = formato(mascara);
    const tam = m.tam;
    const bit = function (i) { return ((bits >>> i) & 1) === 1; };

    for (let i = 0; i < 15; i++) {
      const valor = bit(i);
      // Columna izquierda y fila superior
      if (i < 6) m.marcar(8, i, valor);
      else if (i === 6) m.marcar(8, 7, valor);
      else if (i === 7) m.marcar(8, 8, valor);
      else if (i === 8) m.marcar(7, 8, valor);
      else m.marcar(14 - i, 8, valor);
    }
    for (let i = 0; i < 15; i++) {
      const valor = bit(i);
      if (i < 8) m.marcar(tam - 1 - i, 8, valor);
      else m.marcar(8, tam - 15 + i, valor);
    }
    m.marcar(tam - 8, 8, true);   // módulo oscuro fijo
  }

  function escribirVersion(m, version) {
    if (version < 7) return;
    let resto = version << 12;
    for (let i = 5; i >= 0; i--) {
      if ((resto >>> (i + 12)) & 1) resto ^= 0x1F25 << i;
    }
    const bits = (version << 12) | resto;
    const tam = m.tam;
    for (let i = 0; i < 18; i++) {
      const valor = ((bits >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = i % 3;
      m.marcar(tam - 11 + b, a, valor);
      m.marcar(a, tam - 11 + b, valor);
    }
  }

  /** Penalización de la norma: se elige la máscara que menos penaliza. */
  function penalizacion(celdas, tam) {
    let total = 0;

    const linea = function (obtener) {
      let puntos = 0;
      for (let i = 0; i < tam; i++) {
        let corrida = 1;
        for (let j = 1; j < tam; j++) {
          if (obtener(i, j) === obtener(i, j - 1)) corrida++;
          else {
            if (corrida >= 5) puntos += 3 + (corrida - 5);
            corrida = 1;
          }
        }
        if (corrida >= 5) puntos += 3 + (corrida - 5);
      }
      return puntos;
    };
    total += linea(function (i, j) { return celdas[i][j]; });
    total += linea(function (i, j) { return celdas[j][i]; });

    // Bloques 2x2
    for (let y = 0; y < tam - 1; y++) {
      for (let x = 0; x < tam - 1; x++) {
        const v = celdas[y][x];
        if (v === celdas[y][x + 1] && v === celdas[y + 1][x] && v === celdas[y + 1][x + 1]) total += 3;
      }
    }

    // Patrón 1:1:3:1:1 con cuatro claros
    const patron = [true, false, true, true, true, false, true];
    const buscar = function (obtener) {
      let puntos = 0;
      for (let i = 0; i < tam; i++) {
        for (let j = 0; j <= tam - 7; j++) {
          let coincide = true;
          for (let k = 0; k < 7; k++) {
            if (obtener(i, j + k) !== patron[k]) { coincide = false; break; }
          }
          if (!coincide) continue;
          const antes = j >= 4 && [1, 2, 3, 4].every(function (d) { return !obtener(i, j - d); });
          const despues = j + 11 <= tam && [7, 8, 9, 10].every(function (d) { return !obtener(i, j + d); });
          if (antes || despues) puntos += 40;
        }
      }
      return puntos;
    };
    total += buscar(function (i, j) { return celdas[i][j]; });
    total += buscar(function (i, j) { return celdas[j][i]; });

    // Proporción de oscuros
    let oscuros = 0;
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (celdas[y][x]) oscuros++;
    const porcentaje = (oscuros * 100) / (tam * tam);
    total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

    return total;
  }

  function matriz(texto) {
    const bytes = aBytes(String(texto));
    const version = elegirVersion(bytes.length);
    if (!version) return null;

    const codigos = codewords(bytes, version);
    let mejor = null;
    let mejorPuntos = Infinity;

    for (let mascara = 0; mascara < 8; mascara++) {
      const m = base(version);
      colocarDatos(m, codigos);
      aplicarMascara(m, mascara);
      escribirFormato(m, mascara);
      escribirVersion(m, version);
      const puntos = penalizacion(m.celdas, m.tam);
      if (puntos < mejorPuntos) {
        mejorPuntos = puntos;
        mejor = m;
      }
    }
    return { version: version, tam: mejor.tam, celdas: mejor.celdas };
  }

  function svg(texto, opciones) {
    const op = opciones || {};
    const modulo = op.modulo || 4;
    const margen = op.margen === undefined ? 4 : op.margen;
    const m = matriz(texto);
    if (!m) return null;

    const NS = 'http://www.w3.org/2000/svg';
    const lado = (m.tam + margen * 2) * modulo;
    const raiz = document.createElementNS(NS, 'svg');
    raiz.setAttribute('xmlns', NS);
    raiz.setAttribute('viewBox', '0 0 ' + lado + ' ' + lado);
    raiz.setAttribute('width', lado);
    raiz.setAttribute('height', lado);

    const fondo = document.createElementNS(NS, 'rect');
    fondo.setAttribute('width', lado);
    fondo.setAttribute('height', lado);
    fondo.setAttribute('fill', '#ffffff');
    raiz.appendChild(fondo);

    let d = '';
    for (let y = 0; y < m.tam; y++) {
      for (let x = 0; x < m.tam; x++) {
        if (!m.celdas[y][x]) continue;
        d += 'M' + ((x + margen) * modulo) + ' ' + ((y + margen) * modulo) +
          'h' + modulo + 'v' + modulo + 'h-' + modulo + 'z';
      }
    }
    const camino = document.createElementNS(NS, 'path');
    camino.setAttribute('d', d);
    camino.setAttribute('fill', '#000000');
    raiz.appendChild(camino);
    return raiz;
  }

  window.QR = { matriz: matriz, svg: svg };
})();
