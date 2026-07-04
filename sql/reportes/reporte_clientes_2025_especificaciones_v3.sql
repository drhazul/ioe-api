/*
  Reporte comercial por cliente - Version 3
  Rango: 2025-01-01 a fecha actual
  Base: IOELOCAL
*/
SET NOCOUNT ON;

DECLARE @fecha_inicio DATE = '2025-01-01';
DECLARE @fecha_fin DATE = CAST(GETDATE() AS DATE);

/* -------------------------------------------------------------------------- */
/* Hoja: FormasPagoCliente                                                    */
/* -------------------------------------------------------------------------- */
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
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* Hoja: FacturanNoFacturan                                                   */
/* -------------------------------------------------------------------------- */
WITH base_fact AS (
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(a.SUC, 'SIN_SUC')))) AS SUC,
    CAST(a.CLIEN AS BIGINT) AS CLIEN,
    ISNULL(c.RazonSocialReceptor, 'CLIENTE SIN NOMBRE') AS cliente,
    CAST(ISNULL(a.REQF, 0) AS INT) AS REQF
  FROM dbo.PV_CTR_FOL_ASVR a
  LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* Hoja: TopCotAbiertas                                                       */
/* Basada en consulta solicitada con AUT CA y DCA                             */
/* -------------------------------------------------------------------------- */
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
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* Hoja: TopVentasFinalizadas                                                 */
/* Basada en consulta solicitada con AUT VF y DVF                             */
/* -------------------------------------------------------------------------- */
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
  WHERE CAST(a.FCNM AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
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

/* -------------------------------------------------------------------------- */
/* Hoja: CreditosMesForma                                                     */
/* -------------------------------------------------------------------------- */
WITH abonos_credito AS (
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(c.SUC, 'SIN_SUC')))) AS SUC,
    MONTH(CAST(c.FCND AS DATE)) AS MES,
    YEAR(CAST(c.FCND AS DATE)) AS [AÑO],
    c.NDOC,
    CAST(ISNULL(c.IMPT, 0) AS DECIMAL(18,2)) AS IMPORTE_CREDITO,
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
    ))) AS FOLIO_PAGO
  FROM dbo.DAT_CTRL_CTAS c
  WHERE CAST(c.FCND AS DATE) BETWEEN @fecha_inicio AND @fecha_fin
    AND UPPER(LTRIM(RTRIM(ISNULL(c.CTA, '')))) = '101001002'
    AND UPPER(LTRIM(RTRIM(ISNULL(c.CLSD, '')))) = '601'
    AND ISNULL(c.IMPT, 0) > 0
),
formas_folio AS (
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) AS FOLIO_PAGO,
    UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA')))) AS FORM,
    SUM(ABS(CAST(ISNULL(f.IMPD, 0) AS DECIMAL(18,2)))) AS IMPORTE_FORMA
  FROM dbo.PV_CTR_FOL_FORM f
  GROUP BY UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))), UPPER(LTRIM(RTRIM(ISNULL(f.FORM, 'SIN_FORMA'))))
),
total_forma_folio AS (
  SELECT FOLIO_PAGO, SUM(IMPORTE_FORMA) AS TOTAL_FORMA
  FROM formas_folio
  GROUP BY FOLIO_PAGO
),
prorrateo AS (
  SELECT
    a.SUC,
    a.MES,
    a.[AÑO],
    a.NDOC,
    a.IMPORTE_CREDITO,
    COALESCE(ff.FORM, 'SIN_FORMA') AS FORM,
    CAST(
      CASE
        WHEN tf.TOTAL_FORMA IS NULL OR tf.TOTAL_FORMA = 0 OR ff.IMPORTE_FORMA IS NULL THEN a.IMPORTE_CREDITO
        ELSE a.IMPORTE_CREDITO * (ff.IMPORTE_FORMA / tf.TOTAL_FORMA)
      END AS DECIMAL(18,2)
    ) AS IMPORTE_LIQUIDADO
  FROM abonos_credito a
  LEFT JOIN formas_folio ff ON ff.FOLIO_PAGO = a.FOLIO_PAGO
  LEFT JOIN total_forma_folio tf ON tf.FOLIO_PAGO = a.FOLIO_PAGO
)
SELECT
  SUC,
  MES,
  [AÑO],
  SUM(IMPORTE_CREDITO) AS [IMPORTE CREDITO],
  COUNT(DISTINCT NDOC) AS [TRANSACCIONES CREDITO],
  SUM(CASE WHEN FORM = 'EFECTIVO' THEN IMPORTE_LIQUIDADO ELSE 0 END) AS EFECTIVO,
  SUM(CASE WHEN FORM = 'TARJETA' THEN IMPORTE_LIQUIDADO ELSE 0 END) AS TARJETA,
  SUM(CASE WHEN FORM = 'TRANSFERENCIA' THEN IMPORTE_LIQUIDADO ELSE 0 END) AS TRANSFERENCIA,
  SUM(CASE WHEN FORM = 'DEPOSITO 3RO' THEN IMPORTE_LIQUIDADO ELSE 0 END) AS [DEPOSITO 3RO],
  SUM(CASE WHEN FORM = 'CHEQUE' THEN IMPORTE_LIQUIDADO ELSE 0 END) AS CHEQUE
FROM prorrateo
GROUP BY SUC, MES, [AÑO]
ORDER BY [AÑO], MES, SUC;
