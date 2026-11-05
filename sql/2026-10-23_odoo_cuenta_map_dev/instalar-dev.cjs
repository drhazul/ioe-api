/*
 * Read-only preflight by default. --apply is restricted to IOEDESARROLLO,
 * makes and verifies fresh COPY_ONLY/CHECKSUM backup, then applies the empty
 * Odoo account crosswalk schema. Never prints credentials.
 */
const fs = require('node:fs');
const path = require('node:path');
const sql = require(path.resolve(__dirname, '../../node_modules/mssql'));
const dotenv = require(path.resolve(__dirname, '../../node_modules/dotenv'));

const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../../.env')));
const host = '172.16.100.40';
const port = 1434;
const database = 'IOEDESARROLLO';
const sqlServerName = 'dd7842d7ba7e';
const apply = process.argv.includes('--apply');
const reuseBackupStamp = process.argv.find((arg) => arg.startsWith('--reuse-backup='))?.split('=')[1];
const evidenceDir = path.resolve(
  __dirname,
  '../../../outputs/odoo_cuenta_map_dev_20261023',
);

function fail(message) {
  const secret = env.DB_PASS || '__NO_SECRET__';
  throw new Error(String(message).replaceAll(secret, '[REDACTED]'));
}

function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function writeEvidence(kind, value, runStamp) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${kind}_${runStamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return file;
}

const preflightSql = `
  IF DB_NAME()<>N'${database}' OR @@SERVERNAME<>N'${sqlServerName}'
    THROW 53410,'Destino no autorizado; se cancela.',1;
  SELECT @@SERVERNAME servidor,DB_NAME() base,d.state_desc estado,
    d.is_read_only solo_lectura,d.user_access_desc acceso,
    HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','BACKUP DATABASE') puede_respaldar
  FROM sys.databases d WHERE d.name=DB_NAME();
  SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID(N'dbo')
    AND name IN(N'ENTIDAD_FISCAL',N'ENTIDAD_FISCAL_SUCURSAL',N'DAT_CAT_CTAS',N'DAT_SUC',N'DAT_CTRL_CTAS',
      N'INT_ODOO_CTA_MAP',N'INT_ODOO_CTA_MAP_AUDIT');
  SELECT OBJECT_NAME(c.object_id) tabla,c.name columna,t.name tipo,c.max_length,c.is_nullable,
    c.collation_name
  FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id
  WHERE c.object_id IN(OBJECT_ID(N'dbo.ENTIDAD_FISCAL'),OBJECT_ID(N'dbo.ENTIDAD_FISCAL_SUCURSAL'),
      OBJECT_ID(N'dbo.DAT_CAT_CTAS'),OBJECT_ID(N'dbo.DAT_SUC'),OBJECT_ID(N'dbo.DAT_CTRL_CTAS'),
      OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'));
  SELECT i.name indice,OBJECT_NAME(i.object_id) tabla,i.is_primary_key es_pk,
    c.name primera_columna,ic.key_ordinal
  FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
  JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
  WHERE i.is_primary_key=1 AND ic.key_ordinal=1
    AND i.object_id IN(OBJECT_ID(N'dbo.DAT_CAT_CTAS'),OBJECT_ID(N'dbo.DAT_SUC'));
  SELECT name,OBJECT_NAME(parent_object_id) tabla FROM sys.check_constraints
    WHERE parent_object_id IN(OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'));
  SELECT name,OBJECT_NAME(parent_object_id) tabla FROM sys.default_constraints
    WHERE parent_object_id IN(OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'));
  SELECT name,OBJECT_NAME(object_id) tabla,is_primary_key,is_unique,has_filter,filter_definition
    FROM sys.indexes WHERE object_id IN(OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'));
  SELECT name,OBJECT_NAME(parent_object_id) tabla FROM sys.foreign_keys
    WHERE parent_object_id IN(OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'));
  SELECT
    (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL) entidades_fiscales,
    (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL) vinculos_sucursal,
    (SELECT COUNT_BIG(*) FROM dbo.DAT_CAT_CTAS) cuentas_ioe,
    (SELECT COUNT_BIG(*) FROM dbo.DAT_CTRL_CTAS) movimientos_contables,
    (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL WHERE ESTADO_VALIDACION='VALIDADA') entidades_validadas,
    (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL WHERE ESTADO_VALIDACION='VALIDADA') vinculos_validados;
`;

function requireColumn(rows, table, column, type, length, nullable) {
  const row = rows.find((x) => x.tabla === table && x.columna === column);
  if (!row || row.tipo !== type || Number(row.max_length) !== length || Boolean(row.is_nullable) !== nullable) {
    fail(`Columna base ${table}.${column} no coincide con firma esperada.`);
  }
}

function validateBaseline(data, existingNames) {
  const requiredTables = ['ENTIDAD_FISCAL', 'ENTIDAD_FISCAL_SUCURSAL', 'DAT_CAT_CTAS', 'DAT_SUC', 'DAT_CTRL_CTAS'];
  for (const name of requiredTables) if (!existingNames.has(name)) fail(`Falta tabla base dbo.${name}.`);
  const columns = data.recordsets[2];
  requireColumn(columns, 'ENTIDAD_FISCAL', 'ID_ENTIDAD_FISCAL', 'int', 4, false);
  requireColumn(columns, 'ENTIDAD_FISCAL_SUCURSAL', 'SUC', 'nvarchar', 20, false);
  requireColumn(columns, 'DAT_CAT_CTAS', 'CTA', 'nvarchar', 510, false);
  requireColumn(columns, 'DAT_SUC', 'SUC', 'nvarchar', 20, false);
  const keys = new Set(data.recordsets[3].map((x) => `${x.tabla}.${x.primera_columna}`));
  if (!keys.has('DAT_CAT_CTAS.CTA')) fail('DAT_CAT_CTAS.CTA ya no es PK simple esperada.');
  if (!keys.has('DAT_SUC.SUC')) fail('DAT_SUC.SUC ya no es PK simple esperada.');
  const fiscalSucursalKey = new Set(data.recordsets[2]
    .filter((x) => x.tabla === 'ENTIDAD_FISCAL_SUCURSAL')
    .map((x) => x.columna));
  if (!fiscalSucursalKey.has('ID_ENTIDAD_FISCAL')) fail('Falta relación fiscal-sucursal esperada.');
}

function validateMappingSchema(names, columns, checks, defaults, indexes, foreignKeys) {
  const mapping = names.has('INT_ODOO_CTA_MAP');
  const audit = names.has('INT_ODOO_CTA_MAP_AUDIT');
  if (mapping !== audit) fail('Esquema Odoo parcial; requiere revisión manual.');
  if (!mapping) return 'AUSENTE';

  const expected = {
    INT_ODOO_CTA_MAP: [
      'ID_MAPEO','ID_ENTIDAD_FISCAL','CTA_IOE','SUC','TIPO_EVENTO','ROL_APUNTE','SIGNO_IMPORTE',
      'ODOO_ENTORNO','ODOO_COMPANY_ID','ODOO_COD_CUENTA','ESTADO_MAPEO','APROBADO_POR',
      'REFERENCIA_APROBACION','FCN_APROBACION_UTC','CREADO_POR','FCN_CREACION_UTC',
      'MODIFICADO_POR','FCN_MODIFICACION_UTC','VERSION',
    ],
    INT_ODOO_CTA_MAP_AUDIT: ['ID_AUDIT','ID_MAPEO','ACCION','CAMPOS_JSON','ACTOR','FCN_UTC'],
  };
  for (const [table, required] of Object.entries(expected)) {
    const found = new Set(columns.filter((x) => x.tabla === table).map((x) => x.columna));
    if (required.some((column) => !found.has(column))) fail(`Firma ${table} incompleta o distinta.`);
  }
  const expectedTypes = new Map([
    ['INT_ODOO_CTA_MAP.ID_MAPEO',['bigint',8,false]],
    ['INT_ODOO_CTA_MAP.ID_ENTIDAD_FISCAL',['int',4,false]],
    ['INT_ODOO_CTA_MAP.CTA_IOE',['nvarchar',510,false]],
    ['INT_ODOO_CTA_MAP.SUC',['nvarchar',20,true]],
    ['INT_ODOO_CTA_MAP.TIPO_EVENTO',['nvarchar',128,false]],
    ['INT_ODOO_CTA_MAP.ROL_APUNTE',['varchar',24,false]],
    ['INT_ODOO_CTA_MAP.SIGNO_IMPORTE',['varchar',12,false]],
    ['INT_ODOO_CTA_MAP.ODOO_ENTORNO',['varchar',12,false]],
    ['INT_ODOO_CTA_MAP.ODOO_COMPANY_ID',['int',4,false]],
    ['INT_ODOO_CTA_MAP.ODOO_COD_CUENTA',['nvarchar',128,false]],
    ['INT_ODOO_CTA_MAP.ESTADO_MAPEO',['varchar',12,false]],
    ['INT_ODOO_CTA_MAP.APROBADO_POR',['nvarchar',510,true]],
    ['INT_ODOO_CTA_MAP.REFERENCIA_APROBACION',['nvarchar',500,true]],
    ['INT_ODOO_CTA_MAP.FCN_APROBACION_UTC',['datetime2',8,true]],
    ['INT_ODOO_CTA_MAP.CREADO_POR',['nvarchar',510,false]],
    ['INT_ODOO_CTA_MAP.FCN_CREACION_UTC',['datetime2',8,false]],
    ['INT_ODOO_CTA_MAP.MODIFICADO_POR',['nvarchar',510,false]],
    ['INT_ODOO_CTA_MAP.FCN_MODIFICACION_UTC',['datetime2',8,false]],
    ['INT_ODOO_CTA_MAP.VERSION',['timestamp',8,false]],
    ['INT_ODOO_CTA_MAP_AUDIT.ID_AUDIT',['bigint',8,false]],
    ['INT_ODOO_CTA_MAP_AUDIT.ID_MAPEO',['bigint',8,false]],
    ['INT_ODOO_CTA_MAP_AUDIT.ACCION',['varchar',24,false]],
    ['INT_ODOO_CTA_MAP_AUDIT.CAMPOS_JSON',['nvarchar',-1,false]],
    ['INT_ODOO_CTA_MAP_AUDIT.ACTOR',['nvarchar',510,false]],
    ['INT_ODOO_CTA_MAP_AUDIT.FCN_UTC',['datetime2',8,false]],
  ]);
  for (const [key, signature] of expectedTypes) {
    const [table, column] = key.split('.');
    const actual = columns.find((x) => x.tabla === table && x.columna === column);
    if (!actual || actual.tipo !== signature[0] || Number(actual.max_length) !== signature[1] ||
        Boolean(actual.is_nullable) !== signature[2]) fail(`Tipo/nullabilidad de ${key} no coincide.`);
  }
  const requiredIndexes = [
    'PK_INT_ODOO_CTA_MAP','PK_INT_ODOO_CTA_MAP_AUDIT','UX_INT_ODOO_CTA_MAP_GLOBAL',
    'UX_INT_ODOO_CTA_MAP_SUC','IX_INT_ODOO_CTA_MAP_RESOLVER','IX_INT_ODOO_CTA_MAP_AUDIT_MAPA',
  ];
  const indexNames = new Set(indexes.map((x) => x.name));
  if (requiredIndexes.some((x) => !indexNames.has(x))) fail('Índices del esquema existente no coinciden.');
  const requiredFks = [
    'FK_INT_ODOO_CTA_MAP_ENTIDAD','FK_INT_ODOO_CTA_MAP_CTA','FK_INT_ODOO_CTA_MAP_SUC',
    'FK_INT_ODOO_CTA_MAP_AUDIT_MAPA',
  ];
  const fkNames = new Set(foreignKeys.map((x) => x.name));
  if (requiredFks.some((x) => !fkNames.has(x))) fail('Claves foráneas del esquema existente no coinciden.');
  const requiredChecks = [
    'CK_INT_ODOO_CTA_MAP_EVENTO','CK_INT_ODOO_CTA_MAP_ROL','CK_INT_ODOO_CTA_MAP_SIGNO',
    'CK_INT_ODOO_CTA_MAP_ENTORNO','CK_INT_ODOO_CTA_MAP_COMPANY','CK_INT_ODOO_CTA_MAP_CODIGO',
    'CK_INT_ODOO_CTA_MAP_ESTADO','CK_INT_ODOO_CTA_MAP_APROBACION','CK_INT_ODOO_CTA_MAP_AUDIT_JSON',
  ];
  if (requiredChecks.some((x) => !new Set(checks.map((row) => row.name)).has(x))) {
    fail('Restricciones CHECK del esquema existente no coinciden.');
  }
  const requiredDefaults = [
    'DF_INT_ODOO_CTA_MAP_SIGNO','DF_INT_ODOO_CTA_MAP_ESTADO','DF_INT_ODOO_CTA_MAP_CREACION',
    'DF_INT_ODOO_CTA_MAP_MODIFICACION','DF_INT_ODOO_CTA_MAP_AUDIT_UTC',
  ];
  if (requiredDefaults.some((x) => !new Set(defaults.map((row) => row.name)).has(x))) {
    fail('Valores predeterminados del esquema existente no coinciden.');
  }
  const uniqueIndexes = new Map(indexes.map((row) => [row.name, row]));
  for (const name of ['UX_INT_ODOO_CTA_MAP_GLOBAL','UX_INT_ODOO_CTA_MAP_SUC']) {
    const index = uniqueIndexes.get(name);
    if (!index || !index.is_unique || !index.has_filter || !index.filter_definition) {
      fail(`Índice filtrado único ${name} no coincide.`);
    }
  }
  return 'PRESENTE_VALIDADO';
}

async function main() {
  if (reuseBackupStamp && (!apply || !/^\d{14}$/.test(reuseBackupStamp))) {
    fail('--reuse-backup requiere --apply y marca UTC de 14 dígitos.');
  }
  if (env.DB_HOST !== host || Number(env.DB_PORT) !== port || env.DB_NAME !== database) {
    fail('DB_HOST/DB_PORT/DB_NAME no corresponden a IOEDESARROLLO autorizado; conexión cancelada.');
  }
  if (!env.DB_USER || !env.DB_PASS) fail('Faltan credenciales en .env.');

  const pool = await new sql.ConnectionPool({
    server: host,
    port,
    database,
    user: env.DB_USER,
    password: env.DB_PASS,
    requestTimeout: 600000,
    options: { encrypt: false, trustServerCertificate: true, appName: 'DEV_ODOO_CTA_MAP_INSTALL' },
  }).connect();

  try {
    const target = await pool.request().query(preflightSql);
    const identity = target.recordsets[0][0];
    if (identity.servidor !== sqlServerName || identity.base !== database ||
        identity.estado !== 'ONLINE' || identity.solo_lectura || identity.acceso !== 'MULTI_USER') {
      fail('Destino no está ONLINE/READ_WRITE/MULTI_USER o no coincide con whitelist.');
    }
    const names = new Set(target.recordsets[1].map((x) => x.name));
    validateBaseline(target, names);
    const schema = validateMappingSchema(names, target.recordsets[2], target.recordsets[4],
      target.recordsets[5], target.recordsets[6], target.recordsets[7]);

    const counts = target.recordsets[8][0];
    const runStamp = stamp();
    const preflight = {
      target: `${host},${port}/${database}`,
      server: sqlServerName,
      databaseState: identity.estado,
      databaseReadOnly: Boolean(identity.solo_lectura),
      schema,
      counts,
      backupPermission: Boolean(identity.puede_respaldar),
      applyRequested: apply,
      timestampUtc: new Date().toISOString(),
      productionChanged: false,
      odooChanged: false,
    };
    const preflightFile = writeEvidence('preflight', preflight, runStamp);
    console.log(JSON.stringify({ ...preflight, evidence: preflightFile }));
    if (!apply) return;
    if (!identity.puede_respaldar) fail('La identidad SQL no puede crear backup; DDL cancelado.');
    if (schema === 'PRESENTE_VALIDADO') {
      const existing = await pool.request().query(`
        SELECT (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) mapeos,
          (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) auditorias;
      `);
      const report = {
        status: 'ESQUEMA_YA_PRESENTE_SIN_CAMBIOS',
        target: `${host},${port}/${database}`,
        server: sqlServerName,
        before: counts,
        mappingRows: existing.recordset[0],
        timestampUtc: new Date().toISOString(),
        productionChanged: false,
        odooChanged: false,
      };
      const applicationFile = writeEvidence('aplicacion', report, runStamp);
      console.log(JSON.stringify({ ...report, evidence: applicationFile }));
      return;
    }

    const backupStamp = reuseBackupStamp || runStamp;
    const backupPath = `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_cta_map_${backupStamp}.bak`;
    if (reuseBackupStamp) {
      const prior = await pool.request().input('file', sql.NVarChar(4000), backupPath).query(`
        SELECT TOP(1) b.database_name,b.has_backup_checksums,b.is_copy_only,b.backup_finish_date
        FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily f ON f.media_set_id=b.media_set_id
        WHERE f.physical_device_name=@file ORDER BY b.backup_finish_date DESC;
      `);
      const priorBackup = prior.recordset[0];
      const ageMs = priorBackup ? Date.now() - new Date(priorBackup.backup_finish_date).getTime() : Infinity;
      if (!priorBackup || priorBackup.database_name !== database || !priorBackup.has_backup_checksums ||
          !priorBackup.is_copy_only || ageMs < 0 || ageMs > 4 * 60 * 60 * 1000) {
        fail('Backup indicado falta, no es COPY_ONLY/CHECKSUM o supera 4 horas.');
      }
      await pool.request().query(`RESTORE VERIFYONLY FROM DISK=N'${backupPath}' WITH CHECKSUM;`);
    } else {
      const escapedBackupPath = backupPath.replaceAll("'", "''");
      await pool.request().query(`
        BACKUP DATABASE [IOEDESARROLLO] TO DISK=N'${escapedBackupPath}'
        WITH COPY_ONLY, INIT, CHECKSUM, COMPRESSION;
        RESTORE VERIFYONLY FROM DISK=N'${escapedBackupPath}' WITH CHECKSUM;
      `);
    }
    const backupResult = await pool.request().input('file', sql.NVarChar(4000), backupPath).query(`
      SELECT TOP(1) b.database_name,b.has_backup_checksums,b.is_copy_only,b.backup_finish_date
      FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily f ON f.media_set_id=b.media_set_id
      WHERE f.physical_device_name=@file ORDER BY b.backup_finish_date DESC;
    `);
    const backup = backupResult.recordset[0];
    if (!backup || backup.database_name !== database || !backup.has_backup_checksums || !backup.is_copy_only) {
      fail('No se pudo verificar backup COPY_ONLY/CHECKSUM de IOEDESARROLLO.');
    }
    const backupManifest = {
      target: `${host},${port}/${database}`,
      server: sqlServerName,
      fileOnSqlServer: backupPath,
      verified: true,
      hasBackupChecksums: true,
      copyOnly: true,
      reusedPriorBackup: Boolean(reuseBackupStamp),
      backupFinishUtc: backup.backup_finish_date,
      verifiedAtUtc: new Date().toISOString(),
    };
    writeEvidence('backup', backupManifest, runStamp);

    let ddl = fs.readFileSync(path.join(__dirname, '01_esquema.sql'), 'utf8').replace(/\r\n/g, '\n');
    const declaration = 'DECLARE @Aplicar bit=0,\n        @ServidorEsperado nvarchar(128)=NULL,';
    if (!ddl.includes(declaration)) fail('Guardas DDL no coinciden con versión esperada; DDL cancelado.');
    ddl = ddl.replace(declaration,
      `DECLARE @Aplicar bit=1,\n        @ServidorEsperado nvarchar(128)=N'${sqlServerName}',`);
    await pool.request().query(ddl);

    const post = await pool.request().query(`
      IF DB_NAME()<>N'${database}' OR @@SERVERNAME<>N'${sqlServerName}'
        THROW 53411,'Postflight en destino distinto.',1;
      SELECT @@SERVERNAME servidor,DB_NAME() base,
        (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL) entidades_fiscales,
        (SELECT COUNT_BIG(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL) vinculos_sucursal,
        (SELECT COUNT_BIG(*) FROM dbo.DAT_CAT_CTAS) cuentas_ioe,
        (SELECT COUNT_BIG(*) FROM dbo.DAT_CTRL_CTAS) movimientos_contables,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) mapeos,
        (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) auditorias,
        (SELECT COUNT(*) FROM sys.indexes WHERE object_id IN(OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'))
          AND name IN(N'PK_INT_ODOO_CTA_MAP',N'PK_INT_ODOO_CTA_MAP_AUDIT',N'UX_INT_ODOO_CTA_MAP_GLOBAL',N'UX_INT_ODOO_CTA_MAP_SUC',N'IX_INT_ODOO_CTA_MAP_RESOLVER',N'IX_INT_ODOO_CTA_MAP_AUDIT_MAPA')) indices_esperados,
        (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id IN(OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP'),OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT'))
          AND name IN(N'FK_INT_ODOO_CTA_MAP_ENTIDAD',N'FK_INT_ODOO_CTA_MAP_CTA',N'FK_INT_ODOO_CTA_MAP_SUC',N'FK_INT_ODOO_CTA_MAP_AUDIT_MAPA')) fks_esperadas;
    `);
    const result = post.recordset[0];
    const sourceCountsStable = ['entidades_fiscales','vinculos_sucursal','cuentas_ioe','movimientos_contables']
      .every((key) => Number(result[key]) === Number(counts[key])) &&
      result.servidor === sqlServerName && result.base === database;
    const schemaComplete = Number(result.indices_esperados) === 6 && Number(result.fks_esperadas) === 4 &&
      Number(result.mapeos) === 0 && Number(result.auditorias) === 0;
    const report = {
      status: sourceCountsStable && schemaComplete ? 'APLICADO' : 'APLICADO_REQUIERE_REVISION',
      target: `${host},${port}/${database}`,
      server: sqlServerName,
      backup: backupManifest,
      before: counts,
      after: result,
      sourceCountsStable,
      schemaComplete,
      productionChanged: false,
      odooChanged: false,
      timestampUtc: new Date().toISOString(),
    };
    const applicationFile = writeEvidence('aplicacion', report, runStamp);
    console.log(JSON.stringify({ ...report, evidence: applicationFile }));
    if (report.status !== 'APLICADO') process.exitCode = 2;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(String(error.message).replaceAll(env.DB_PASS || '__NO_SECRET__', '[REDACTED]'));
  process.exitCode = 1;
});
