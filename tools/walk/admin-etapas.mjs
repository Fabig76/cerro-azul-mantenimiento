/** Pone etapas de prueba en la actividad del contratista de pruebas (ADMIN). */
const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const TOKEN = process.argv[2];
const ACTIVIDAD = process.argv[3];
if (!TOKEN || !ACTIVIDAD) { console.error('uso: node admin-etapas.mjs <token> <actividad_id>'); process.exit(1); }

async function llamar(accion, payload, requestId) {
  const cuerpo = { action: accion, payload: payload || {}, token: TOKEN };
  if (requestId) cuerpo.requestId = requestId;
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo), redirect: 'follow',
  });
  return r.json();
}

const yo = await llamar('auth.me', {});
console.log('como', yo.data.usuario.email, '·', yo.data.usuario.rol);

const antes = await llamar('actividades.get', { id: ACTIVIDAD });
console.log('etapas antes:', (antes.data.hitos || []).length);

const r = await llamar('hitos.guardar', {
  actividad_id: ACTIVIDAD,
  hitos: [
    { nombre: 'Revisión de discos', peso: 1, fecha_plan: new Date().toISOString().slice(0, 10) },
    { nombre: 'Prueba de grabación', peso: 1, fecha_plan: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
    { nombre: 'Informe al administrador', peso: 1, fecha_plan: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) },
  ],
}, 'etapas-' + Date.now());
console.log('resultado:', JSON.stringify(r).slice(0, 200));

const despues = await llamar('actividades.get', { id: ACTIVIDAD });
console.log('etapas después:', (despues.data.hitos || []).map(function (h) { return h.orden + '. ' + h.nombre; }).join(' · '));
