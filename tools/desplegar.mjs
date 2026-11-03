#!/usr/bin/env node
/**
 * desplegar.mjs — sube apps-script/ al proyecto y actualiza el despliegue del Web App,
 * usando el token OAuth propio (el de clasp caduca por política del Workspace).
 *
 * Requiere el token de ~/.config/dsh/google/token-cerroazul.json con los permisos
 *   https://www.googleapis.com/auth/script.projects
 *   https://www.googleapis.com/auth/script.deployments
 *
 * Uso:
 *   node desplegar.mjs            # sube y redespliega
 *   node desplegar.mjs --estado   # solo comprueba el token
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), '.config', 'dsh', 'google');
const CLIENTE = JSON.parse(fs.readFileSync(path.join(DIR, 'oauth-client.json'), 'utf8'));
const TOKEN = JSON.parse(fs.readFileSync(path.join(DIR, 'token-cerroazul.json'), 'utf8'));

const PROYECTO = process.env.SCRIPT_ID
  || '1kMZIHvmbQ7Oy4Fg7p4YB58_R0oOJbJLy7qopSJOkygoY7JESm3xOZjyy';
const DESPLIEGUE = process.env.DEPLOYMENT_ID
  || 'AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg';
const FUENTE = new URL('../cerro-azul-mantenimiento/apps-script/', import.meta.url).pathname;

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENTE.client_id,
      client_secret: CLIENTE.client_secret,
      refresh_token: TOKEN.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('No se pudo renovar el token: ' + JSON.stringify(d).slice(0, 200));
  return d.access_token;
}

async function api(token, ruta, opciones = {}) {
  const r = await fetch('https://script.googleapis.com/v1/' + ruta, {
    ...opciones,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + texto.slice(0, 300));
  return texto ? JSON.parse(texto) : {};
}

function archivos() {
  const lista = fs.readdirSync(FUENTE)
    .filter((f) => f.endsWith('.gs'))
    .map((f) => ({
      name: f.replace(/\.gs$/, ''),
      type: 'SERVER_JS',
      source: fs.readFileSync(path.join(FUENTE, f), 'utf8'),
    }));
  lista.push({
    name: 'appsscript',
    type: 'JSON',
    source: fs.readFileSync(path.join(FUENTE, 'appsscript.json'), 'utf8'),
  });
  return lista;
}

const comando = process.argv[2];

try {
  const token = await accessToken();

  if (comando === '--estado') {
    const perfil = await api(token, `projects/${PROYECTO}/deployments`);
    console.log('Token válido para Apps Script.');
    console.log('Despliegues:', (perfil.deployments || []).length);
    process.exit(0);
  }

  const lista = archivos();
  await api(token, `projects/${PROYECTO}/content`, {
    method: 'PUT',
    body: JSON.stringify({ files: lista }),
  });
  console.log('Subidos ' + lista.length + ' archivos al proyecto.');

  const version = await api(token, `projects/${PROYECTO}/versions`, {
    method: 'POST',
    body: JSON.stringify({ description: 'Despliegue ' + new Date().toISOString().slice(0, 16) }),
  });
  console.log('Versión creada: ' + version.versionNumber);

  await api(token, `projects/${PROYECTO}/deployments/${DESPLIEGUE}`, {
    method: 'PUT',
    body: JSON.stringify({ deploymentConfig: { scriptId: PROYECTO, versionNumber: version.versionNumber } }),
  });
  console.log('Despliegue actualizado a la versión ' + version.versionNumber + '.');
} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exit(1);
}
