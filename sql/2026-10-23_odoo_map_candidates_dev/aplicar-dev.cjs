/*
 * Development-only runner for pending IOE–Odoo account proposals.
 * Default: fresh read-only SQL + Odoo preflight. --apply writes 33 PENDIENTE
 * crosswalk rows after COPY_ONLY/CHECKSUM backup and VERIFYONLY. --rollback
 * removes only the exact unchanged proposals from this change ID.
 * Never prints credentials or writes Odoo/accounting entries.
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
  changeId: 'IOE-ODOO-MAP-20261023',
};
const actor = 'CODEX-ODOO-MAP-20261023';
const evidenceDir = path.resolve(__dirname, '../../../outputs/odoo_cta_map_candidates_dev_20261023');
const accountSpecs = {
  '101.01.01': { type: 'asset_cash', reconcile: false },
  '105.01.01': { type: 'asset_receivable', reconcile: true },
  '206.01.01': { type: 'liability_current', reconcile: true },
  '403.01.01': { type: 'income', reconcile: false },
  '601.84.01': { type: 'expense', reconcile: false },
  '601.84.02': { type: 'expense', reconcile: false },
};
const expectedCompanies = new Map([
  [1, 'JOEL JIMENEZ CRUZ'],
  [2, 'JORGE JIMENEZ FERNANDEZ'],
  [3, 'TOMAS JIMENEZ FERNANDEZ'],
]);

function fail(message) {
  const value = String(message)
    .replaceAll(env.DB_PASS || '__NO_DB_PASS__', '[REDACTED]')
    .replaceAll(env.API_ODOO || '__NO_ODOO_KEY__', '[REDACTED]');
  throw new Error(value);
}

function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function writeEvidence(name, data, runStamp) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${name}_${runStamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
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
  if (!response.ok) fail(`Odoo ${model}/${method} HTTP ${response.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : null;
}

async function odooPreflight() {
  if (!env.API_ODOO) fail('API_ODOO falta en .env; se cancela antes de SQL.');
  const version = await (await fetch(`${target.odooUrl}/web/version`)).json();
  if (version.version !== '20.0+e') fail(`Se esperaba Odoo 20.0+e; se recibió ${version.version}.`);

  const companyIds = [...expectedCompanies.keys()];
  const companies = await odoo('res.company', 'search_read', {
    domain: [['id', 'in', companyIds]],
    fields: ['id', 'name'],
    limit: 10,
    context: { allowed_company_ids: companyIds },
  });
  if (companies.length !== expectedCompanies.size) fail('Odoo no devolvió las tres compañías esperadas.');
  for (const company of companies) {
    if (expectedCompanies.get(company.id) !== company.name) {
      fail(`Compañía Odoo ${company.id} no coincide con entidad fiscal esperada.`);
    }
  }

  const accounts = [];
  const moves = [];
  for (const companyId of companyIds) {
    const rows = await odoo('account.account', 'search_read', {
      domain: [['code', 'in', Object.keys(accountSpecs)]],
      fields: ['id', 'code', 'name', 'account_type', 'reconcile', 'active', 'company_ids'],
      limit: 100,
      context: { allowed_company_ids: [companyId] },
    });
    for (const [code, spec] of Object.entries(accountSpecs)) {
      const matches = rows.filter((row) => row.code === code);
      if (matches.length !== 1) fail(`Odoo compañía ${companyId}: código ${code} no es único o no existe.`);
      const account = matches[0];
      if (account.account_type !== spec.type || account.reconcile !== spec.reconcile ||
          account.active !== true || JSON.stringify(account.company_ids) !== JSON.stringify([companyId])) {
        fail(`Odoo compañía ${companyId}: tipo/conciliación/estado/alcance de ${code} cambió.`);
      }
      accounts.push({
        companyId,
        code,
        name: account.name,
        accountType: account.account_type,
        reconcile: account.reconcile,
        active: account.active,
      });
    }
    const accountMoves = await odoo('account.move', 'search_count', {
      domain: [['company_id', '=', companyId]],
      context: { allowed_company_ids: [companyId] },
    });
    const moveLines = await odoo('account.move.line', 'search_count', {
      domain: [['company_id', '=', companyId]],
      context: { allowed_company_ids: [companyId] },
    });
    if (accountMoves !== 0 || moveLines !== 0) {
      fail(`Odoo compañía ${companyId} ya tiene apuntes; requiere nuevo preflight contable.`);
    }
    moves.push({ companyId, accountMoves, moveLines });
  }
  return { version: version.version, companies, accounts, moves, writes: 0 };
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
  const info = identity.recordset[0];
  if (info.server !== target.serverName || info.database_name !== target.database ||
      info.state !== 'ONLINE' || info.is_read_only || info.user_access !== 'MULTI_USER') {
    fail('El SQL activo no coincide con destino permitido ONLINE/READ_WRITE/MULTI_USER.');
  }

  const counts = await pool.request().query(`
    SELECT (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL) fiscalEntities,
      (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL) branchLinks,
      (SELECT COUNT_BIG(*) FROM dbo.DAT_CAT_CTAS) sourceAccounts,
      (SELECT COUNT_BIG(*) FROM dbo.DAT_CTRL_CTAS) movements,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) allMaps,
      (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) allMapAudits,
      (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL WHERE ESTADO_VALIDACION='VALIDADA') validatedEntities,
      (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL WHERE ESTADO_VALIDACION='VALIDADA') validatedLinks;
  `);
  const entities = await pool.request().query(`
    SELECT ID_ENTIDAD_FISCAL,NOMBRE_LEGAL,REGIMEN_FISCAL,CP_FISCAL,ESTADO_VALIDACION
    FROM dbo.ENTIDAD_FISCAL WHERE ID_ENTIDAD_FISCAL IN(1,2,3) ORDER BY ID_ENTIDAD_FISCAL;
  `);
  const branchLinks = await pool.request().query(`
    SELECT ID_ENTIDAD_FISCAL,ESTADO_VALIDACION,COUNT_BIG(*) links
    FROM dbo.ENTIDAD_FISCAL_SUCURSAL GROUP BY ID_ENTIDAD_FISCAL,ESTADO_VALIDACION
    ORDER BY ID_ENTIDAD_FISCAL,ESTADO_VALIDACION;
  `);
  const sourceAccounts = await pool.request().query(`
    SELECT CTA,DCTA,RELACION,SUC FROM dbo.DAT_CAT_CTAS
    WHERE CTA IN(N'101001001',N'101001002',N'101001003',N'210001019',N'704010003',N'704010004')
    ORDER BY CTA;
  `);
  const movements = await pool.request().query(`
    SELECT CTA,TRY_CONVERT(int,CLSD) CMOV,COUNT_BIG(*) rows,
      SUM(CASE WHEN IMPT>0 THEN 1 ELSE 0 END) positiveRows,
      SUM(CASE WHEN IMPT<0 THEN 1 ELSE 0 END) negativeRows,
      SUM(CASE WHEN IMPT=0 THEN 1 ELSE 0 END) zeroRows
    FROM dbo.DAT_CTRL_CTAS
    WHERE CTA IN(N'101001001',N'101001002',N'101001003',N'210001019',N'704010003',N'704010004')
    GROUP BY CTA,TRY_CONVERT(int,CLSD) ORDER BY CTA,CMOV;
  `);
  const schema = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP',N'U') mapTable,
      OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT',N'U') auditTable,
      (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP')
        AND name IN(N'UX_INT_ODOO_CTA_MAP_GLOBAL',N'UX_INT_ODOO_CTA_MAP_SUC')) uniqueIndexes;
  `);
  return {
    target: info,
    counts: counts.recordset[0],
    entities: entities.recordset,
    branchLinks: branchLinks.recordset,
    sourceAccounts: sourceAccounts.recordset,
    movementClasses: movements.recordset,
    schema: schema.recordset[0],
  };
}

function validatePreflight(sqlState, odooState) {
  if (Number(sqlState.counts.fiscalEntities) !== 3 || Number(sqlState.counts.branchLinks) !== 10 ||
      Number(sqlState.counts.sourceAccounts) !== 7 || Number(sqlState.counts.movements) !== 34457) {
    fail('Conteos base cambiaron desde revisión; inspeccionar antes de aplicar.');
  }
  if (Number(sqlState.counts.validatedEntities) !== 0 || Number(sqlState.counts.validatedLinks) !== 0) {
    fail('Alguna entidad/vínculo ya fue validado; refrescar revisión antes de aplicar.');
  }
  if (sqlState.entities.length !== 3 || sqlState.entities.some((row, index) =>
      row.ID_ENTIDAD_FISCAL !== index + 1 || row.NOMBRE_LEGAL !== expectedCompanies.get(index + 1) ||
      row.ESTADO_VALIDACION !== 'PENDIENTE')) {
    fail('Las entidades fiscales no coinciden con el preflight autorizado.');
  }
  if (sqlState.branchLinks.some((row) => row.ESTADO_VALIDACION !== 'PENDIENTE')) {
    fail('Cambió el estado de vínculos sucursal-entidad; revisar nuevamente.');
  }
  if (sqlState.sourceAccounts.length !== 6) fail('Cambió el catálogo de cuentas fuente.');
  if (sqlState.schema.mapTable == null || sqlState.schema.auditTable == null ||
      Number(sqlState.schema.uniqueIndexes) !== 2) fail('Esquema crosswalk incompleto.');
  if (Number(odooState.accounts.length) !== 18 || Number(odooState.moves.length) !== 3) {
    fail('Preflight de cuentas Odoo incompleto.');
  }
}

async function backup(pool, runStamp, reuseStamp = null) {
  if (!env.DB_USER || !env.DB_PASS) fail('Faltan credenciales SQL.');
  const file = `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_map_candidates_${reuseStamp || runStamp}.bak`;
  if (reuseStamp) {
    const prior = pool.request();
    prior.input('backupPath', sql.NVarChar(4000), file);
    const verifiedBackup = await prior.query(`
      SELECT TOP(1) bs.backup_finish_date
      FROM msdb.dbo.backupset bs
      JOIN msdb.dbo.backupmediafamily bmf ON bmf.media_set_id=bs.media_set_id
      WHERE bs.database_name=N'IOEDESARROLLO' AND bs.type='D'
        AND bs.is_copy_only=1 AND bs.has_backup_checksums=1
        AND bmf.physical_device_name=@backupPath
        AND bs.backup_finish_date>=DATEADD(HOUR,-4,GETDATE())
      ORDER BY bs.backup_finish_date DESC;
    `);
    if (!verifiedBackup.recordset.length) fail('El respaldo indicado no existe, no tiene CHECKSUM o ya no es reciente.');
  } else {
    const request = pool.request();
    request.input('backupPath', sql.NVarChar(4000), file);
    await request.query(`BACKUP DATABASE [IOEDESARROLLO] TO DISK=@backupPath WITH COPY_ONLY,CHECKSUM,COMPRESSION,STATS=5;`);
  }
  const verify = pool.request();
  verify.input('backupPath', sql.NVarChar(4000), file);
  await verify.query(`RESTORE VERIFYONLY FROM DISK=@backupPath WITH CHECKSUM;`);
  return file;
}

async function runSqlFile(pool, filename, apply) {
  let content = fs.readFileSync(path.join(__dirname, filename), 'utf8').replace(/^\uFEFF/, '');
  if (apply) {
    const marker = /DECLARE @Aplicar bit=0,/g;
    const matches = [...content.matchAll(marker)].length;
    if (matches !== 1) fail(`No se encontró marcador único de aplicación en ${filename}.`);
    content = content.replace(marker, 'DECLARE @Aplicar bit=1,');
  }
  return pool.request().batch(content);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  if (apply && rollback) fail('Usar --apply o --rollback, no ambos.');
  const reuseArg = process.argv.find((arg) => arg.startsWith('--reuse-backup='));
  const reuseStamp = reuseArg?.slice('--reuse-backup='.length);
  if (reuseStamp && (!/^\d{14}$/.test(reuseStamp) || (!apply && !rollback))) {
    fail('--reuse-backup requiere marca UTC de 14 dígitos y --apply o --rollback.');
  }
  const mode = apply ? 'APPLY' : rollback ? 'ROLLBACK' : 'PREFLIGHT';
  const pool = await new sql.ConnectionPool({
    server: target.host,
    port: target.port,
    database: target.database,
    user: env.DB_USER,
    password: env.DB_PASS,
    connectionTimeout: 15000,
    requestTimeout: 600000,
    options: { encrypt: false, trustServerCertificate: true, appName: 'DEV_ODOO_MAP_CANDIDATES' },
  }).connect();

  try {
    const runStamp = stamp();
    const sqlState = await sqlPreflight(pool);
    const odooState = await odooPreflight();
    validatePreflight(sqlState, odooState);
    const preflight = {
      mode,
      timestampUtc: new Date().toISOString(),
      target: `${target.host},${target.port}/${target.database}`,
      sqlServer: target.serverName,
      sql: sqlState,
      odoo: odooState,
      proposalRows: 33,
      verifiedBackup: false,
      odooWrites: 0,
      accountingEntriesCreated: 0,
    };
    const preflightFile = writeEvidence('preflight', preflight, runStamp);
    if (!apply && !rollback) {
      await runSqlFile(pool, '01_propuestas_pendientes.sql', false);
      process.stdout.write(JSON.stringify({ ...preflight, preflightEvidence: preflightFile }, null, 2));
      return;
    }

    if (!sqlState.target.can_backup) fail('La identidad SQL no tiene permiso de backup; no se aplica.');
    const backupPath = await backup(pool, runStamp, reuseStamp);
    const script = rollback ? '02_reversa.sql' : '01_propuestas_pendientes.sql';
    const result = await runSqlFile(pool, script, true);
    const post = await pool.request().query(`
      SELECT @@SERVERNAME server,DB_NAME() database_name,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) allMaps,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) allAudits,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP m
          WHERE m.ODOO_ENTORNO='ONLINE' AND m.CREADO_POR=N'${actor}'
            AND m.ESTADO_MAPEO='PENDIENTE') proposalMaps,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT a
          WHERE a.ACCION='PROPUESTA_PENDIENTE'
            AND JSON_VALUE(a.CAMPOS_JSON,'$.cambio')=N'${target.changeId}') proposalAudits,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP WHERE ESTADO_MAPEO='VALIDADA') validatedMaps,
        (SELECT COUNT_BIG(*) FROM dbo.DAT_CAT_CTAS) sourceAccounts,
        (SELECT COUNT_BIG(*) FROM dbo.DAT_CTRL_CTAS) movements,
        (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL) fiscalEntities,
        (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL) branchLinks;
    `);
    const postflight = {
      mode,
      timestampUtc: new Date().toISOString(),
      target: `${target.host},${target.port}/${target.database}`,
      sql: post.recordset[0],
      backupPath,
      backupCopyOnlyChecksumVerifyOnly: true,
      odooWrites: 0,
      accountingEntriesCreated: 0,
      sqlResults: result.recordsets?.map((set) => set[0] || null) || [],
    };
    const postflightFile = writeEvidence('postflight', postflight, runStamp);
    const expectedProposalRows = rollback ? 0 : 33;
    if (Number(postflight.sql.proposalMaps) !== expectedProposalRows ||
        Number(postflight.sql.proposalAudits) !== expectedProposalRows ||
        Number(postflight.sql.validatedMaps) !== 0 ||
        Number(postflight.sql.sourceAccounts) !== Number(sqlState.counts.sourceAccounts) ||
        Number(postflight.sql.movements) !== Number(sqlState.counts.movements) ||
        Number(postflight.sql.fiscalEntities) !== Number(sqlState.counts.fiscalEntities) ||
        Number(postflight.sql.branchLinks) !== Number(sqlState.counts.branchLinks)) {
      fail(`Postflight fuera de expectativa; evidencia guardada en ${postflightFile}.`);
    }
    process.stdout.write(JSON.stringify({
      ...postflight,
      preflightEvidence: preflightFile,
      postflightEvidence: postflightFile,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error.message || error)}\n`);
  process.exitCode = 1;
});
