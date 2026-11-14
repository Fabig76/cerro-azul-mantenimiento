/**
 * recorrido.mjs — el recorrido completo de un contratista contra el servidor real.
 *
 * Usa la sesión de tools/walk/.sesion.json, sube una foto de verdad y una cotización
 * de verdad, y va contando lo que pasa. No inventa nada: si algo falla, lo dice.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const dir = new URL('.', import.meta.url).pathname;
const sesion = JSON.parse(fs.readFileSync(path.join(dir, '.sesion.json'), 'utf8'));
const TOKEN = sesion.token;

let paso = 0;
const resultados = [];
function ok(bien, texto) {
  paso++;
  resultados.push((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) process.exitCode = 1;
}

async function llamar(accion, payload, opciones) {
  const op = opciones || {};
  const cuerpo = { action: accion, payload: payload || {} };
  if (!op.publica) cuerpo.token = TOKEN;
  if (op.id) cuerpo.requestId = op.id;
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo),
    redirect: 'follow',
  });
  return r.json();
}

/** Un PDF mínimo pero válido de verdad (empieza con %PDF- y termina con %%EOF). */
function pdfDemo() {
  const texto = 'BT /F1 14 Tf 40 700 Td (Cotizacion de prueba - Cerro Azul) Tj ET';
  const objetos = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj',
    '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    '5 0 obj<</Length ' + texto.length + '>>stream\n' + texto + '\nendstream endobj',
  ];
  let salida = '%PDF-1.4\n';
  const posiciones = [0];
  objetos.forEach(function (o) {
    posiciones.push(salida.length);
    salida += o + '\n';
  });
  const inicioXref = salida.length;
  salida += 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objetos.length; i++) {
    salida += String(posiciones[i]).padStart(10, '0') + ' 00000 n \n';
  }
  salida += 'trailer<</Size ' + (objetos.length + 1) + '/Root 1 0 R>>\nstartxref\n' + inicioXref + '\n%%EOF\n';
  return Buffer.from(salida, 'utf8');
}

console.log('Recorrido del contratista contra el servidor real\n');

// 1 · Quién soy
const yo = await llamar('auth.me', {});
ok(yo.ok && yo.data.usuario, 'la sesión responde con un usuario');
const usuario = (yo.data && yo.data.usuario) || {};
console.log('   ' + usuario.email + ' · ' + usuario.rol + '\n');
ok(usuario.rol === 'CONTRATISTA', 'es contratista');

// 2 · Qué ve
const lista = await llamar('actividades.listar', {});
ok(lista.ok, 'puede listar actividades');
const abiertas = (lista.data && lista.data.actividades) || [];
console.log('   ve ' + abiertas.length + ' trabajo(s): ' + abiertas.map(function (a) { return a.titulo; }).join(' / ') + '\n');
ok(abiertas.length >= 1, 'le llega al menos un trabajo');

const suya = abiertas[0];
const detalle = await llamar('actividades.get', { id: suya.id });
ok(detalle.ok, 'puede abrir su trabajo');
const d = detalle.data || {};
const hitos = d.hitos || [];
console.log('   etapas: ' + hitos.map(function (h) { return h.orden + '. ' + h.nombre + ' (' + h.estado + ')'; }).join(' · ') + '\n');

// 3 · Foto real
const foto = fs.readFileSync(path.join(dir, 'foto.jpg'));
const base64 = foto.toString('base64');
console.log('   foto de ' + Math.round(foto.length / 1024) + ' KB\n');

// 4 · Reportar una etapa con foto
const pendiente = hitos.filter(function (h) { return h.estado === 'PENDIENTE' || h.estado === 'RECHAZADO'; })[0];
if (pendiente) {
  const rep = await llamar('reportes.crear', {
    actividad_id: suya.id, tipo: 'AVANCE', hito_id: pendiente.id,
    pct_declarado: pendiente.peso,
    descripcion: 'Recorrido de prueba: ' + pendiente.nombre,
  }, { id: 'walk-avance-' + Date.now() });
  ok(rep.ok, 'reporta la etapa «' + pendiente.nombre + '»');
  if (!rep.ok) console.log('   → ' + rep.code + ': ' + rep.message);

  if (rep.ok) {
    const ev = await llamar('evidencias.upload', {
      actividad_id: suya.id,
      reporte_id: rep.data.reporte_id,
      momento: 'DURANTE',
      base64: base64,
      mime: 'image/jpeg',
    }, { id: 'walk-foto-' + Date.now() });
    ok(ev.ok, 'sube la foto de esa etapa (' + Math.round(foto.length / 1024) + ' KB)');
    if (!ev.ok) console.log('   → ' + ev.code + ': ' + ev.message);
    else console.log('   evidencia ' + ev.data.evidencia_id + (ev.data.ya_estaba ? ' (ya estaba)' : '') + '\n');
  }
} else {
  console.log('   (no hay etapas pendientes que reportar)\n');
}

// 5 · Proponer con cotización
const prop = await llamar('propuestas.crear', {
  nodo_id: suya.nodo_id,
  titulo: 'Recorrido de prueba con cotización',
  hallazgo: 'Prueba de punta a punta del portal con el contratista de pruebas',
  alcance: 'Verificar que la propuesta guarda el valor y la cotización en PDF',
  fecha_inicio_sugerida: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
  fecha_fin_sugerida: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
  prioridad_sugerida: 'MEDIA',
  valor_cotizado: 1250000,
  cotizacion_vigente_hasta: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
}, { id: 'walk-prop-' + Date.now() });
ok(prop.ok, 'crea una propuesta con valor de $ 1.250.000');
if (!prop.ok) console.log('   → ' + prop.code + ': ' + prop.message);
else {
  const pid = prop.data.propuesta.id;
  ok(Number(prop.data.propuesta.valor_cotizado) === 1250000, 'la propuesta devuelve el valor cotizado');

  const pdf = pdfDemo();
  const cot = await llamar('propuestas.cotizacion.subir', {
    propuesta_id: pid,
    base64: pdf.toString('base64'),
    nombre: 'cotizacion-prueba.pdf',
    valor_cotizado: 1250000,
  }, { id: 'walk-pdf-' + Date.now() });
  ok(cot.ok, 'sube la cotización en PDF (' + Math.round(pdf.length / 1024) + ' KB)');
  if (!cot.ok) console.log('   → ' + cot.code + ': ' + cot.message);

  if (cot.ok) {
    const vuelta = await llamar('propuestas.cotizacion.get', { propuesta_id: pid });
    ok(vuelta.ok && vuelta.data.base64, 'la cotización se puede volver a leer');
  }
}

console.log('\n' + resultados.join('\n'));
console.log('\n' + (process.exitCode ? 'HAY FALLAS' : 'Recorrido completo: ' + resultados.length + ' pasos en verde'));
