const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const XLSX = require('xlsx');

const START_DATE = '2025-01-01';
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', '..', 'reportes');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'reporte_clientes_2025_a_hoy.xlsx');

const dbConfig = {
  user: 'sa',
  password: 'Cambio.2019',
  server: '192.168.10.234',
  database: 'IOELOCAL',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

function baseDateFilter(alias = 'a', field = 'FCNM') {
  return `CAST(${alias}.${field} AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)`;
}

const queries = {
  formasPagoPorCliente: `
    WITH base_formas AS (
      SELECT
        a.IDFOL,
        a.CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA')))) AS forma_pago,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS aut,
        CAST(ISNULL(f.IMPD, 0) AS DECIMAL(18,2)) AS impd
      FROM dbo.PV_CTR_FOL_ASVR a
      INNER JOIN dbo.PV_CTR_FOL_FORM f ON f.IDFOL = a.IDFOL
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE ${baseDateFilter('a', 'FCNM')}
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN ('CA', 'VF', 'DF', 'DVF', 'DCA', 'DA', 'DP', 'APDF')
    )
    SELECT
      CLIEN,
      cliente,
      forma_pago,
      COUNT(DISTINCT IDFOL) AS folios,
      SUM(CASE WHEN aut IN ('CA', 'VF') THEN impd ELSE 0 END) AS ventas_importe,
      SUM(CASE WHEN aut IN ('DF', 'DVF', 'DCA', 'DA', 'DP', 'APDF') THEN ABS(impd) ELSE 0 END) AS devoluciones_importe,
      SUM(impd) AS neto_importe
    FROM base_formas
    GROUP BY CLIEN, cliente, forma_pago
    ORDER BY cliente, forma_pago;
  `,

  clientesFacturanNoFacturan: `
    WITH base_ventas AS (
      SELECT
        a.IDFOL,
        a.CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        CAST(ISNULL(a.REQF, 0) AS INT) AS reqf,
        CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS impt
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE ${baseDateFilter('a', 'FCNM')}
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN ('CA', 'VF')
    )
    SELECT
      CLIEN,
      cliente,
      COUNT(DISTINCT IDFOL) AS folios_venta,
      SUM(CASE WHEN reqf = 1 THEN 1 ELSE 0 END) AS folios_factura,
      SUM(CASE WHEN reqf = 0 THEN 1 ELSE 0 END) AS folios_no_factura,
      SUM(CASE WHEN reqf = 1 THEN impt ELSE 0 END) AS importe_factura,
      SUM(CASE WHEN reqf = 0 THEN impt ELSE 0 END) AS importe_no_factura,
      CASE WHEN SUM(CASE WHEN reqf = 1 THEN 1 ELSE 0 END) > 0 THEN 'FACTURA' ELSE 'NO_FACTURA' END AS clasificacion
    FROM base_ventas
    GROUP BY CLIEN, cliente
    ORDER BY clasificacion DESC, importe_factura DESC, importe_no_factura DESC;
  `,

  topCotizacionesAbiertas: `
    WITH cot_abiertas AS (
      SELECT
        a.IDFOL,
        a.CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS impt
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE ${baseDateFilter('a', 'FCNM')}
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN ('CP', 'CPF')
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) = 'PENDIENTE'
    )
    SELECT TOP 30
      CLIEN,
      cliente,
      COUNT(DISTINCT IDFOL) AS cotizaciones_abiertas,
      SUM(impt) AS importe_cotizaciones_abiertas
    FROM cot_abiertas
    GROUP BY CLIEN, cliente
    ORDER BY importe_cotizaciones_abiertas DESC, cotizaciones_abiertas DESC;
  `,

  topVentasFinalizadasNeto: `
    WITH movimientos AS (
      SELECT
        a.CLIEN,
        ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS aut,
        CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS impt
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE ${baseDateFilter('a', 'FCNM')}
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) NOT IN ('ANULADA', 'ANULADO', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN ('CA', 'VF', 'DF', 'DVF', 'DCA', 'DA', 'DP', 'APDF')
    )
    SELECT TOP 30
      CLIEN,
      cliente,
      SUM(CASE WHEN aut IN ('CA', 'VF') THEN ABS(impt) ELSE 0 END) AS ventas_brutas,
      SUM(CASE WHEN aut IN ('DF', 'DVF', 'DCA', 'DA', 'DP', 'APDF') THEN ABS(impt) ELSE 0 END) AS devoluciones,
      SUM(CASE WHEN aut IN ('CA', 'VF') THEN ABS(impt) ELSE -ABS(impt) END) AS neto_ventas
    FROM movimientos
    GROUP BY CLIEN, cliente
    ORDER BY neto_ventas DESC;
  `,

  creditosMesForma: `
    WITH abonos_credito AS (
      SELECT
        c.NDOC,
        c.CLIENT,
        ISNULL(cli.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        CAST(c.FCND AS DATE) AS fecha_abono,
        FORMAT(CAST(c.FCND AS DATE), 'yyyy-MM') AS periodo,
        CAST(ISNULL(c.IMPT, 0) AS DECIMAL(18,2)) AS importe_abono,
        UPPER(LTRIM(RTRIM(ISNULL(c.IDFOL, '')))) AS folio_credito,
        UPPER(LTRIM(RTRIM(
          CASE
            WHEN CHARINDEX('ticket', LOWER(ISNULL(c.RTXT, ''))) > 0 THEN
              LEFT(
                LTRIM(RTRIM(SUBSTRING(
                  ISNULL(c.RTXT, ''),
                  CHARINDEX('ticket', LOWER(ISNULL(c.RTXT, ''))) + LEN('ticket'),
                  255
                ))),
                CHARINDEX(' ', LTRIM(RTRIM(SUBSTRING(
                  ISNULL(c.RTXT, ''),
                  CHARINDEX('ticket', LOWER(ISNULL(c.RTXT, ''))) + LEN('ticket'),
                  255
                ))) + ' ') - 1
              )
            ELSE ''
          END
        ))) AS folio_pago
      FROM dbo.DAT_CTRL_CTAS c
      LEFT JOIN dbo.FACT_CLIENT_SHP cli ON cli.IDC = c.CLIENT
      WHERE CAST(c.FCND AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)
        AND UPPER(LTRIM(RTRIM(ISNULL(c.CTA, '')))) = '101001002'
        AND UPPER(LTRIM(RTRIM(ISNULL(c.CLSD, '')))) = '601'
        AND ISNULL(c.IMPT, 0) > 0
    ),
    formas_pago_folio AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) AS folio_pago,
        UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA')))) AS forma_pago,
        SUM(ABS(CAST(ISNULL(f.IMPD, 0) AS DECIMAL(18,2)))) AS importe_forma
      FROM dbo.PV_CTR_FOL_FORM f
      GROUP BY UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))), UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA'))))
    ),
    total_formas_folio AS (
      SELECT folio_pago, SUM(importe_forma) AS total_formas
      FROM formas_pago_folio
      GROUP BY folio_pago
    ),
    prorrateo AS (
      SELECT
        a.periodo,
        a.CLIENT,
        a.cliente,
        a.folio_credito,
        a.folio_pago,
        COALESCE(fp.forma_pago, 'SIN_FORMA') AS forma_pago,
        CAST(
          CASE
            WHEN tf.total_formas IS NULL OR tf.total_formas = 0 OR fp.importe_forma IS NULL THEN a.importe_abono
            ELSE a.importe_abono * (fp.importe_forma / tf.total_formas)
          END AS DECIMAL(18,2)
        ) AS importe_liquidado
      FROM abonos_credito a
      LEFT JOIN formas_pago_folio fp ON fp.folio_pago = a.folio_pago
      LEFT JOIN total_formas_folio tf ON tf.folio_pago = a.folio_pago
    )
    SELECT
      periodo,
      forma_pago,
      COUNT(*) AS movimientos,
      SUM(importe_liquidado) AS importe_liquidado
    FROM prorrateo
    GROUP BY periodo, forma_pago
    ORDER BY periodo, forma_pago;
  `,

  creditosDetalle: `
    WITH abonos_credito AS (
      SELECT
        c.NDOC,
        c.CLIENT,
        ISNULL(cli.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
        CAST(c.FCND AS DATE) AS fecha_abono,
        FORMAT(CAST(c.FCND AS DATE), 'yyyy-MM') AS periodo,
        CAST(ISNULL(c.IMPT, 0) AS DECIMAL(18,2)) AS importe_abono,
        UPPER(LTRIM(RTRIM(ISNULL(c.IDFOL, '')))) AS folio_credito,
        UPPER(LTRIM(RTRIM(
          CASE
            WHEN CHARINDEX('ticket', LOWER(ISNULL(c.RTXT, ''))) > 0 THEN
              LEFT(
                LTRIM(RTRIM(SUBSTRING(
                  ISNULL(c.RTXT, ''),
                  CHARINDEX('ticket', LOWER(ISNULL(c.RTXT, ''))) + LEN('ticket'),
                  255
                ))),
                CHARINDEX(' ', LTRIM(RTRIM(SUBSTRING(
                  ISNULL(c.RTXT, ''),
                  CHARINDEX('ticket', LOWER(ISNULL(c.RTXT, ''))) + LEN('ticket'),
                  255
                ))) + ' ') - 1
              )
            ELSE ''
          END
        ))) AS folio_pago
      FROM dbo.DAT_CTRL_CTAS c
      LEFT JOIN dbo.FACT_CLIENT_SHP cli ON cli.IDC = c.CLIENT
      WHERE CAST(c.FCND AS DATE) BETWEEN @fecha_inicio AND CAST(GETDATE() AS DATE)
        AND UPPER(LTRIM(RTRIM(ISNULL(c.CTA, '')))) = '101001002'
        AND UPPER(LTRIM(RTRIM(ISNULL(c.CLSD, '')))) = '601'
        AND ISNULL(c.IMPT, 0) > 0
    ),
    formas_pago_folio AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) AS folio_pago,
        UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA')))) AS forma_pago,
        SUM(ABS(CAST(ISNULL(f.IMPD, 0) AS DECIMAL(18,2)))) AS importe_forma
      FROM dbo.PV_CTR_FOL_FORM f
      GROUP BY UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))), UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA'))))
    ),
    total_formas_folio AS (
      SELECT folio_pago, SUM(importe_forma) AS total_formas
      FROM formas_pago_folio
      GROUP BY folio_pago
    )
    SELECT
      a.periodo,
      a.fecha_abono,
      a.CLIENT,
      a.cliente,
      a.folio_credito,
      a.folio_pago,
      COALESCE(fp.forma_pago, 'SIN_FORMA') AS forma_pago,
      a.importe_abono,
      CAST(
        CASE
          WHEN tf.total_formas IS NULL OR tf.total_formas = 0 OR fp.importe_forma IS NULL THEN a.importe_abono
          ELSE a.importe_abono * (fp.importe_forma / tf.total_formas)
        END AS DECIMAL(18,2)
      ) AS importe_liquidado
    FROM abonos_credito a
    LEFT JOIN formas_pago_folio fp ON fp.folio_pago = a.folio_pago
    LEFT JOIN total_formas_folio tf ON tf.folio_pago = a.folio_pago
    ORDER BY a.fecha_abono DESC, a.NDOC;
  `,
};

function autosizeColumns(rows) {
  if (!rows || !rows.length) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((header) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 12), 40) };
  });
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pool = await sql.connect(dbConfig);
  try {
    const workbook = XLSX.utils.book_new();

    const metadata = [
      {
        fecha_inicio: START_DATE,
        fecha_fin: new Date().toISOString().slice(0, 10),
        servidor: dbConfig.server,
        base_datos: dbConfig.database,
      },
    ];
    const wsMeta = XLSX.utils.json_to_sheet(metadata);
    wsMeta['!cols'] = autosizeColumns(metadata);
    XLSX.utils.book_append_sheet(workbook, wsMeta, 'Parametros');

    for (const [key, query] of Object.entries(queries)) {
      const req = pool.request();
      req.input('fecha_inicio', sql.Date, START_DATE);
      const result = await req.query(query);
      const rows = result.recordset || [];
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = autosizeColumns(rows);
      const sheetName = {
        formasPagoPorCliente: 'FormasPagoCliente',
        clientesFacturanNoFacturan: 'FacturanNoFacturan',
        topCotizacionesAbiertas: 'TopCotAbiertas',
        topVentasFinalizadasNeto: 'TopVentasNetas',
        creditosMesForma: 'CreditosMesForma',
        creditosDetalle: 'CreditosDetalle',
      }[key] || key.slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      console.log(`${sheetName}: ${rows.length} filas`);
    }

    XLSX.writeFile(workbook, OUTPUT_FILE);
    console.log(`Archivo generado: ${OUTPUT_FILE}`);
  } finally {
    await pool.close();
  }
}

run().catch((error) => {
  console.error('Error generando reporte:', error);
  process.exitCode = 1;
});
