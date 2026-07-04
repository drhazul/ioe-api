/*
  Reporte comercial por cliente
  Rango: 2025-01-01 a fecha actual
  Base: IOELOCAL
*/
SET NOCOUNT ON;

DECLARE @fecha_inicio DATE = '2025-01-01';
DECLARE @fecha_fin DATE = CAST(GETDATE() AS DATE);

/* -------------------------------------------------------------------------- */
/* 1) Formas de pago por cliente (considera ventas y devoluciones)            */
/* -------------------------------------------------------------------------- */
WITH base_formas AS (
  SELECT
    a.IDFOL,
    a.CLIEN,
    ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
    UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA')))) AS forma_pago,
    UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS aut,
    CAST(ISNULL(f.IMPD, 0) AS DECIMAL(18,2)) AS impd,
    CAST(a.FCNM AS DATE) AS fecha
  FROM dbo.PV_CTR_FOL_ASVR a
  INNER JOIN dbo.PV_CTR_FOL_FORM f ON f.IDFOL = a.IDFOL
  LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* 2) Clientes que facturan y no facturan (comportamiento en ventas)          */
/* -------------------------------------------------------------------------- */
WITH base_ventas AS (
  SELECT
    a.IDFOL,
    a.CLIEN,
    ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
    CAST(ISNULL(a.REQF, 0) AS INT) AS reqf,
    CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS impt
  FROM dbo.PV_CTR_FOL_ASVR a
  LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* 3) Top clientes con mayores cotizaciones abiertas                          */
/* -------------------------------------------------------------------------- */
WITH cot_abiertas AS (
  SELECT
    a.IDFOL,
    a.CLIEN,
    ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
    CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS impt
  FROM dbo.PV_CTR_FOL_ASVR a
  LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* 4) Top clientes ventas finalizadas netas (ventas - devoluciones)           */
/* -------------------------------------------------------------------------- */
WITH movimientos AS (
  SELECT
    a.CLIEN,
    ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
    UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS aut,
    CAST(ISNULL(a.IMPT, 0) AS DECIMAL(18,2)) AS impt
  FROM dbo.PV_CTR_FOL_ASVR a
  LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* 5) Créditos liquidados por mes y forma de pago                             */
/* -------------------------------------------------------------------------- */
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
  WHERE CAST(c.FCND AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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
  SELECT
    folio_pago,
    SUM(importe_forma) AS total_formas
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
      END
    AS DECIMAL(18,2)) AS importe_liquidado
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

/* Detalle opcional de créditos liquidados */
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
  WHERE CAST(c.FCND AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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
  SELECT
    folio_pago,
    SUM(importe_forma) AS total_formas
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
    END
  AS DECIMAL(18,2)) AS importe_liquidado
FROM abonos_credito a
LEFT JOIN formas_pago_folio fp ON fp.folio_pago = a.folio_pago
LEFT JOIN total_formas_folio tf ON tf.folio_pago = a.folio_pago
ORDER BY a.fecha_abono DESC, a.NDOC;
