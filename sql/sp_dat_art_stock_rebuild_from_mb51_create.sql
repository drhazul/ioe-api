SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*
  Rebuild de DAT_ART.STOCK desde DAT_MB51.
  Regla:
    - STOCK = SUM(DAT_MB51.CTDA) por (SUC, ART)
    - Si (SUC, ART) no existe en DAT_MB51, STOCK = 0

  Diseno orientado a rendimiento:
    1) Agregado set-based en tabla temporal (#MB51_SUM)
    2) Indice clustered temporal para join rapido
    3) UPDATE solo de filas con cambio real (reduce logging y bloqueos)
    4) Normalizacion de llaves SUC/ART (TRIM + UPPER) para evitar fallas por formato
*/
CREATE OR ALTER PROCEDURE dbo.sp_dat_art_stock_rebuild_from_mb51
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID('tempdb..#MB51_SUM') IS NOT NULL
    DROP TABLE #MB51_SUM;

  SELECT
      SUC_NORM = UPPER(LTRIM(RTRIM(CONVERT(nvarchar(50), M.SUC))))
    , ART_NORM = UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), M.ART))))
    , STOCK_CALCULADO = SUM(CONVERT(float, ISNULL(M.CTDA, 0)))
  INTO #MB51_SUM
  FROM dbo.DAT_MB51 AS M WITH (READCOMMITTEDLOCK)
  GROUP BY
      UPPER(LTRIM(RTRIM(CONVERT(nvarchar(50), M.SUC))))
    , UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), M.ART))));

  CREATE UNIQUE CLUSTERED INDEX CX_MB51_SUM
    ON #MB51_SUM (SUC_NORM, ART_NORM);

  DECLARE @rows_updated bigint = 0;

  BEGIN TRAN;

    UPDATE A
       SET A.STOCK = ISNULL(S.STOCK_CALCULADO, 0)
    FROM dbo.DAT_ART AS A
    OUTER APPLY (
      SELECT
          SUC_NORM = UPPER(LTRIM(RTRIM(CONVERT(nvarchar(50), A.SUC))))
        , ART_NORM = UPPER(LTRIM(RTRIM(CONVERT(nvarchar(100), A.ART))))
    ) AS K
    LEFT JOIN #MB51_SUM AS S
      ON S.SUC_NORM = K.SUC_NORM
     AND S.ART_NORM = K.ART_NORM
    WHERE ISNULL(A.STOCK, 0) <> ISNULL(S.STOCK_CALCULADO, 0);

    SET @rows_updated = @@ROWCOUNT;

  COMMIT TRAN;

  SELECT
      ROWS_UPDATED = @rows_updated
    , ROWS_MB51_AGG = (SELECT COUNT_BIG(1) FROM #MB51_SUM)
    , ROWS_DAT_ART = (SELECT COUNT_BIG(1) FROM dbo.DAT_ART);
END
GO

/*
  Nota importante:
    Este script CREA/ACTUALIZA el SP.
    Para aplicar el recalculo se debe ejecutar:
      EXEC dbo.sp_dat_art_stock_rebuild_from_mb51;

  Recomendacion (ejecutar una sola vez y en ventana de mantenimiento):

  CREATE NONCLUSTERED INDEX IX_DAT_MB51_SUC_ART
  ON dbo.DAT_MB51 (SUC, ART)
  INCLUDE (CTDA);

  CREATE NONCLUSTERED INDEX IX_DAT_ART_SUC_ART
  ON dbo.DAT_ART (SUC, ART)
  INCLUDE (STOCK);
*/
