/* Read-only readiness check for fiscal entities and branch links.
 * Reads FACT_CSD metadata only; never reads CER, LLAVE, or PAC credentials.
 * Output excludes RFC, legal name, postal address, and all secret values.
 */
const fs = require('node:fs');
const path = require('node:path');
const sql = require(path.resolve(__dirname, '../../node_modules/mssql'));
const dotenv = require(path.resolve(__dirname, '../../node_modules/dotenv'));

const repoRoot = path.resolve(__dirname, '../..');
const env = dotenv.parse(fs.readFileSync(path.join(repoRoot, '.env')));
const expected = {
  host: '172.16.100.40',
  port: 1434,
  database: 'IOEDESARROLLO',
  serverName: 'dd7842d7ba7e',
};

function fail(message) {
  throw new Error(message);
}

function bool(value) {
  return Number(value) === 1;
}

async function main() {
  if (
    env.DB_HOST !== expected.host ||
    Number(env.DB_PORT) !== expected.port ||
    env.DB_NAME !== expected.database
  ) {
    fail('DB_HOST/DB_PORT/DB_NAME no coinciden con IOEDESARROLLO autorizado.');
  }

  const pool = await new sql.ConnectionPool({
    server: env.DB_HOST,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASS,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 10000,
    requestTimeout: 20000,
  }).connect();

  try {
    const target = (await pool.request().query(`
      SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) serverName,
        DB_NAME() databaseName,d.state_desc state,d.is_read_only isReadOnly
      FROM sys.databases d WHERE d.name=DB_NAME();
    `)).recordset[0];
    if (
      target?.serverName !== expected.serverName ||
      target?.databaseName !== expected.database ||
      target?.state !== 'ONLINE' ||
      target?.isReadOnly !== false
    ) {
      fail('Identidad/estado de servidor o base inesperados; consulta abortada.');
    }

    const entities = (await pool.request().query(`
      SELECT e.ID_ENTIDAD_FISCAL entityId,e.ESTADO_VALIDACION status,
        CASE WHEN NULLIF(LTRIM(RTRIM(e.NOMBRE_LEGAL)),N'') IS NULL THEN 0 ELSE 1 END hasLegalName,
        CASE WHEN NULLIF(LTRIM(RTRIM(e.REGIMEN_FISCAL)),N'') IS NULL THEN 0 ELSE 1 END hasTaxRegime,
        CASE WHEN e.CP_FISCAL LIKE '[0-9][0-9][0-9][0-9][0-9]' THEN 1 ELSE 0 END hasPostalCode,
        CASE WHEN NULLIF(LTRIM(RTRIM(e.DOMICILIO_FISCAL)),N'') IS NULL THEN 0 ELSE 1 END hasFiscalAddress,
        CASE WHEN NULLIF(LTRIM(RTRIM(e.REFERENCIA_VALIDACION)),N'') IS NULL THEN 0 ELSE 1 END hasValidationReference,
        CASE WHEN NULLIF(LTRIM(RTRIM(e.VALIDADO_POR)),N'') IS NULL THEN 0 ELSE 1 END hasValidator,
        CASE WHEN e.FCN_VALIDACION_UTC IS NULL THEN 0 ELSE 1 END hasValidationTimestamp,
        cs.csdCount,nm.nameMatches,rg.regimeMatches,pc.postalMatches
      FROM dbo.ENTIDAD_FISCAL e
      OUTER APPLY(
        SELECT COUNT_BIG(*) csdCount
        FROM dbo.FACT_CSD c
        WHERE UPPER(LTRIM(RTRIM(c.RFC)))=UPPER(LTRIM(RTRIM(e.RFC)))
          AND c.ACTIVO=1 AND c.VIGENCIA_DESDE<=SYSUTCDATETIME()
          AND c.VIGENCIA_HASTA>=SYSUTCDATETIME()
      ) cs
      OUTER APPLY(
        SELECT COUNT_BIG(*) nameMatches FROM dbo.FACT_CSD c
        WHERE UPPER(LTRIM(RTRIM(c.RFC)))=UPPER(LTRIM(RTRIM(e.RFC)))
          AND c.ACTIVO=1 AND c.VIGENCIA_DESDE<=SYSUTCDATETIME()
          AND c.VIGENCIA_HASTA>=SYSUTCDATETIME()
          AND UPPER(LTRIM(RTRIM(c.NOMBRE)))=UPPER(LTRIM(RTRIM(e.NOMBRE_LEGAL)))
      ) nm
      OUTER APPLY(
        SELECT COUNT_BIG(*) regimeMatches FROM dbo.FACT_CSD c
        WHERE UPPER(LTRIM(RTRIM(c.RFC)))=UPPER(LTRIM(RTRIM(e.RFC)))
          AND c.ACTIVO=1 AND c.VIGENCIA_DESDE<=SYSUTCDATETIME()
          AND c.VIGENCIA_HASTA>=SYSUTCDATETIME()
          AND LTRIM(RTRIM(c.REGIMEN_FISCAL))=LTRIM(RTRIM(e.REGIMEN_FISCAL))
      ) rg
      OUTER APPLY(
        SELECT COUNT_BIG(*) postalMatches FROM dbo.FACT_CSD c
        WHERE UPPER(LTRIM(RTRIM(c.RFC)))=UPPER(LTRIM(RTRIM(e.RFC)))
          AND c.ACTIVO=1 AND c.VIGENCIA_DESDE<=SYSUTCDATETIME()
          AND c.VIGENCIA_HASTA>=SYSUTCDATETIME()
          AND LTRIM(RTRIM(c.CODIGO_POSTAL))=LTRIM(RTRIM(e.CP_FISCAL))
      ) pc
      ORDER BY e.ID_ENTIDAD_FISCAL;
    `)).recordset.map((row) => ({
      entityId: Number(row.entityId),
      status: row.status,
      hasLegalName: bool(row.hasLegalName),
      hasTaxRegime: bool(row.hasTaxRegime),
      hasPostalCode: bool(row.hasPostalCode),
      hasFiscalAddress: bool(row.hasFiscalAddress),
      hasValidationReference: bool(row.hasValidationReference),
      hasValidator: bool(row.hasValidator),
      hasValidationTimestamp: bool(row.hasValidationTimestamp),
      activeCurrentCsdCount: Number(row.csdCount),
      nameMatchesCsd: bool(row.nameMatches),
      taxRegimeMatchesCsd: bool(row.regimeMatches),
      postalCodeMatchesCsd: bool(row.postalMatches),
    }));

    const links = (await pool.request().query(`
      SELECT r.ID_RELACION relationId,r.ID_ENTIDAD_FISCAL entityId,r.SUC branch,
        r.ESTADO_VALIDACION status,
        CASE WHEN r.VIGENTE_DESDE IS NULL THEN 0 ELSE 1 END hasStartDate,
        CASE WHEN r.VIGENTE_HASTA IS NULL THEN 0 ELSE 1 END hasEndDate,
        CASE WHEN NULLIF(LTRIM(RTRIM(r.REFERENCIA_VALIDACION)),N'') IS NULL THEN 0 ELSE 1 END hasValidationReference,
        CASE WHEN s.SUC IS NOT NULL AND UPPER(LTRIM(RTRIM(s.RFC)))=UPPER(LTRIM(RTRIM(e.RFC))) THEN 1 ELSE 0 END branchRfcMatchesEntity,
        (SELECT COUNT_BIG(*) FROM dbo.FACT_CSD c
          WHERE UPPER(LTRIM(RTRIM(c.RFC)))=UPPER(LTRIM(RTRIM(s.RFC)))
            AND c.ACTIVO=1 AND c.VIGENCIA_DESDE<=SYSUTCDATETIME()
            AND c.VIGENCIA_HASTA>=SYSUTCDATETIME()) activeCurrentCsdCountForBranch
      FROM dbo.ENTIDAD_FISCAL_SUCURSAL r
      JOIN dbo.ENTIDAD_FISCAL e ON e.ID_ENTIDAD_FISCAL=r.ID_ENTIDAD_FISCAL
      LEFT JOIN dbo.DAT_SUC s ON s.SUC=r.SUC
      ORDER BY r.ID_ENTIDAD_FISCAL,r.SUC,r.ID_RELACION;
    `)).recordset.map((row) => ({
      relationId: Number(row.relationId),
      entityId: Number(row.entityId),
      branch: row.branch,
      status: row.status,
      hasStartDate: bool(row.hasStartDate),
      hasEndDate: bool(row.hasEndDate),
      hasValidationReference: bool(row.hasValidationReference),
      branchRfcMatchesEntity: bool(row.branchRfcMatchesEntity),
      activeCurrentCsdCountForBranch: Number(row.activeCurrentCsdCountForBranch),
    }));
    const sourceBranchDateColumns = (await pool.request().query(`
      SELECT c.name columnName
      FROM sys.columns c
      JOIN sys.types t ON t.user_type_id=c.user_type_id
      WHERE c.object_id=OBJECT_ID(N'dbo.DAT_SUC')
        AND t.name IN(N'date',N'datetime',N'datetime2',N'smalldatetime',N'datetimeoffset')
      ORDER BY c.column_id;
    `)).recordset.map((row) => row.columnName);

    const result = {
      mode: 'READ_ONLY_PREFLIGHT',
      target: {
        serverName: target.serverName,
        databaseName: target.databaseName,
        state: target.state,
        isReadOnly: target.isReadOnly,
      },
      totals: {
        entities: entities.length,
        validatedEntities: entities.filter((row) => row.status === 'VALIDADA').length,
        branchLinks: links.length,
        validatedBranchLinks: links.filter((row) => row.status === 'VALIDADA').length,
      },
      sourceBranchDateColumns,
      entities,
      links,
      limitations: [
        'FACT_CSD consulta solo metadatos RFC/propietario/regimen/CP/estado/vigencia; CER, LLAVE y credenciales PAC no se consultan.',
        'Cotejo técnico contra datos fuente no sustituye constancia fiscal ni aprobación de vigencias por entidad/sucursal.',
        'No se modificó SQL, Odoo, expedientes ni estados de validación.',
      ],
      writes: 0,
    };
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const evidenceDir = path.resolve(repoRoot, '../outputs/odoo_fiscal_preflight_dev');
    fs.mkdirSync(evidenceDir, { recursive: true });
    const evidenceFile = path.join(evidenceDir, `preflight_${stamp}.json`);
    fs.writeFileSync(evidenceFile, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ...result, evidenceFile }, null, 2)}\n`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  const safe = String(error?.message ?? error)
    .replaceAll(env.DB_PASS || '__NO_DB_PASS__', '[REDACTED]')
    .replaceAll(env.API_ODOO || '__NO_ODOO_KEY__', '[REDACTED]');
  process.stderr.write(`${safe}\n`);
  process.exitCode = 1;
});
