SET NOCOUNT ON;
SET DATEFORMAT dmy;

/*
  Script independiente de backfill final de facturacion.
  Objetivo:
  - Transmitir solo folios faltantes o descuadrados en tablas de facturacion.
  - Evitar duplicados al usar sincronizacion idempotente por folio.
  - Corregir importes reales y afectaciones por devolucion (CTDDF).

  Requiere:
  - dbo.sp_fact_sync_folio_vf (sincronizacion por folio).
*/

DECLARE @FechaInicio DATE = '01/11/2024';
DECLARE @IncluirCA BIT = 0; /* 0 = solo VF | 1 = VF y CA */
DECLARE @Epsilon MONEY = 0.01;

IF OBJECT_ID('dbo.sp_fact_sync_folio_vf') IS NULL
  THROW 51080, 'No existe dbo.sp_fact_sync_folio_vf. Ejecuta sql/sp_fact_sync_folio_vf_create.sql antes.', 1;

IF OBJECT_ID('tempdb..#FoliosElegibles') IS NOT NULL DROP TABLE #FoliosElegibles;
IF OBJECT_ID('tempdb..#Analisis') IS NOT NULL DROP TABLE #Analisis;
IF OBJECT_ID('tempdb..#Candidatos') IS NOT NULL DROP TABLE #Candidatos;
IF OBJECT_ID('tempdb..#Resultado') IS NOT NULL DROP TABLE #Resultado;
IF OBJECT_ID('tempdb..#PurgeNoReqf') IS NOT NULL DROP TABLE #PurgeNoReqf;

/*
  Limpieza preventiva:
  Elimina de facturacion folios que NO cumplen REQF IN (-1,1)
  segun PV_CTR_FOL_ASVR (misma regla principal del proceso).
*/
SELECT
  LTRIM(RTRIM(H.IDFOL)) AS IDFOL
INTO #PurgeNoReqf
FROM dbo.FAC_SVR_SHAP H
INNER JOIN dbo.PV_CTR_FOL_ASVR A
  ON A.IDFOL = H.IDFOL
WHERE TRY_CONVERT(DATETIME, A.FCNM) >= @FechaInicio
  AND TRY_CONVERT(FLOAT, A.CLIEN) IS NOT NULL
  AND TRY_CONVERT(FLOAT, A.CLIEN) <> 1
  AND (
    UPPER(LTRIM(RTRIM(ISNULL(A.AUT, '')))) = 'VF'
    OR (@IncluirCA = 1 AND UPPER(LTRIM(RTRIM(ISNULL(A.AUT, '')))) = 'CA')
  )
  AND (
    TRY_CONVERT(INT, A.REQF) IS NULL
    OR TRY_CONVERT(INT, A.REQF) NOT IN (-1, 1)
  );

CREATE UNIQUE CLUSTERED INDEX IX_PurgeNoReqf_IDFOL ON #PurgeNoReqf(IDFOL);

DELETE T
FROM dbo.FACT_TICKET_SHP T
INNER JOIN #PurgeNoReqf P
  ON P.IDFOL = T.IDFOL;

DECLARE @RowsPurgeDetail INT = @@ROWCOUNT;

DELETE H
FROM dbo.FAC_SVR_SHAP H
INNER JOIN #PurgeNoReqf P
  ON P.IDFOL = H.IDFOL;

DECLARE @RowsPurgeHeader INT = @@ROWCOUNT;

;WITH Folios AS (
  SELECT
    LTRIM(RTRIM(A.IDFOL)) AS IDFOL,
    LTRIM(RTRIM(ISNULL(A.SUC, ''))) AS SUC,
    UPPER(LTRIM(RTRIM(ISNULL(A.AUT, '')))) AS AUT,
    CASE WHEN TRY_CONVERT(INT, A.REQF) IN (-1, 1) THEN 1 ELSE 0 END AS REQF_NORM,
    TRY_CONVERT(DATETIME, A.FCNM) AS FCNM,
    TRY_CONVERT(FLOAT, A.CLIEN) AS CLIEN
  FROM dbo.PV_CTR_FOL_ASVR A
  WHERE TRY_CONVERT(DATETIME, A.FCNM) >= @FechaInicio
    AND TRY_CONVERT(FLOAT, A.CLIEN) IS NOT NULL
    AND TRY_CONVERT(FLOAT, A.CLIEN) <> 1
    AND (
      UPPER(LTRIM(RTRIM(ISNULL(A.AUT, '')))) = 'VF'
      OR (@IncluirCA = 1 AND UPPER(LTRIM(RTRIM(ISNULL(A.AUT, '')))) = 'CA')
    )
)
SELECT
  F.IDFOL,
  F.SUC,
  F.AUT,
  F.REQF_NORM,
  F.FCNM,
  F.CLIEN
INTO #FoliosElegibles
FROM Folios F
WHERE F.IDFOL <> ''
  AND F.SUC <> ''
  AND F.REQF_NORM = 1;

CREATE UNIQUE CLUSTERED INDEX IX_FoliosElegibles_IDFOL ON #FoliosElegibles(IDFOL);

;WITH BaseImporte AS (
  SELECT
    F.IDFOL,
    ISNULL(S.IVA_INTEGRADO, 1) AS IVA_INTEGRADO,
    F.REQF_NORM,
    SUM(
      CASE
        WHEN (ISNULL(T.CTD, 0) - ISNULL(T.CTDDF, 0)) > 0
          THEN (ISNULL(T.CTD, 0) - ISNULL(T.CTDDF, 0)) * ISNULL(T.PVTA, 0)
        ELSE 0
      END
    ) AS BASE_IMPT
  FROM #FoliosElegibles F
  LEFT JOIN dbo.DAT_SUC S
    ON S.SUC = F.SUC
  LEFT JOIN dbo.PV_TICKET_LOG T
    ON T.IDFOL = F.IDFOL
  GROUP BY
    F.IDFOL,
    ISNULL(S.IVA_INTEGRADO, 1),
    F.REQF_NORM
),
ImporteEsperado AS (
  SELECT
    B.IDFOL,
    ROUND(
      CASE
        WHEN B.IVA_INTEGRADO = -1
          THEN ISNULL(B.BASE_IMPT, 0)
        WHEN B.REQF_NORM = 1
          THEN ISNULL(B.BASE_IMPT, 0) * 1.16
        ELSE ISNULL(B.BASE_IMPT, 0)
      END
    , 2) AS IMPT_REAL
  FROM BaseImporte B
),
DetalleEsperado AS (
  SELECT
    F.IDFOL,
    COUNT_BIG(1) AS DET_REAL_ROWS
  FROM #FoliosElegibles F
  INNER JOIN dbo.PV_TICKET_LOG T
    ON T.IDFOL = F.IDFOL
  INNER JOIN dbo.DAT_ART D
    ON D.ART = T.ART
   AND D.SUC = F.SUC
  WHERE (ISNULL(T.CTD, 0) - ISNULL(T.CTDDF, 0)) > 0
  GROUP BY F.IDFOL
),
DetalleActual AS (
  SELECT
    T.IDFOL,
    COUNT_BIG(1) AS DET_FACT_ROWS
  FROM dbo.FACT_TICKET_SHP T
  WHERE EXISTS (
    SELECT 1
    FROM #FoliosElegibles F
    WHERE F.IDFOL = T.IDFOL
  )
  GROUP BY T.IDFOL
),
DetalleDuplicado AS (
  SELECT
    X.IDFOL,
    CAST(1 AS BIT) AS HAS_DUP
  FROM (
    SELECT
      T.IDFOL,
      T.IDD,
      COUNT_BIG(1) AS CNT
    FROM dbo.FACT_TICKET_SHP T
    WHERE EXISTS (
      SELECT 1
      FROM #FoliosElegibles F
      WHERE F.IDFOL = T.IDFOL
    )
    GROUP BY
      T.IDFOL,
      T.IDD
  ) X
  WHERE X.CNT > 1
  GROUP BY X.IDFOL
)
SELECT
  F.IDFOL,
  F.AUT,
  CASE WHEN H.IDFOL IS NULL THEN 1 ELSE 0 END AS FLAG_MISSING_HEADER,
  CASE WHEN ABS(ISNULL(E.IMPT_REAL, 0) - ISNULL(H.IMPT, 0)) > @Epsilon THEN 1 ELSE 0 END AS FLAG_IMPT_DIFF,
  CASE
    WHEN (
      ISNULL(E.IMPT_REAL, 0) <= @Epsilon
      AND UPPER(LTRIM(RTRIM(ISNULL(H.ESTATUS, '')))) <> 'VTA DEV'
    ) OR (
      ISNULL(E.IMPT_REAL, 0) > @Epsilon
      AND UPPER(LTRIM(RTRIM(ISNULL(H.ESTATUS, '')))) = 'VTA DEV'
    )
    THEN 1 ELSE 0
  END AS FLAG_STATUS_DIFF,
  CASE WHEN ISNULL(DE.DET_REAL_ROWS, 0) <> ISNULL(DA.DET_FACT_ROWS, 0) THEN 1 ELSE 0 END AS FLAG_DETAIL_DIFF,
  ISNULL(DD.HAS_DUP, 0) AS FLAG_DETAIL_DUP,
  ISNULL(E.IMPT_REAL, 0) AS IMPT_REAL,
  ISNULL(H.IMPT, 0) AS IMPT_FACT
INTO #Analisis
FROM #FoliosElegibles F
LEFT JOIN ImporteEsperado E
  ON E.IDFOL = F.IDFOL
LEFT JOIN dbo.FAC_SVR_SHAP H
  ON H.IDFOL = F.IDFOL
LEFT JOIN DetalleEsperado DE
  ON DE.IDFOL = F.IDFOL
LEFT JOIN DetalleActual DA
  ON DA.IDFOL = F.IDFOL
LEFT JOIN DetalleDuplicado DD
  ON DD.IDFOL = F.IDFOL;

SELECT
  A.IDFOL,
  A.AUT,
  A.IMPT_REAL,
  A.IMPT_FACT,
  LTRIM(STUFF(
    CASE WHEN A.FLAG_MISSING_HEADER = 1 THEN ',MISSING_HEADER' ELSE '' END +
    CASE WHEN A.FLAG_IMPT_DIFF = 1 THEN ',IMPT_DIFF' ELSE '' END +
    CASE WHEN A.FLAG_STATUS_DIFF = 1 THEN ',STATUS_DIFF' ELSE '' END +
    CASE WHEN A.FLAG_DETAIL_DIFF = 1 THEN ',DETAIL_DIFF' ELSE '' END +
    CASE WHEN A.FLAG_DETAIL_DUP = 1 THEN ',DETAIL_DUP' ELSE '' END
  , 1, 1, '')) AS MOTIVO
INTO #Candidatos
FROM #Analisis A
WHERE
  A.FLAG_MISSING_HEADER = 1
  OR A.FLAG_IMPT_DIFF = 1
  OR A.FLAG_STATUS_DIFF = 1
  OR A.FLAG_DETAIL_DIFF = 1
  OR A.FLAG_DETAIL_DUP = 1;

CREATE UNIQUE CLUSTERED INDEX IX_Candidatos_IDFOL ON #Candidatos(IDFOL);

CREATE TABLE #Resultado (
  ID INT IDENTITY(1,1) PRIMARY KEY,
  IDFOL NVARCHAR(255) NOT NULL,
  ESTATUS NVARCHAR(20) NOT NULL,
  MOTIVO NVARCHAR(400) NULL,
  ERROR_MSG NVARCHAR(4000) NULL,
  FCN DATETIME NOT NULL DEFAULT(GETDATE())
);

DECLARE
  @idfol NVARCHAR(255),
  @motivo NVARCHAR(400),
  @forceSync BIT;

SET @forceSync = CASE WHEN @IncluirCA = 1 THEN 1 ELSE 0 END;

DECLARE cur_sync CURSOR LOCAL FAST_FORWARD FOR
SELECT
  C.IDFOL,
  C.MOTIVO
FROM #Candidatos C
ORDER BY C.IDFOL;

OPEN cur_sync;
FETCH NEXT FROM cur_sync INTO @idfol, @motivo;

WHILE @@FETCH_STATUS = 0
BEGIN
  BEGIN TRY
    EXEC dbo.sp_fact_sync_folio_vf
      @IDFOL = @idfol,
      @EVENTO = 'BACKFILL_FINAL',
      @FORCE = @forceSync;

    INSERT INTO #Resultado (IDFOL, ESTATUS, MOTIVO, ERROR_MSG)
    VALUES (@idfol, 'OK', @motivo, NULL);
  END TRY
  BEGIN CATCH
    INSERT INTO #Resultado (IDFOL, ESTATUS, MOTIVO, ERROR_MSG)
    VALUES (@idfol, 'ERROR', @motivo, ERROR_MESSAGE());
  END CATCH;

  FETCH NEXT FROM cur_sync INTO @idfol, @motivo;
END;

CLOSE cur_sync;
DEALLOCATE cur_sync;

DECLARE
  @TotalPurgeFolios INT = (SELECT COUNT(1) FROM #PurgeNoReqf),
  @TotalElegibles INT = (SELECT COUNT(1) FROM #FoliosElegibles),
  @TotalCandidatos INT = (SELECT COUNT(1) FROM #Candidatos),
  @TotalOk INT = (SELECT COUNT(1) FROM #Resultado WHERE ESTATUS = 'OK'),
  @TotalError INT = (SELECT COUNT(1) FROM #Resultado WHERE ESTATUS = 'ERROR');

IF OBJECT_ID('dbo.CTROL_TRAMISIONES') IS NOT NULL
BEGIN
  INSERT INTO dbo.CTROL_TRAMISIONES (FNCT, TIP_TRANS, N_REG)
  VALUES (GETDATE(), 'FACT_BACKFILL_FINAL', @TotalOk);
END;

SELECT
  @FechaInicio AS FECHA_INICIO,
  @IncluirCA AS INCLUIR_CA,
  @TotalPurgeFolios AS TOTAL_PURGE_REQF_FOLIOS,
  @RowsPurgeHeader AS TOTAL_PURGE_REQF_HEADER,
  @RowsPurgeDetail AS TOTAL_PURGE_REQF_DETAIL,
  @TotalElegibles AS TOTAL_ELEGIBLES,
  @TotalCandidatos AS TOTAL_CANDIDATOS,
  @TotalOk AS TOTAL_OK,
  @TotalError AS TOTAL_ERROR;

SELECT
  R.IDFOL,
  R.ESTATUS,
  R.MOTIVO,
  R.ERROR_MSG,
  R.FCN
FROM #Resultado R
ORDER BY
  CASE WHEN R.ESTATUS = 'ERROR' THEN 0 ELSE 1 END,
  R.IDFOL;
