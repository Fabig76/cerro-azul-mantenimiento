/**
 * admin-datos-publicos.mjs — deja el portal público con datos reales de prueba.
 * Crea: una novedad publicable, un trabajo programado que afecta el uso y otro
 * aprobado con fotos, para revisar cada módulo del portal.
 */
const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
import fs from 'node:fs';
const TOKEN = process.argv[2];
if (!TOKEN) { console.error('uso: node admin-datos-publicos.mjs <token_admin>'); process.exit(1); }

async function q(accion, payload, id) {
  const cuerpo = { action: accion, payload: payload || {}, token: TOKEN };
  if (id) cuerpo.requestId = id;
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo), redirect: 'follow',
  });
  return r.json();
}

const nodos = (await q('nodos.arbol', {})).data.nodos;
const porCodigo = {};
nodos.forEach((n) => { porCodigo[n.codigo] = n; });
const t1 = porCodigo['CA-T1'];
const ac = porCodigo['CA-AC'];

// 1 · Novedad publicable en áreas comunes
const nov = await q('novedades.crear', {
  nodo_id: ac.id,
  titulo: 'Filtración en el techo del salón social',
  descripcion: 'Se detectó humedad en el cielo raso. Se está evaluando la cubierta.',
  tipo: 'DANO', gravedad: 'MEDIA', publicable: true,
}, 'pub-nov-' + Date.now());
console.log('novedad:', nov.ok ? nov.data.novedad.id : nov.code + ' ' + nov.message);

// 2 · Trabajo programado la próxima semana que afecta el uso
const hoy = new Date();
const en4 = new Date(hoy.getTime() + 4 * 86400000).toISOString().slice(0, 10);
const en6 = new Date(hoy.getTime() + 6 * 86400000).toISOString().slice(0, 10);
const prog = await q('actividades.crear', {
  nodo_id: porCodigo['CA-T1'].id,
  titulo: 'Mantenimiento del ascensor Torre 1',
  descripcion: 'Revisión anual del ascensor. El servicio queda fuera de uso durante la jornada.',
  fecha_inicio_plan: en4, fecha_fin_plan: en6, prioridad: 'ALTA',
  afecta_uso: true, publicable: true,
}, 'pub-prog-' + Date.now());
console.log('programada:', prog.ok ? prog.data.actividad.id : prog.code + ' ' + prog.message);

// 3 · Trabajo aprobado con fotos (para «Lo último que se hizo»)
const ap = await q('actividades.crear', {
  nodo_id: porCodigo['CA-T2'].id,
  titulo: 'Cambio de luminarias del pasillo',
  descripcion: 'Se cambiaron ocho luminarias del pasillo del segundo piso.',
  fecha_inicio_plan: new Date(hoy.getTime() - 3 * 86400000).toISOString().slice(0, 10),
  fecha_fin_plan: new Date(hoy.getTime() - 2 * 86400000).toISOString().slice(0, 10),
  prioridad: 'MEDIA', publicable: true,
}, 'pub-ap-' + Date.now());
console.log('aprobada:', ap.ok ? ap.data.actividad.id : ap.code + ' ' + ap.message);

if (ap.ok) {
  const id = ap.data.actividad.id;
  const foto = fs.readFileSync('tools/walk/foto.jpg');
  const b64 = foto.toString('base64');
  const ini = await q('actividades.iniciar', { id, evidencia_ids: [] , sin_foto_motivo: 'Prueba'}, 'pub-ini-' + Date.now());
  for (const momento of ['ANTES', 'DESPUES']) {
    const ev = await q('evidencias.upload', {
      actividad_id: id, momento, base64: b64, mime: 'image/jpeg',
    }, 'pub-ev-' + momento + '-' + Date.now());
    console.log('  foto ' + momento + ':', ev.ok ? ev.data.evidencia_id : ev.code + ' ' + ev.message);
  }
  const rep = await q('reportes.crear', {
    actividad_id: id, tipo: 'FINAL',
    respuestas: [], descripcion: 'Trabajo terminado y verificado.',
  }, 'pub-rep-' + Date.now());
  console.log('  reporte final:', rep.ok ? rep.data.reporte_id : rep.code + ' ' + rep.message);
  if (rep.ok) {
    const rev = await q('reportes.revisar', {
      reporte_id: rep.data.reporte_id, decision: 'APROBAR', comentario: 'Todo correcto.',
    }, 'pub-rev-' + Date.now());
    console.log('  aprobación:', rev.ok ? 'ok' : rev.code + ' ' + rev.message);
  }
}

const reg = await q('snapshot.regenerar', {});
console.log('snapshot:', reg.ok ? 'regenerado' : reg.code + ' ' + reg.message);
