/*
 * Approve/reverse the 33 IOE–Odoo account maps in IOEDESARROLLO.
 * Default mode is read-only preflight. SQL backup is verified before DML.
 * No Odoo write or accounting entry is created.
 */
const fs = require('node:fs');
const path = require('node:path');
const sql = require(path.resolve(__dirname, '../../node_modules/mssql'));
const dotenv = require(path.resolve(__dirname, '../../node_modules/dotenv'));

const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../../.env')));
const target = {
  host: '172.16.100.40',
  port: 1434,
  database: 'IOEDESARROLLO',
  serverName: 'dd7842d7ba7e',
  odooUrl: 'https://ioeb.odoo.com',
  changeId: 'IOE-ODOO-MAP-APPROVAL-20261023',
  actor: 'CODEX-ODOO-MAP-APPROVAL-20261023',
  approver: 'TITULAR IOE (autorizacion contable confirmada)',
  reference: 'Autorizacion contable confirmada por titular en conversacion, 2026-10-23',
};
const accountSpecs = {
  '101.01.01': { type: 'asset_cash', reconcile: false },
  '105.01.01': { type: 'asset_receivable', reconcile: true },
  '206.01.01': { type: 'liability_current', reconcile: true },
  '403.01.01': { type: 'income', reconcile: false },
  '601.84.01': { type: 'expense', reconcile: false },
  '601.84.02': { type: 'expense', reconcile: false },
};
const companies = new Map([
  [1, 'JOEL JIMENEZ CRUZ'],
  [2, 'JORGE JIMENEZ FERNANDEZ'],
  [3, 'TOMAS JIMENEZ FERNANDEZ'],
]);
const evidenceDir = path.resolve(
  __dirname,
  '../../../outputs/odoo_cta_map_approval_dev_20261023',
);

function fail(message) {
  const safe = String(message)
    .replaceAll(env.DB_PASS || '__NO_DB_PASS__', '[REDACTED]')
    .replaceAll(env.API_ODOO || '__NO_ODOO_KEY__', '[REDACTED]');
  throw new Error(safe);
}

function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function evidence(name, value, runStamp) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${name}_${runStamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return file;
}

async function odoo(model, method, payload) {
  const response = await fetch(`${target.odooUrl}/json/2/${model}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${env.API_ODOO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'IOE-accounting-integration/1.0',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) fail(`Odoo ${model}/${method} HTTP ${response.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

async function odooPreflight() {
  if (!env.API_ODOO) fail('API_ODOO falta en .env; se cancela antes de SQL.');
  const version = await (await fetch(`${target.odooUrl}/web/version`)).json();
  if (version.version !== '20.0+e') fail(`Se esperaba Odoo 20.0+e; se recibió ${version.version}.`);
  const ids = [...companies.keys()];
  const companyRows = await odoo('res.company', 'search_read', {
    domain: [['id', 'in', ids]],
    fields: ['id', 'name'],
    limit: ids.length,
    context: { allowed_company_ids: ids },
  });
  if (companyRows.length !== ids.length || companyRows.some((row) => companies.get(row.id) !== row.name)) {
    fail('Compañías Odoo no coinciden con entidades esperadas.');
  }

  const accounts = [];
  const moves = [];
  for (const companyId of ids) {
    const rows = await odoo('account.account', 'search_read', {
      domain: [['code', 'in', Object.keys(accountSpecs)]],
      fields: ['id', 'code', 'account_type', 'reconcile', 'active', 'company_ids'],
      limit: 100,
      context: { allowed_company_ids: [companyId] },
    });
    for (const [code, spec] of Object.entries(accountSpecs)) {
      const found = rows.filter((row) => row.code === code);
      if (found.length !== 1) fail(`Compañía Odoo ${companyId}: cuenta ${code} no es única.`);
      const row = found[0];
      if (row.account_type !== spec.type || row.reconcile !== spec.reconcile ||
          row.active !== true || JSON.stringify(row.company_ids) !== JSON.stringify([companyId])) {
        fail(`Compañía Odoo ${companyId}: cambió configuración de ${code}.`);
      }
      accounts.push({ companyId, code, accountType: row.account_type, reconcile: row.reconcile });
    }
    const accountMoves = await odoo('account.move', 'search_count', {
      domain: [['company_id', '=', companyId]],
      context: { allowed_company_ids: [companyId] },
    });
    const moveLines = await odoo('account.move.line', 'search_count', {
      domain: [['company_id', '=', companyId]],
      context: { allowed_company_ids: [companyId] },
    });
    if (accountMoves !== 0 || moveLines !== 0) fail(`Compañía ${companyId} ya tiene asientos; revisar integridad.`);
    moves.push({ companyId, accountMoves, moveLines });
  }
  return { version: version.version, companies: companyRows, accounts, moves, writes: 0 };
}

async function sqlPreflight(pool) {
  if (env.DB_HOST !== target.host || Number(env.DB_PORT) !== target.port || env.DB_NAME !== target.database) {
    fail('DB_HOST/DB_PORT/DB_NAME no coinciden con IOEDESARROLLO; se cancela.');
  }
  if (!env.DB_USER || !env.DB_PASS) fail('Faltan credenciales SQL en .env.');
  const identity = await pool.request().query(`
    SELECT @@SERVERNAME server,DB_NAME() database_name,d.state_desc state,
      d.is_read_only is_read_only,d.user_access_desc user_access,
      HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','BACKUP DATABASE') can_backup
    FROM sys.databases d WHERE d.name=DB_NAME();
  `);
  const targetRow = identity.recordset[0];
  if (targetRow.server !== target.serverName || targetRow.database_name !== target.database ||
      targetRow.state !== 'ONLINE' || targetRow.is_read_only || targetRow.user_access !== 'MULTI_USER') {
    fail('SQL no coincide con servidor/base/mode permitido.');
  }
  const state = await pool.request().query(`
    SELECT (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL) fiscalEntities,
      (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL) branchLinks,
      (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL WHERE ESTADO_VALIDACION='PENDIENTE') pendingEntities,
      (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL WHERE ESTADO_VALIDACION='PENDIENTE') pendingLinks,
      (SELECT COUNT_BIG(*) FROM dbo.DAT_CAT_CTAS) sourceAccounts,
      (SELECT COUNT_BIG(*) FROM dbo.DAT_CTRL_CTAS) movements,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) allMaps,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) allAudits,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP WHERE ESTADO_MAPEO='PENDIENTE') pendingMaps,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP WHERE ESTADO_MAPEO='VALIDADA') validatedMaps,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT WHERE ACCION='VALIDADA'
        AND JSON_VALUE(CAMPOS_JSON,'$.cambio')=N'${target.changeId}') approvalAudits;
  `);
  return { target: targetRow, counts: state.recordset[0] };
}

function validateState(sqlState, odooState, mode) {
  const c = sqlState.counts;
  if (Number(c.fiscalEntities) !== 3 || Number(c.branchLinks) !== 10 ||
      Number(c.pendingEntities) !== 3 || Number(c.pendingLinks) !== 10 ||
      Number(c.sourceAccounts) !== 7 || Number(c.movements) !== 34457 ||
      Number(c.allMaps) !== 33 || odooState.accounts.length !== 18 || odooState.moves.length !== 3) {
    fail('Preflight de fuente o destino difiere de alcance aprobado.');
  }
  if (mode === 'APPROVE' && (Number(c.pendingMaps) !== 33 || Number(c.validatedMaps) !== 0 || Number(c.allAudits) !== 33)) {
    fail('Solo se aprueban las 33 propuestas pendientes, antes de cualquier aprobación previa.');
  }
  if (mode === 'ROLLBACK' && (Number(c.validatedMaps) !== 33 || Number(c.pendingMaps) !== 0 || Number(c.allAudits) !== 66 || Number(c.approvalAudits) !== 33)) {
    fail('Reversa requiere las 33 aprobaciones originales sin auditorías posteriores.');
  }
  if (mode === 'PREFLIGHT' && ![0, 33].includes(Number(c.validatedMaps))) {
    fail('Estado parcial de mapas; inspeccionar manualmente.');
  }
}

async function backup(connection, targetRow, runStamp) {
  if (!Number(targetRow.can_backup)) fail('La identidad SQL no tiene permiso BACKUP DATABASE.');
  const file = `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_map_approval_${runStamp}.bak`;
  const request = connection.request();
  request.input('backupPath', sql.NVarChar(4000), file);
  await request.query(`BACKUP DATABASE [IOEDESARROLLO] TO DISK=@backupPath WITH COPY_ONLY,CHECKSUM,COMPRESSION,STATS=5;`);
  const verify = connection.request();
  verify.input('backupPath', sql.NVarChar(4000), file);
  await verify.query(`RESTORE VERIFYONLY FROM DISK=@backupPath WITH CHECKSUM;`);
  return file;
}

async function runSqlFile(connection, filename, apply) {
  let content = fs.readFileSync(path.join(__dirname, filename), 'utf8').replace(/^\uFEFF/, '');
  if (apply) {
    const marker = /DECLARE @Aplicar bit=0,/g;
    if ([...content.matchAll(marker)].length !== 1) fail(`Marcador @Aplicar único no encontrado: ${filename}.`);
    content = content.replace(marker, 'DECLARE @Aplicar bit=1,');
  }
  return connection.request().batch(content);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  if (apply && rollback) fail('Usar --apply o --rollback, no ambos.');
  const mode = apply ? 'APPROVE' : rollback ? 'ROLLBACK' : 'PREFLIGHT';
  const connection = await new sql.ConnectionPool({
    server: target.host,
    port: target.port,
    database: target.database,
    user: env.DB_USER,
    password: env.DB_PASS,
    connectionTimeout: 15000,
    requestTimeout: 600000,
    options: { encrypt: false, trustServerCertificate: true, appName: 'DEV_ODOO_MAP_APPROVAL' },
  }).connect();

  try {
    const runStamp = stamp();
    const sqlState = await sqlPreflight(connection);
    const odooState = await odooPreflight();
    validateState(sqlState, odooState, mode);
    const before = {
      mode,
      timestampUtc: new Date().toISOString(),
      target: `${target.host},${target.port}/${target.database}`,
      sql: sqlState,
      odoo: odooState,
      approvalReference: target.reference,
      odooWrites: 0,
      accountingEntriesCreated: 0,
    };
    const preflightFile = evidence('preflight', before, runStamp);
    if (mode === 'PREFLIGHT') {
      const dryRunSql = Number(sqlState.counts.validatedMaps) === 33
        ? '04_revertir_validacion.sql'
        : '03_validar_mapas.sql';
      await runSqlFile(connection, dryRunSql, false);
      process.stdout.write(JSON.stringify({ ...before, preflightEvidence: preflightFile }, null, 2));
      return;
    }

    const backupPath = await backup(connection, sqlState.target, runStamp);
    const sqlFile = rollback ? '04_revertir_validacion.sql' : '03_validar_mapas.sql';
    const result = await runSqlFile(connection, sqlFile, true);
    const postState = await connection.request().query(`
      SELECT @@SERVERNAME server,DB_NAME() database_name,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) allMaps,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) allAudits,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP WHERE ESTADO_MAPEO='PENDIENTE') pendingMaps,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP WHERE ESTADO_MAPEO='VALIDADA') validatedMaps,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP m JOIN dbo.INT_ODOO_CTA_MAP_AUDIT a ON a.ID_MAPEO=m.ID_MAPEO
          WHERE m.ESTADO_MAPEO='VALIDADA' AND a.ACCION='VALIDADA'
            AND JSON_VALUE(a.CAMPOS_JSON,'$.cambio')=N'${target.changeId}') approvalAudits,
        (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL WHERE ESTADO_VALIDACION='PENDIENTE') pendingEntities,
        (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL WHERE ESTADO_VALIDACION='PENDIENTE') pendingLinks,
        (SELECT COUNT_BIG(*) FROM dbo.DAT_CAT_CTAS) sourceAccounts,
        (SELECT COUNT_BIG(*) FROM dbo.DAT_CTRL_CTAS) movements;
    `);
    const post = {
      mode,
      timestampUtc: new Date().toISOString(),
      target: `${target.host},${target.port}/${target.database}`,
      sql: postState.recordset[0],
      backupPath,
      backupCopyOnlyChecksumVerifyOnly: true,
      odooWrites: 0,
      accountingEntriesCreated: 0,
      sqlResults: result.recordsets?.map((set) => set[0] || null) || [],
    };
    const postflightFile = evidence('postflight', post, runStamp);
    const expectedValidated = rollback ? 0 : 33;
    const expectedPending = rollback ? 33 : 0;
    const expectedAudits = rollback ? 99 : 66;
    if (Number(post.sql.allMaps) !== 33 || Number(post.sql.allAudits) !== expectedAudits ||
        Number(post.sql.validatedMaps) !== expectedValidated || Number(post.sql.pendingMaps) !== expectedPending ||
        Number(post.sql.pendingEntities) !== 3 || Number(post.sql.pendingLinks) !== 10 ||
        Number(post.sql.sourceAccounts) !== 7 || Number(post.sql.movements) !== 34457) {
      fail(`Postflight fuera de expectativa; evidencia en ${postflightFile}.`);
    }
    process.stdout.write(JSON.stringify({
      ...post,
      preflightEvidence: preflightFile,
      postflightEvidence: postflightFile,
    }, null, 2));
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error.message || error)}\n`);
  process.exitCode = 1;
});
