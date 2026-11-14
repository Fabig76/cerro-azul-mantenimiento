/** Crea un trabajo, lo ejecuta con dos fotos y lo aprueba: el camino completo. */
import fs from 'node:fs';
const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const TOKEN = process.argv[2];
async function q(a, p, id) {
  const c = { action: a, payload: p || {}, token: TOKEN };
  if (id) c.requestId = id;
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(c), redirect: 'follow' });
  return r.json();
}

const nodos = (await q('nodos.arbol', {})).data.nodos;
const t3 = nodos.filter((n) => n.codigo === 'CA-T3')[0];
const hoy = new Date();
const f = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const act = await q('actividades.crear', {
  nodo_id: t3.id, titulo: 'Limpieza de tanque de agua',
  descripcion: 'Lavado y desinfección del tanque de la Torre 3.',
  fecha_inicio_plan: f(-5), fecha_fin_plan: f(-4), prioridad: 'ALTA', publicable: true,
}, 't3-' + Date.now());
if (!act.ok) { console.log('crear:', act.code, act.message); process.exit(1); }
const id = act.data.actividad.id;
console.log('actividad:', id);

const b1 = fs.readFileSync('tools/walk/foto-antes.jpg').toString('base64');
const b2 = fs.readFileSync('tools/walk/foto-despues.jpg').toString('base64');
const m1 = fs.readFileSync('/tmp/mini-antes.jpg').toString('base64');
const m2 = fs.readFileSync('/tmp/mini-despues.jpg').toString('base64');
const e1 = await q('evidencias.upload', { actividad_id: id, momento: 'ANTES', base64: b1, base64_mini: m1, mime: 'image/jpeg' }, 't3a-' + Date.now());
console.log('foto antes:', e1.ok ? 'ok' : e1.code + ' ' + e1.message);
const ini = await q('actividades.iniciar', { id, evidencia_ids: e1.ok ? [e1.data.evidencia_id] : [] }, 't3i-' + Date.now());
console.log('iniciar:', ini.ok ? ini.data.actividad.estado : ini.code);
const e2 = await q('evidencias.upload', { actividad_id: id, momento: 'DESPUES', base64: b2, base64_mini: m2, mime: 'image/jpeg' }, 't3d-' + Date.now());
console.log('foto después:', e2.ok ? 'ok' : e2.code + ' ' + e2.message);
const rep = await q('reportes.crear', { actividad_id: id, tipo: 'FINAL', respuestas: [], descripcion: 'Tanque lavado y desinfectado, con registro de cloro.' }, 't3r-' + Date.now());
console.log('reporte:', rep.ok ? 'ok' : rep.code + ' ' + rep.message);
if (rep.ok) {
  const rev = await q('reportes.revisar', { reporte_id: rep.data.reporte_id, decision: 'APROBAR', comentario: 'Verificado.' }, 't3v-' + Date.now());
  console.log('aprobar:', rev.ok ? 'ok' : rev.code + ' ' + rev.message);
}
const reg = await q('snapshot.regenerar', {});
console.log('snapshot:', reg.ok);
