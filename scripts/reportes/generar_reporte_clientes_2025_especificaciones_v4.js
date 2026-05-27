const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const XLSX = require('xlsx');

const START_DATE = '2025-01-01';
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', '..', 'reportes');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'reporte_clientes_2025_a_hoy_especificaciones_v4.xlsx');

const dbConfig = {
  user: 'sa',
  password: 'Cambio.2019',
  server: '192.168.10.234',
  database: 'IOELOCAL',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const queries = {
  FormasPagoCliente: `
    WITH base_formas AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(a.SUC, 'SIN_SUC')))) AS SUC,
        MONTH(CAST(a.FCNM AS DATE)) AS MES,
        YEAR(CAST(a.FCNM AS DATE)) AS [AÑO],
        CAST(a.CLIEN AS BIGINT) AS CLIENTE,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS [NOMBRE DEL CLIENTE],
        a.IDFOL,
        UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA')))) AS FORM,
        CAST(ISNULL(f.IMPD, 0) AS DECIMAL(18,2)) AS IMPD
      FROM dbo.PV_CTR_FOL_ASVR a
      INNER JOIN dbo.PV_CTR_FOL_FORM f ON f.IDFOL = a.IDFOL
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN ('CA', 'VF', 'DF', 'DVF', 'DCA', 'DA', 'DP', 'APDF')
    )
    SELECT
      SUC,
      MES,
      [AÑO],
      CLIENTE,
      [NOMBRE DEL CLIENTE],
      COUNT(DISTINCT IDFOL) AS [CANTIDAD DE FOLIOS],
      SUM(CASE WHEN FORM = 'EFECTIVO' THEN IMPD ELSE 0 END) AS EFECTIVO,
      SUM(CASE WHEN FORM = 'TARJETA' THEN IMPD ELSE 0 END) AS TARJETA,
      SUM(CASE WHEN FORM = 'TRANSFERENCIA' THEN IMPD ELSE 0 END) AS TRANSFERENCIA,
      SUM(CASE WHEN FORM = 'DEPOSITO 3RO' THEN IMPD ELSE 0 END) AS [DEPOSITO 3RO],
      SUM(CASE WHEN FORM = 'CREDITO' THEN IMPD ELSE 0 END) AS CREDITO,
      SUM(CASE WHEN FORM = 'CHEQUE' THEN IMPD ELSE 0 END) AS CHEQUE
    FROM base_formas
    GROUP BY SUC, MES, [AÑO], CLIENTE, [NOMBRE DEL CLIENTE]
    ORDER BY [AÑO], MES, SUC, [NOMBRE DEL CLIENTE];
  `,

  FacturanNoFacturan: `
    WITH base_fact AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(a.SUC, 'SIN_SUC')))) AS SUC,
        CAST(a.CLIEN AS BIGINT) AS CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        CAST(ISNULL(a.REQF, 0) AS INT) AS REQF
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN ('CA', 'VF')
    )
    SELECT
      SUC,
      CLIEN,
      cliente,
      CASE
        WHEN SUM(CASE WHEN REQF = 1 THEN 1 ELSE 0 END) > 0
         AND SUM(CASE WHEN REQF = 0 THEN 1 ELSE 0 END) > 0 THEN 'MIXTO'
        WHEN SUM(CASE WHEN REQF = 1 THEN 1 ELSE 0 END) > 0 THEN 'FACTURA'
        ELSE 'NO_FACTURA'
      END AS clasificacion
    FROM base_fact
    GROUP BY SUC, CLIEN, cliente
    ORDER BY SUC, clasificacion DESC, cliente;
  `,

  TopCotAbiertas: `
    WITH filtro_fecha AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(a.SUC, 'SIN_SUC')))) AS SUC,
        CAST(a.CLIEN AS BIGINT) AS CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        a.IDFOL,
        CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS IMPT,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
    )
    SELECT
      SUC,
      CLIEN,
      cliente,
      COUNT(IDFOL) AS NTRAN,
      SUM(IMPT) AS SumaDeIMPT,
      AUT
    FROM filtro_fecha
    GROUP BY SUC, CLIEN, cliente, AUT
    HAVING AUT IN ('CA', 'DCA')
    ORDER BY SUC, CLIEN, AUT;
  `,

  TopVentasFinalizadas: `
    WITH filtro_fecha AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(a.SUC, 'SIN_SUC')))) AS SUC,
        CAST(a.CLIEN AS BIGINT) AS CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        a.IDFOL,
        CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS IMPT,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
    )
    SELECT
      SUC,
      CLIEN,
      cliente,
      COUNT(IDFOL) AS NTRAN,
      SUM(IMPT) AS SumaDeIMPT,
      AUT
    FROM filtro_fecha
    GROUP BY SUC, CLIEN, cliente, AUT
    HAVING AUT IN ('VF', 'DVF')
    ORDER BY SUC, CLIEN, AUT;
  `,

  CreditosMesForma: `
    WITH T AS (
      SELECT DISTINCT
        IDFOL,
        UPC
      FROM dbo.PV_TICKET_LOG
      WHERE UPC LIKE 'CR%'
    )
    SELECT
      YEAR(A.FCN)  AS ANIO,
      MONTH(A.FCN) AS MES,
      T.UPC,
      SUM(CASE WHEN F.FORM = 'CHEQUE'        THEN ISNULL(F.IMPD, 0) ELSE 0 END) AS CHEQUE,
      SUM(CASE WHEN F.FORM = 'CREDITO'       THEN ISNULL(F.IMPD, 0) ELSE 0 END) AS CREDITO,
      SUM(CASE WHEN F.FORM = 'DEPOSITO 3RO'  THEN ISNULL(F.IMPD, 0) ELSE 0 END) AS [DEPOSITO 3RO],
      SUM(CASE WHEN F.FORM = 'EFECTIVO'      THEN ISNULL(F.IMPD, 0) ELSE 0 END) AS EFECTIVO,
      SUM(CASE WHEN F.FORM = 'TARJETA'       THEN ISNULL(F.IMPD, 0) ELSE 0 END) AS TARJETA,
      SUM(CASE WHEN F.FORM = 'TRANSFERENCIA' THEN ISNULL(F.IMPD, 0) ELSE 0 END) AS TRANSFERENCIA
    FROM T
    INNER JOIN dbo.PV_CTR_FOL_FORM AS F ON F.IDFOL = T.IDFOL
    INNER JOIN dbo.PV_CTR_FOL_ASVR AS A ON A.IDFOL = T.IDFOL
    WHERE A.FCN >= @fecha_inicio
      AND A.FCN < DATEADD(DAY, 1, CAST(GETDATE() AS date))
    GROUP BY YEAR(A.FCN), MONTH(A.FCN), T.UPC
    ORDER BY ANIO, MES, T.UPC;
  `,
};

function autosizeColumns(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((h) => {
    const max = Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length));
    return { wch: Math.min(Math.max(max + 2, 10), 45) };
  });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pool = await sql.connect(dbConfig);
  try {
    const wb = XLSX.utils.book_new();
    const meta = [{
      fecha_inicio: START_DATE,
      fecha_fin: new Date().toISOString().slice(0, 10),
      servidor: dbConfig.server,
      base_datos: dbConfig.database,
      version: 'v4_creditos_query_usuario',
    }];
    const wsMeta = XLSX.utils.json_to_sheet(meta);
    wsMeta['!cols'] = autosizeColumns(meta);
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Parametros');

    for (const [sheetName, query] of Object.entries(queries)) {
      const req = pool.request();
      req.input('fecha_inicio', sql.Date, START_DATE);
      const rs = await req.query(query);
      const rows = rs.recordset || [];
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = autosizeColumns(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      console.log(`${sheetName}: ${rows.length} filas`);
    }

    XLSX.writeFile(wb, OUTPUT_FILE);
    console.log(`Archivo generado: ${OUTPUT_FILE}`);
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
