/*
 * Default mode is read-only preflight. --apply is pinned to IOEDESARROLLO,
 * takes and verifies fresh COPY_ONLY backup, then applies additive schema/seed.
 * Never reads SQL credentials from output or changes .env.
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
const evidenceDir = path.resolve(
  __dirname,
  '../../../outputs/integracion_entidades_fiscales_dev_20261021',
);
const candidateSql = `
WITH SourceRfc AS (
  SELECT DISTINCT UPPER(LTRIM(RTRIM(RFC))) RFC
  FROM dbo.DAT_SUC WHERE NULLIF(LTRIM(RTRIM(RFC)),N'') IS NOT NULL
), Candidate AS (
  SELECT RFC FROM SourceRfc WHERE LEN(RFC)=13
    AND RFC COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-Z0-9Ñ&]%'
    AND SUBSTRING(RFC,1,4) COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-ZÑ&]%'
    AND SUBSTRING(RFC,5,6) COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^0-9]%'
    AND SUBSTRING(RFC,11,3) COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-Z0-9]%'
    AND RFC NOT IN(N'CAMBIO',N'XAXX010101000',N'XEXX010101000')
)
SELECT (SELECT COUNT(*) FROM dbo.DAT_SUC) sucursales,
  (SELECT COUNT(*) FROM dbo.EMPRESA) empresas_operativas,
  (SELECT COUNT(*) FROM dbo.DAT_CTRL_CTAS) movimientos_contables,
  (SELECT COUNT(*) FROM SourceRfc) rfc_distintos_no_vacios,
  (SELECT COUNT(*) FROM Candidate) candidatos_rfc_fisica,
  (SELECT COUNT(*) FROM dbo.DAT_SUC s JOIN Candidate c ON c.RFC=UPPER(LTRIM(RTRIM(s.RFC)))) sucursales_candidatas,
  (SELECT COUNT(*) FROM dbo.DAT_SUC WHERE UPPER(LTRIM(RTRIM(RFC)))=N'CAMBIO') placeholders_cambio,
  (SELECT COUNT(*) FROM dbo.DAT_SUC WHERE RFC IS NULL OR LTRIM(RTRIM(RFC))=N'') rfc_vacio,
  (SELECT COUNT(*) FROM dbo.DAT_SUC WHERE DIRECCION IS NULL OR LTRIM(RTRIM(DIRECCION))=N'') domicilios_sucursal_vacios;
`;

function fail(message) {
  const safe = String(message).replaceAll(env.DB_PASS || '__NONE__', '[REDACTED]');
  throw new Error(safe);
}

async function main() {
  if (env.DB_HOST !== host || Number(env.DB_PORT) !== port) {
    fail('DB_HOST/DB_PORT no corresponden al destino autorizado; conexión cancelada.');
  }

  const pool = await new sql.ConnectionPool({
    server: host,
    port,
    database,
    user: env.DB_USER,
    password: env.DB_PASS,
    requestTimeout: 60000,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      appName: 'DEV_ENTIDADES_FISCALES_INSTALL',
    },
  }).connect();

  try {
    const target = await pool.request().query(`
      IF DB_NAME()<>N'${database}' OR @@SERVERNAME<>N'${sqlServerName}'
        THROW 53310,'Destino no autorizado; no se continua.',1;
      SELECT @@SERVERNAME servidor, DB_NAME() base,
        HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','BACKUP DATABASE') puede_respaldar;
      SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo')
        AND name IN('ENTIDAD_FISCAL','ENTIDAD_FISCAL_SUCURSAL','ENTIDAD_FISCAL_AUDIT');
      SELECT OBJECT_NAME(c.object_id) tabla,c.name columna,t.name tipo,c.max_length,c.is_nullable
        FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id
        WHERE c.object_id IN(OBJECT_ID('dbo.ENTIDAD_FISCAL'),OBJECT_ID('dbo.ENTIDAD_FISCAL_SUCURSAL'),OBJECT_ID('dbo.ENTIDAD_FISCAL_AUDIT'));
    `);
    const identity = target.recordsets[0][0];
    if (identity.servidor !== sqlServerName || identity.base !== database) {
      fail('El servidor/base devueltos no coinciden con la whitelist.');
    }

    const names = new Set(target.recordsets[1].map((row) => row.name));
    const existingCount = names.size;
    if (existingCount !== 0 && existingCount !== 3) {
      fail('Esquema fiscal parcial; no se modificara. Revisar con plan de delta.');
    }
    if (existingCount === 3) {
      const expected = new Map([
        ['ENTIDAD_FISCAL', ['ID_ENTIDAD_FISCAL', 'RFC', 'TIPO_PERSONA', 'NOMBRE_LEGAL', 'ESTADO_VALIDACION', 'VERSION']],
        ['ENTIDAD_FISCAL_SUCURSAL', ['ID_RELACION', 'ID_ENTIDAD_FISCAL', 'SUC', 'VIGENTE_DESDE', 'ESTADO_VALIDACION', 'VERSION']],
        ['ENTIDAD_FISCAL_AUDIT', ['ID_AUDIT', 'ID_ENTIDAD_FISCAL', 'ID_RELACION', 'ACCION', 'CAMPOS_JSON', 'ACTOR']],
      ]);
      for (const [table, columns] of expected) {
        const found = new Set(target.recordsets[2].filter((x) => x.tabla === table).map((x) => x.columna));
        if (columns.some((column) => !found.has(column))) fail(`Esquema ${table} no coincide; no se modificara.`);
      }
    }

    const dataResult = await pool.request().query(candidateSql);
    const counts = dataResult.recordset[0];
    const preflight = {
      target: `${host},${port}/${database}`,
      server: sqlServerName,
      schema: existingCount === 0 ? 'AUSENTE' : 'PRESENTE_VALIDADO',
      entityCounts: counts,
      backupPermission: Boolean(identity.puede_respaldar),
      applyRequested: apply,
      timestampUtc: new Date().toISOString(),
    };
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'preflight.json'), `${JSON.stringify(preflight, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(preflight));
    if (!apply) return;
    if (!identity.puede_respaldar) fail('La identidad SQL no tiene permiso de backup; no se aplico DDL.');

    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const backupPath = `/var/opt/mssql/data/IOEDESARROLLO_pre_entidades_fiscales_${stamp}.bak`;
    const escapedBackupPath = backupPath.replaceAll("'", "''");
    await pool.request().query(`
      BACKUP DATABASE [IOEDESARROLLO] TO DISK=N'${escapedBackupPath}'
      WITH COPY_ONLY, INIT, CHECKSUM, COMPRESSION, STATS=5;
      RESTORE VERIFYONLY FROM DISK=N'${escapedBackupPath}' WITH CHECKSUM;
    `);
    const verify = await pool.request().input('file', sql.NVarChar(4000), backupPath).query(`
      SELECT TOP(1) b.database_name,b.has_backup_checksums,b.is_copy_only,b.backup_finish_date
      FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily f ON f.media_set_id=b.media_set_id
      WHERE f.physical_device_name=@file ORDER BY b.backup_finish_date DESC;
    `);
    const backup = verify.recordset[0];
    if (!backup || backup.database_name !== database || !backup.has_backup_checksums || !backup.is_copy_only) {
      fail('No se pudo comprobar backup CHECKSUM/COPY_ONLY de IOEDESARROLLO.');
    }
    const backupManifest = {
      target: `${host},${port}/${database}`,
      server: sqlServerName,
      fileOnSqlServer: backupPath,
      verified: true,
      hasBackupChecksums: true,
      copyOnly: true,
      backupFinishUtc: backup.backup_finish_date,
      verifiedAtUtc: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(evidenceDir, 'backup.json'), `${JSON.stringify(backupManifest, null, 2)}\n`, { mode: 0o600 });

    let ddl = fs.readFileSync(path.join(__dirname, '01_esquema.sql'), 'utf8').replace(/\r\n/g, '\n');
    const declaration = 'DECLARE @Aplicar bit=0,\n        @ServidorEsperado nvarchar(128)=NULL,';
    if (!ddl.includes(declaration)) fail('No se localizaron las guardas exactas del DDL; revisar antes de aplicar.');
    ddl = ddl.replace(declaration, `DECLARE @Aplicar bit=1,\n        @ServidorEsperado nvarchar(128)=N'${sqlServerName}',`);
    const applied = await pool.request().query(ddl);
    const post = await pool.request().query(`
      SELECT @@SERVERNAME servidor,DB_NAME() base,
        (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL) entidades,
        (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL) vinculos,
        (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL WHERE ESTADO_VALIDACION='PENDIENTE') entidades_pendientes,
        (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL WHERE ESTADO_VALIDACION='PENDIENTE') vinculos_pendientes,
        (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL WHERE NOMBRE_LEGAL IS NULL) pendientes_nombre_legal,
        (SELECT COUNT(*) FROM dbo.DAT_SUC) sucursales,
        (SELECT COUNT(*) FROM dbo.EMPRESA) empresas_operativas,
        (SELECT COUNT(*) FROM dbo.DAT_CTRL_CTAS) movimientos_contables,
        (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL_AUDIT) auditorias;
    `);
    const result = post.recordset[0];
    const sourceCountsStable =
      result.servidor === sqlServerName &&
      result.base === database &&
      Number(result.sucursales) === Number(counts.sucursales) &&
      Number(result.empresas_operativas) === Number(counts.empresas_operativas) &&
      Number(result.movimientos_contables) === Number(counts.movimientos_contables);
    const report = {
      status: sourceCountsStable ? 'APLICADO' : 'APLICADO_REQUIERE_REVISION',
      target: `${host},${port}/${database}`,
      server: sqlServerName,
      backup: backupManifest,
      before: counts,
      after: result,
      sourceCountsStable,
      ddlBatchCount: applied.recordsets.length,
      timestampUtc: new Date().toISOString(),
      productionChanged: false,
    };
    fs.writeFileSync(path.join(evidenceDir, 'aplicacion.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(String(error.message).replaceAll(env.DB_PASS || '__NONE__', '[REDACTED]'));
  process.exitCode = 1;
});
