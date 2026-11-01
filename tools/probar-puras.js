// Arnés mínimo para ejecutar las funciones puras de Apps Script con Node.
const fs = require('fs');
const vm = require('vm');

const TZ = 'America/Bogota';
function formatDate(d, tz, fmt) {
  const p = (n) => String(n).padStart(2, '0');
  const base = new Date(d.getTime() - 5 * 3600 * 1000); // Bogotá, UTC-5
  const Y = base.getUTCFullYear(), M = p(base.getUTCMonth() + 1), D = p(base.getUTCDate());
  const h = p(base.getUTCHours()), m = p(base.getUTCMinutes()), s = p(base.getUTCSeconds());
  if (fmt === 'yyyy-MM-dd') return `${Y}-${M}-${D}`;
  if (fmt === "yyyy-MM-dd'T'HH:mm:ssXXX") return `${Y}-${M}-${D}T${h}:${m}:${s}-05:00`;
  if (fmt === 'yyyy-MM-dd-HHmm') return `${Y}-${M}-${D}-${h}${m}`;
  return `${Y}-${M}-${D}`;
}

const ctx = {
  console,
  JSON, Math, Date, String, Number, Object, Array, isNaN, parseFloat, parseInt,
  Utilities: { formatDate, getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
    computeDigest: () => [1,2,3], DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    base64Decode: (s) => Buffer.from(s, 'base64'), base64Encode: (b) => Buffer.from(b).toString('base64'),
    newBlob: () => ({ getAs: () => ({}) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Session: { getScriptTimeZone: () => TZ },
};
// Talones de las funciones que en Apps Script leen la hoja
ctx.fechaIso_ = (v) => {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).slice(0, 10);
};
ctx.configNumero = (clave, porDefecto) => porDefecto;
ctx.config = () => null;

ctx.globalThis = ctx;
vm.createContext(ctx);

for (const f of ['Utils.gs', 'Salud.gs', 'Reportes.gs', 'Hitos.gs']) {
  vm.runInContext(fs.readFileSync('/Users/hguaza/Documents/deepseek-harness/default-workspace/cerro-azul-mantenimiento/apps-script/' + f, 'utf8'), ctx, { filename: f });
}

const T = (nombre, esperado, obtenido) => {
  const ok = JSON.stringify(esperado) === JSON.stringify(obtenido);
  console.log((ok ? 'OK   ' : 'FALLA') + ' · ' + nombre + (ok ? '' : ` · esperado ${JSON.stringify(esperado)} · obtenido ${JSON.stringify(obtenido)}`));
  return ok;
};

let pass = 0, fail = 0;
const t = (...a) => { if (T(...a)) pass++; else fail++; };

// fechas
t('sumarDias cruza mes', '2026-11-02', ctx.sumarDias('2026-10-31', 2));
t('sumarDias cruza año', '2027-01-05', ctx.sumarDias('2026-12-31', 5));
t('diasEntre 7', 7, ctx.diasEntre('2026-10-01', '2026-10-08'));
t('diasEntre mismo día', 0, ctx.diasEntre('2026-10-08', '2026-10-08'));

// salud
t('plan al día', 100, ctx.cumplimientoPlan(0, 30));
t('plan en el intervalo', 100, ctx.cumplimientoPlan(30, 30));
t('plan con 15 días de retraso', 50, ctx.cumplimientoPlan(45, 30));
t('plan al triple', 0, ctx.cumplimientoPlan(90, 30));
t('puntaje tres señales', 100, ctx.puntajeSalud(100, 100, 100, null));
t('puntaje una señal', 100, ctx.puntajeSalud(null, 100, null, null));
t('sin señales', null, ctx.puntajeSalud(null, null, null, null));
t('ponderado 0,5/0,3/0,2', 76, ctx.puntajeSalud(100, 60, 40, null));
t('falla = crítico', 'CRITICO', ctx.semaforo({ condicionFalla: true }));
t('novedad grave = crítico', 'CRITICO', ctx.semaforo({ novedadGrave: true }));
t('legal vencido = crítico', 'CRITICO', ctx.semaforo({ legalVencido: true }));
t('novedad media = atención', 'ATENCION', ctx.semaforo({ novedadMedia: true, algunaSenal: true }));
t('con señal = al día', 'AL_DIA', ctx.semaforo({ algunaSenal: true }));
t('sin señales = sin datos', 'SIN_DATOS', ctx.semaforo({}));

// checklist
t('SI cumple', true, ctx.evaluarItem_({ tipo_respuesta: 'SI_NO' }, 'SI'));
t('no cumple', false, ctx.evaluarItem_({ tipo_respuesta: 'SI_NO' }, 'no'));
t('vacío no evalúa', null, ctx.evaluarItem_({ tipo_respuesta: 'SI_NO' }, ''));
const rango = { tipo_respuesta: 'NUMERO', valor_min: 7.2, valor_max: 7.8 };
t('número en rango', true, ctx.evaluarItem_(rango, '7.5'));
t('número bajo', false, ctx.evaluarItem_(rango, '6.9'));
t('número alto', false, ctx.evaluarItem_(rango, '8.1'));
t('coma decimal', true, ctx.evaluarItem_(rango, '7,5'));
t('sin rango no penaliza', null, ctx.evaluarItem_({ tipo_respuesta: 'NUMERO', valor_min: '', valor_max: '' }, '42'));

// ritmo
const hoy = ctx.hoyIso();
const base = { fecha_inicio_plan: ctx.sumarDias(hoy, -3), fecha_fin_plan: ctx.sumarDias(hoy, 7),
  dias_plan: 10, avance_aprobado_pct: 10, estado: 'EN_EJECUCION' };
const r = ctx.calcularRitmo_(base);
t('ritmo días', 10, r.dias_plan);
t('ritmo esperado 40%', 40, r.esperado);
t('ritmo en riesgo', true, r.en_riesgo);
t('ritmo al día', false, ctx.calcularRitmo_({ ...base, avance_aprobado_pct: 40 }).en_riesgo);
t('ritmo cerrada no arriesga', false, ctx.calcularRitmo_({ ...base, estado: 'CERRADA' }).en_riesgo);

console.log(`\nPASADAS: ${pass} · FALLIDAS: ${fail}`);
process.exit(fail ? 1 : 0);
