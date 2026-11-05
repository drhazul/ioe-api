/* Migración de contrato horario. Preflight por defecto; nunca arranca Nest/jobs. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sql = require('mssql');
const dotenv = require('dotenv');
const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : args[i + 1];
};
const mode = arg('--mode', 'preflight');
const database = arg('--database');
const output = arg('--output');
const modes = ['preflight', 'validate-schema', 'apply', 'rollback'];
const root = path.resolve(__dirname, '../sql/2026-11-04_horario_cdmx');
const plan = JSON.parse(
  fs.readFileSync(path.join(root, 'patches.json'), 'utf8'),
);
const hash = (text) =>
  crypto
    .createHash('sha256')
    .update(text, 'utf16le')
    .digest('hex')
    .toUpperCase();
const normalizedDefault = (text) =>
  String(text ?? '')
    .replace(/[\s\[\]]/g, '')
    .toLowerCase();
const quote = (text) => `[${String(text).replaceAll(']', ']]')}]`;
const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
const write = (name, value) =>
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));

async function main() {
  if (
    !modes.includes(mode) ||
    !['IOELOCAL', 'IOEDESARROLLO'].includes(database) ||
    !output
  ) {
    throw new Error(
      'Usar --database IOELOCAL|IOEDESARROLLO --mode preflight|validate-schema|apply|rollback --output ruta-privada',
    );
  }
  if (mode === 'validate-schema' && database !== 'IOEDESARROLLO')
    throw new Error('Ensayo con rollback solo en IOEDESARROLLO');
  fs.mkdirSync(output, { recursive: true });
  const pool = await sql.connect({
    server: env.DB_HOST.trim(),
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASS,
    database,
    options: { encrypt: false, trustServerCertificate: true, useUTC: true },
    connectionTimeout: 10000,
    requestTimeout: 60000,
  });
  let tx;
  try {
    const target = (
      await pool.request().query('SELECT @@SERVERNAME servidor, DB_NAME() base')
    ).recordset[0];
    if (target.base !== database || target.servidor !== plan.expectedServer)
      throw new Error('Instancia/base fuera del manifiesto');
    const modules = (
      await pool.request().query(`SELECT o.name, sm.definition,
      CONVERT(varchar(64), HASHBYTES('SHA2_256', sm.definition), 2) hash
      FROM sys.sql_modules sm JOIN sys.objects o ON o.object_id=sm.object_id WHERE SCHEMA_NAME(o.schema_id)='dbo'`)
    ).recordset;
    const defs = (
      await pool.request()
        .query(`SELECT t.name tabla,c.name columna,d.name,d.definition
      FROM sys.default_constraints d JOIN sys.tables t ON t.object_id=d.parent_object_id
      JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
      WHERE SCHEMA_NAME(t.schema_id)='dbo'`)
    ).recordset;
    const current = new Map(modules.map((m) => [m.name, m]));
    const states = plan.modules.map((m) => ({
      name: m.name,
      state:
        current.get(m.name)?.hash === m.afterHash
          ? 'AFTER'
          : current.get(m.name)?.hash === m.beforeHash
            ? 'BEFORE'
            : 'DRIFT',
    }));
    const defaults = plan.defaults.map((d) => {
      const now = defs.find(
        (x) => x.tabla === d.tabla && x.columna === d.columna,
      );
      return {
        name: d.name,
        state:
          now?.name !== d.name
            ? 'DRIFT'
            : now.definition === d.definition
              ? 'BEFORE'
              : normalizedDefault(now.definition) === normalizedDefault(d.after)
                ? 'AFTER'
                : 'DRIFT',
      };
    });
    const drift = [...states, ...defaults].filter((m) => m.state === 'DRIFT');
    write('preflight.json', {
      capturedAtUtc: new Date().toISOString(),
      target,
      states,
      defaults,
      drift,
    });
    console.log(
      JSON.stringify({
        mode,
        target,
        modules: states.length,
        defaults: defaults.length,
        drift: drift.length,
      }),
    );
    if (mode === 'preflight') return;
    if (mode !== 'validate-schema' && drift.length)
      throw new Error(
        'Deriva de definiciones; refrescar plan, no sobrescribir',
      );
    if (mode === 'apply' && !args.includes('--maintenance'))
      throw new Error(
        'Aplicar solo con --maintenance durante ventana coordinada',
      );
    const backupFile = path.join(output, 'ddl-preimage.json');
    let backup;
    if (mode === 'rollback') {
      backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      if (
        backup.planVersion !== plan.version ||
        backup.target.base !== database ||
        backup.target.servidor !== target.servidor
      )
        throw new Error('Preimagen fuera de destino/versión');
      if ([...states, ...defaults].some((x) => x.state !== 'AFTER'))
        throw new Error(
          'Reversa requiere postimagen completa, sin cambios concurrentes',
        );
    } else {
      if (mode === 'apply' && fs.existsSync(backupFile))
        throw new Error(
          'Preimagen existe; no sobrescribir respaldo ni repetir migración',
        );
      backup = {
        planVersion: plan.version,
        capturedAtUtc: new Date().toISOString(),
        target,
        modules: plan.modules.map((m) => current.get(m.name)),
        clock: current.get('fn_ioe_business_datetime') ?? null,
        defaults: plan.defaults.map((d) =>
          defs.find((x) => x.tabla === d.tabla && x.columna === d.columna),
        ),
      };
      if (
        (mode !== 'validate-schema' && backup.modules.some((m) => !m)) ||
        backup.defaults.some((d) => !d)
      )
        throw new Error('Objeto ausente; abortar ensayo/migración');
      write(
        mode === 'apply' ? 'ddl-preimage.json' : 'ddl-test-preimage.json',
        backup,
      );
    }
    tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const run = async (text) => new sql.Request(tx).batch(text);
    await run('SET XACT_ABORT ON; SET LOCK_TIMEOUT 5000;');
    // Revalidar dentro de la misma transacción que aplica DDL.
    if (mode === 'apply' || mode === 'rollback') {
      for (const m of plan.modules) {
        const got = (
          await new sql.Request(tx)
            .input('name', sql.NVarChar, `dbo.${m.name}`)
            .query(
              "SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',OBJECT_DEFINITION(OBJECT_ID(@name))),2) hash",
            )
        ).recordset[0].hash;
        if (got !== (mode === 'apply' ? m.beforeHash : m.afterHash))
          throw new Error(`Cambio concurrente en ${m.name}`);
      }
    }
    if (mode !== 'rollback') {
      if (current.has('fn_ioe_business_datetime') && mode === 'apply')
        throw new Error(
          'Función ya existe; revisar versión antes de reemplazar',
        );
      await run(fs.readFileSync(path.join(root, 'clock.sql'), 'utf8'));
      for (const m of plan.modules) {
        if (hash(m.definition) !== m.artifactHash)
          throw new Error(`Artefacto alterado: ${m.name}`);
        await run(m.definition);
      }
    } else {
      for (const m of backup.modules)
        await run(
          m.definition.replace(
            /^([ \t]*)(?:CREATE\s+(?:OR\s+ALTER\s+)?|ALTER\s+)(PROC(?:EDURE)?|FUNCTION)\b/im,
            '$1CREATE OR ALTER $2',
          ),
        );
    }
    for (const d of plan.defaults) {
      const existing = (
        await new sql.Request(tx)
          .input('name', sql.NVarChar, d.name)
          .query(
            'SELECT definition FROM sys.default_constraints WHERE name=@name',
          )
      ).recordset[0]?.definition;
      const expected = mode === 'rollback' ? d.after : d.definition;
      if (
        mode !== 'validate-schema' &&
        normalizedDefault(existing) !== normalizedDefault(expected)
      )
        throw new Error(`Cambio concurrente en ${d.name}`);
      const definition =
        mode === 'rollback'
          ? backup.defaults.find((x) => x.name === d.name).definition
          : d.after;
      await run(
        `ALTER TABLE dbo.${quote(d.tabla)} DROP CONSTRAINT ${quote(d.name)}; ALTER TABLE dbo.${quote(d.tabla)} ADD CONSTRAINT ${quote(d.name)} DEFAULT ${definition} FOR ${quote(d.columna)};`,
      );
    }
    if (mode === 'rollback') {
      if (backup.clock)
        await run(
          backup.clock.definition.replace(
            /^\s*(?:CREATE\s+(?:OR\s+ALTER\s+)?|ALTER\s+)FUNCTION\b/i,
            'CREATE OR ALTER FUNCTION',
          ),
        );
      else await run('DROP FUNCTION dbo.fn_ioe_business_datetime;');
    } else {
      const checks = (
        await run(`SELECT
        CONVERT(varchar(33),dbo.fn_ioe_business_datetime(CONVERT(datetime2(7),'2026-11-04T18:39:38.623',126)),126) event,
        CONVERT(varchar(33),dbo.fn_ioe_business_datetime(CONVERT(datetime2(7),'2027-01-01T05:59:59.999',126)),126) yearEnd;`)
      ).recordset[0];
      if (
        !checks.event.startsWith('2026-11-04T12:39:38.623') ||
        !checks.yearEnd.startsWith('2026-12-31T23:59:59.999')
      )
        throw new Error('Contrato SQL CDMX no pasó');
      for (const m of plan.modules) {
        const got = (
          await new sql.Request(tx)
            .input('name', sql.NVarChar, `dbo.${m.name}`)
            .query(
              "SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',OBJECT_DEFINITION(OBJECT_ID(@name))),2) hash",
            )
        ).recordset[0].hash;
        if (got !== m.afterHash)
          throw new Error(`Postimagen incorrecta: ${m.name}`);
      }
      write('sql-contract-check.json', checks);
      const actualDefaults = (
        await run(`SELECT name, definition FROM sys.default_constraints;`)
      ).recordset;
      for (const d of plan.defaults) {
        const actual = actualDefaults.find((item) => item.name === d.name);
        if (
          normalizedDefault(actual?.definition) !== normalizedDefault(d.after)
        ) {
          throw new Error(`Postimagen de default incorrecta: ${d.name}`);
        }
      }
    }
    if (mode === 'validate-schema') await tx.rollback();
    else await tx.commit();
    tx = undefined;
    write(`result-${mode}.json`, {
      target,
      mode,
      capturedAtUtc: new Date().toISOString(),
      result: 'PASS',
      persisted: mode !== 'validate-schema',
    });
    console.log(
      mode === 'validate-schema'
        ? 'PASS: DDL compilado, contrato probado, transacción revertida'
        : 'PASS: DDL y postflight completados',
    );
  } finally {
    if (tx) await tx.rollback().catch(() => {});
    await pool.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
