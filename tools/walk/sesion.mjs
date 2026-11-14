/**
 * sesion.mjs — cambia el enlace de un solo uso por una sesión real del portal.
 * Uso: node sesion.mjs "<enlace completo del correo>"
 * Guarda el token en tools/walk/.sesion.json (no se sube: está en .gitignore).
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://script.google.com/a/macros/urbcerroazul.com/s/AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec';
const enlace = process.argv[2] || '';
const token = (enlace.match(/[?&#]t=([A-Za-z0-9_-]+)/) || [])[1];
if (!token) {
  console.error('Pasa el enlace completo del correo (debe traer «#/enlace?t=…»).');
  process.exit(1);
}

const cuerpo = JSON.stringify({ action: 'auth.enlace.canjear', payload: { token_enlace: token } });
const r = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: cuerpo,
  redirect: 'follow',
});
const d = await r.json();
if (!d.ok) {
  console.error('No se pudo canjear: ' + d.code + ' · ' + d.message);
  process.exit(1);
}
const datos = d.data || {};
if (!datos.sessionToken) {
  console.log('El enlace respondió estado ' + datos.estado + ' (sin sesión).');
  process.exit(1);
}

const destino = path.join(new URL('.', import.meta.url).pathname, '.sesion.json');
fs.writeFileSync(destino, JSON.stringify({
  token: datos.sessionToken,
  usuario: datos.usuario,
  expira_en: datos.expira_en,
}, null, 2));
console.log('Sesión creada para ' + (datos.usuario && datos.usuario.email) +
  ' · rol ' + (datos.usuario && datos.usuario.rol) + ' · expira ' + datos.expira_en);
