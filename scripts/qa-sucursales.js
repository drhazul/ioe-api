#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const API_BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const API_DIR = process.cwd();
const STARTUP_TIMEOUT_MS = Number(process.env.QA_STARTUP_TIMEOUT_MS || 120000);
const POLL_INTERVAL_MS = 2000;

const credentialCandidates = [];
if (process.env.QA_ADMIN_USER && process.env.QA_ADMIN_PASS) {
  credentialCandidates.push({
    username: process.env.QA_ADMIN_USER,
    password: process.env.QA_ADMIN_PASS,
  });
}
credentialCandidates.push(
  { username: 'admin', password: 'admin12345' },
  { username: 'admin', password: 'Cambio.2019' },
);

let startedProcess = null;
const processLogs = [];

function log(message) {
  process.stdout.write(`[qa:sucursales] ${message}\n`);
}

function pushProcessLog(prefix, chunk) {
  const lines = String(chunk || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    processLogs.push(`${prefix}${line}`);
    if (processLogs.length > 200) {
      processLogs.shift();
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text.length ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    json,
    text,
  };
}

async function isApiUp() {
  try {
    const res = await request('/health');
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function startApiIfNeeded() {
  const alreadyUp = await isApiUp();
  if (alreadyUp) {
    log('API ya activa. Se usa instancia existente.');
    return;
  }

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  log('API no activa. Iniciando `npm run start:dev`...');
  startedProcess = spawn(npmCmd, ['run', 'start:dev'], {
    cwd: API_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  startedProcess.stdout.on('data', (chunk) => pushProcessLog('[stdout] ', chunk));
  startedProcess.stderr.on('data', (chunk) => pushProcessLog('[stderr] ', chunk));

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (startedProcess.exitCode != null) {
      throw new Error(
        `start:dev terminó antes de levantar API (exitCode=${startedProcess.exitCode}).\n` +
          processLogs.slice(-20).join('\n'),
      );
    }

    if (await isApiUp()) {
      log('API activa para QA.');
      return;
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timeout esperando API (${STARTUP_TIMEOUT_MS}ms).\n${processLogs.slice(-20).join('\n')}`,
  );
}

async function login() {
  for (const candidate of credentialCandidates) {
    try {
      const res = await request('/auth/login', {
        method: 'POST',
        body: {
          username: candidate.username,
          password: candidate.password,
        },
      });

      if (res.ok && res.json && typeof res.json.accessToken === 'string') {
        log(`Login OK con usuario ${candidate.username}.`);
        return res.json.accessToken;
      }
    } catch {
      // try next
    }
  }

  throw new Error('No fue posible autenticar para ejecutar QA de sucursales.');
}

function randomCode(prefix) {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `${prefix}-${seed}`.slice(0, 30);
}

async function runCreateCase(token, payload, expectedLabel) {
  const res = await request('/sucursales', {
    method: 'POST',
    body: payload,
    token,
  });

  if (res.status !== 201) {
    throw new Error(
      `${expectedLabel} falló. Esperado 201, recibido ${res.status}. Body: ${res.text}`,
    );
  }

  if (!res.json || typeof res.json.id !== 'number') {
    throw new Error(`${expectedLabel} sin id válido en respuesta.`);
  }

  return res.json;
}

async function cleanupCreated(token, ids) {
  for (const id of ids) {
    try {
      await request(`/sucursales/${id}`, {
        method: 'DELETE',
        token,
      });
    } catch {
      // best effort
    }
  }
}

async function main() {
  const createdIds = [];
  try {
    await startApiIfNeeded();
    const token = await login();

    const minimalCode = randomCode('QA-MIN');
    const fullCode = randomCode('QA-FUL');

    const minimal = await runCreateCase(
      token,
      {
        codigo: minimalCode,
        nombre: 'Sucursal QA Minimal',
        empresa: 'IOE QA',
        estado: true,
      },
      'Caso A (Minimal)',
    );
    createdIds.push(minimal.id);

    const full = await runCreateCase(
      token,
      {
        codigo: fullCode,
        nombre: 'Sucursal QA Full',
        empresa: 'IOE QA',
        estado: true,
        latitud: 19.4326,
        longitud: -99.1332,
        radio_metros: 250,
      },
      'Caso B (Full)',
    );
    createdIds.push(full.id);

    if (typeof full.latitud !== 'number' || typeof full.longitud !== 'number') {
      throw new Error('Caso B (Full) no regresó coordenadas numéricas.');
    }

    log(`Caso A OK (id=${minimal.id}, codigo=${minimal.codigo}).`);
    log(`Caso B OK (id=${full.id}, codigo=${full.codigo}).`);
    await cleanupCreated(token, createdIds);
    log('Limpieza de datos QA completada.');
    log('QA sucursales: TODO VERDE.');
  } catch (error) {
    process.stderr.write(`[qa:sucursales] ERROR: ${String(error)}\n`);
    if (processLogs.length > 0) {
      process.stderr.write('[qa:sucursales] Últimos logs start:dev:\n');
      process.stderr.write(`${processLogs.slice(-20).join('\n')}\n`);
    }
    process.exitCode = 1;
  } finally {
    if (startedProcess && startedProcess.exitCode == null) {
      startedProcess.kill();
      await wait(500);
    }
  }
}

void main();
