/** Completa el trabajo aprobado: fotos de antes y después, reporte final y aprobación. */
import fs from 'node:fs';
const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const TOKEN = process.argv[2];
const ACTIVIDAD = process.argv[3];

async function q(accion, payload, id) {
  const cuerpo = { action: accion, payload: payload || {}, token: TOKEN };
  if (id) cuerpo.requestId = id;
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo), redirect: 'follow',
  });
  return r.json();
}

const antes = fs.readFileSync('tools/walk/foto-antes.jpg').toString('base64');
const despues = fs.readFileSync('tools/walk/foto-despues.jpg').toString('base64');

const e1 = await q('evidencias.upload', { actividad_id: ACTIVIDAD, momento: 'ANTES', base64: antes, mime: 'image/jpeg' }, 'ap-a-' + Date.now());
console.log('foto antes:', e1.ok ? e1.data.evidencia_id : e1.code + ' ' + e1.message);

const ini = await q('actividades.iniciar', { id: ACTIVIDAD, evidencia_ids: e1.ok ? [e1.data.evidencia_id] : [] }, 'ap-i-' + Date.now());
console.log('iniciar:', ini.ok ? ini.data.actividad.estado : ini.code + ' ' + ini.message);

const e2 = await q('evidencias.upload', { actividad_id: ACTIVIDAD, momento: 'DESPUES', base64: despues, mime: 'image/jpeg' }, 'ap-d-' + Date.now());
console.log('foto después:', e2.ok ? e2.data.evidencia_id : e2.code + ' ' + e2.message);

const rep = await q('reportes.crear', {
  actividad_id: ACTIVIDAD, tipo: 'FINAL', respuestas: [],
  descripcion: 'Se cambiaron las ocho luminarias y se probó el encendido.',
}, 'ap-r-' + Date.now());
console.log('reporte final:', rep.ok ? rep.data.reporte_id : rep.code + ' ' + rep.message);

if (rep.ok) {
  const rev = await q('reportes.revisar', {
    reporte_id: rep.data.reporte_id, decision: 'APROBAR', comentario: 'Trabajo verificado en sitio.',
  }, 'ap-v-' + Date.now());
  console.log('aprobar:', rev.ok ? 'ok' : rev.code + ' ' + rev.message);
}
