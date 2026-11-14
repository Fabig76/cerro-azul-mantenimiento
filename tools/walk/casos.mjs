/**
 * casos.mjs — carga un juego de actividades con el contratista de pruebas,
 * una por cada caso, para verificar el portal de punta a punta.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const TOKEN = process.argv[2];
const EMPRESA = 'EMP_01M6AKKYDBF65E92F17CDA4FA6';
const RESPONSABLE = 'USU_01M6A1ZD14C85B38D3AD984346';
let NODO = 'NOD_01M69S4WSSC87B9F93C0C247F8';   // CA-AC-CAM, su única sección

async function q(accion, payload, id) {
  const c = { action: accion, payload: payload || {}, token: TOKEN };
  if (id) c.requestId = id;
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(c), redirect: 'follow' });
  return r.json();
}

const hoy = () => new Date().toISOString().slice(0, 10);
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

/** Foto única: se re-codifica distinto cada vez para que no la rechace el anti-duplicados. */
let n = 0;
function foto(calidad) {
  n++;
  const salida = '/tmp/caso-' + n + '.jpg';
  execFileSync('sips', ['-Z', String(1200 + n), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(calidad),
    'tools/walk/foto-antes.jpg', '--out', salida], { stdio: 'ignore' });
  const grande = fs.readFileSync(salida).toString('base64');
  const mini = '/tmp/caso-mini-' + n + '.jpg';
  execFileSync('sips', ['-Z', '640', '-s', 'format', 'jpeg', '-s', 'formatOptions', '50', salida, '--out', mini], { stdio: 'ignore' });
  return { grande, mini: fs.readFileSync(mini).toString('base64') };
}

async function crear(titulo, inicio, fin, extra) {
  const r = await q('actividades.crear', Object.assign({
    nodo_id: NODO, titulo, descripcion: 'Actividad del contratista de pruebas.',
    fecha_inicio_plan: inicio, fecha_fin_plan: fin, prioridad: 'MEDIA',
    empresa_id: EMPRESA, responsable_id: RESPONSABLE, publicable: true,
  }, extra || {}), 'caso-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  if (!r.ok) throw new Error(titulo + ' → ' + r.code + ' ' + r.message);
  return r.data.actividad.id;
}

const resumen = [];

// 1 · Para hoy, programada
const a1 = await crear('Prueba · limpieza de cámaras (hoy)', dia(0), dia(0), { prioridad: 'ALTA' });
resumen.push(['PROGRAMADA hoy', a1]);

// 2 · Atrasada
const a2 = await crear('Prueba · ajuste de foco (vencida)', dia(-4), dia(-2), { prioridad: 'MEDIA' });
resumen.push(['PROGRAMADA atrasada', a2]);

// 3 · Esta semana
const a3 = await crear('Prueba · revisión de grabaciones', dia(3), dia(4), { prioridad: 'BAJA' });
resumen.push(['PROGRAMADA esta semana', a3]);

// 4 · En ejecución con etapas
const a4 = await crear('Prueba · cambio de disco del DVR', dia(-1), dia(2), { prioridad: 'ALTA' });
await q('hitos.guardar', { actividad_id: a4, hitos: [
  { nombre: 'Revisar discos', peso: 1, fecha_plan: dia(-1) },
  { nombre: 'Cambiar disco', peso: 2, fecha_plan: dia(0) },
  { nombre: 'Probar grabación', peso: 1, fecha_plan: dia(1) },
] });
const f4 = foto(72);
const e4 = await q('evidencias.upload', { actividad_id: a4, momento: 'ANTES', base64: f4.grande, base64_mini: f4.mini, mime: 'image/jpeg' });
await q('actividades.iniciar', { id: a4, evidencia_ids: [e4.data.evidencia_id] });
resumen.push(['EN_EJECUCION con 3 etapas', a4]);

// 5 · Devuelta (rechazada)
const a5 = await crear('Prueba · revisión de UPS', dia(-3), dia(-3), { prioridad: 'MEDIA' });
const f5 = foto(74);
const e5 = await q('evidencias.upload', { actividad_id: a5, momento: 'ANTES', base64: f5.grande, base64_mini: f5.mini, mime: 'image/jpeg' });
await q('actividades.iniciar', { id: a5, evidencia_ids: [e5.data.evidencia_id] });
const f5b = foto(76);
await q('evidencias.upload', { actividad_id: a5, momento: 'DESPUES', base64: f5b.grande, base64_mini: f5b.mini, mime: 'image/jpeg' });
const r5 = await q('reportes.crear', { actividad_id: a5, tipo: 'FINAL', respuestas: [], descripcion: 'Se revisó la UPS.' });
await q('reportes.revisar', { reporte_id: r5.data.reporte_id, decision: 'RECHAZAR', comentario: 'Falta la foto del serial.' });
resumen.push(['RECHAZADA (devuelta)', a5]);

// 6 · Aprobada con fotos, para el portal
const a6 = await crear('Prueba · limpieza de lentes', dia(-6), dia(-5), { prioridad: 'ALTA' });
const f6 = foto(78);
const e6 = await q('evidencias.upload', { actividad_id: a6, momento: 'ANTES', base64: f6.grande, base64_mini: f6.mini, mime: 'image/jpeg' });
await q('actividades.iniciar', { id: a6, evidencia_ids: [e6.data.evidencia_id] });
const f6b = foto(80);
await q('evidencias.upload', { actividad_id: a6, momento: 'DESPUES', base64: f6b.grande, base64_mini: f6b.mini, mime: 'image/jpeg' });
const r6 = await q('reportes.crear', { actividad_id: a6, tipo: 'FINAL', respuestas: [], descripcion: 'Lentes limpios y foco verificado.' });
await q('reportes.revisar', { reporte_id: r6.data.reporte_id, decision: 'APROBAR', comentario: 'Bien.' });
resumen.push(['APROBADA con fotos', a6]);

// 7 · Cancelada: no debe verla nadie
const a7 = await crear('Prueba · cambio de fuente (cancelada)', dia(2), dia(3), {});
await q('actividades.cancelar', { id: a7, motivo: 'Se canceló por prueba' });
resumen.push(['CANCELADA', a7]);

await q('snapshot.regenerar', {});
console.log(resumen.map((r) => r[0].padEnd(28) + r[1]).join('\n'));
