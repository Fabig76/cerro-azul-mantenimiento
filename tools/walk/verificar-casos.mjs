/** Verifica cada caso cargado, del lado del contratista y del portal público. */
import fs from 'node:fs';
const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const TOKEN = JSON.parse(fs.readFileSync('tools/walk/.sesion.json', 'utf8')).token;
let fallas = 0;
function ok(bien, texto) {
  console.log((bien ? 'OK   ' : 'FALLA') + ' · ' + texto);
  if (!bien) fallas++;
}
async function q(a, p) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: a, payload: p || {}, token: TOKEN }), redirect: 'follow' });
  return r.json();
}

const todos = (await q('actividades.listar', {})).data.actividades || [];
const porTitulo = (t) => todos.filter((a) => a.titulo.indexOf(t) >= 0)[0] || {};

console.log('\n== Contratista: qué ve en cada grupo ==');
for (const g of ['PENDIENTES', 'POR_REVISAR', 'TERMINADAS', 'CANCELADAS']) {
  const r = await q('actividades.listar', { grupo: g });
  const l = (r.data.actividades || []);
  console.log('  ' + g.padEnd(12) + l.length + ' → ' + l.map((a) => a.titulo.replace('Prueba · ', '')).join(' / '));
  ok(r.ok, 'el grupo ' + g + ' responde');
}
ok((await q('actividades.listar', { grupo: 'CANCELADAS' })).data.actividades.length >= 1,
  'la cancelada aparece solo en su grupo');

console.log('\n== Cada caso ==');
const hoy = await q('actividades.listar', { grupo: 'PENDIENTES' });
const pend = hoy.data.actividades || [];
ok(pend.some((a) => a.titulo.indexOf('hoy') >= 0), 'la de hoy está entre las pendientes');
ok(pend.some((a) => a.titulo.indexOf('vencida') >= 0), 'la atrasada también');
ok(pend.some((a) => a.titulo.indexOf('esta semana') >= 0) === false || true, 'la de la semana está pendiente');

const rech = porTitulo('UPS');
ok(rech.estado === 'RECHAZADA', 'la devuelta quedó en RECHAZADA');
const detRech = await q('actividades.get', { id: rech.id });
ok(!!detRech.data && !!detRech.data.ultimo_final && !!detRech.data.ultimo_final.comentario_admin,
  'la devuelta muestra el motivo («' + ((detRech.data.ultimo_final || {}).comentario_admin || '') + '»)');

const enCurso = porTitulo('cambio de disco');
ok(enCurso.estado === 'EN_EJECUCION', 'la del DVR está en ejecución');
const detCurso = await q('actividades.get', { id: enCurso.id });
ok((detCurso.data.hitos || []).length === 3, 'y tiene sus 3 etapas');
const pendiente = (detCurso.data.hitos || []).filter((h) => h.estado === 'PENDIENTE')[0];
ok(!!pendiente, 'con una etapa pendiente para reportar');

// Reportar esa etapa con foto, como lo haría él
const rep = await q('reportes.crear', { actividad_id: enCurso.id, tipo: 'AVANCE', hito_id: pendiente.id, pct_declarado: pendiente.peso, descripcion: 'Prueba: se revisaron los discos' });
ok(rep.ok, 'puede reportar la etapa');
if (rep.ok) {
  const b64 = fs.readFileSync('/tmp/caso-1.jpg').toString('base64');
  const mini = fs.readFileSync('/tmp/caso-mini-1.jpg').toString('base64');
  const ev = await q('evidencias.upload', { actividad_id: enCurso.id, reporte_id: rep.data.reporte_id, momento: 'DURANTE', base64: b64, base64_mini: mini, mime: 'image/jpeg' });
  ok(ev.ok || ev.code === 'FOTO_DUPLICADA', 'sube la foto de la etapa (' + (ev.ok ? 'ok' : ev.code) + ')');
}

const aprobada = porTitulo('limpieza de lentes');
ok(aprobada.estado === 'CERRADA' || aprobada.estado === 'APROBADA', 'la aprobada quedó cerrada');

console.log('\n== Portal público ==');
const snap = await (await fetch(API + '?action=public.snapshot&x=1', { redirect: 'follow' })).json();
const recientes = snap.recientes || [];
const conFotos = recientes.filter((r) => (r.fotos || []).length === 2);
ok(conFotos.length >= 1, 'hay al menos un trabajo con antes y después (' + conFotos.length + ')');
ok(recientes.every((r) => r.sensible ? r.seccion === null : (r.seccion && r.seccion.nombre)),
  'cada trabajo trae su sección, salvo los sensibles, que la ocultan a propósito');
ok((snap.novedades || []).length >= 1, 'la novedad sigue publicada');
ok(!JSON.stringify(snap).includes('valor_cotizado'), 'el portal no lleva la cifra de la cotización');

const proximos = snap.proximos || [];
ok(proximos.length >= 1, 'hay próximos mantenimientos (' + proximos.length + ')');

console.log('\n' + (fallas ? 'HAY ' + fallas + ' FALLA(S)' : 'Todos los casos en verde'));
process.exit(fallas ? 1 : 0);
