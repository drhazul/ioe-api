-- Alinea FAC_SVR_SHAP.CLIEN con PV_CTR_FOL_ASVR.CLIEN (FLOAT)
-- para soportar IDs grandes de cliente (ej. 10460540001).
-- Ejecutar una sola vez en SQL Server.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @tipoActual SYSNAME;
DECLARE @rowsBackfill INT = 0;

SELECT
  @tipoActual = LOWER(t.name)
FROM sys.columns c
JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.FAC_SVR_SHAP')
  AND c.name = 'CLIEN';

IF @tipoActual IS NULL
  THROW 51090, 'No existe FAC_SVR_SHAP.CLIEN', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  IF @tipoActual <> 'float'
  BEGIN
    ALTER TABLE dbo.FAC_SVR_SHAP
      ALTER COLUMN CLIEN FLOAT NULL;
  END;

  UPDATE H
  SET H.CLIEN = TRY_CONVERT(FLOAT, A.CLIEN)
  FROM dbo.FAC_SVR_SHAP H
  INNER JOIN dbo.PV_CTR_FOL_ASVR A
    ON A.IDFOL = H.IDFOL
  WHERE TRY_CONVERT(FLOAT, A.CLIEN) IS NOT NULL
    AND (
      H.CLIEN IS NULL
      OR H.CLIEN <> TRY_CONVERT(FLOAT, A.CLIEN)
    );

  SET @rowsBackfill = @@ROWCOUNT;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT
  'FAC_SVR_SHAP.CLIEN' AS columna,
  @tipoActual AS tipo_antes,
  (
    SELECT LOWER(t2.name)
    FROM sys.columns c2
    JOIN sys.types t2
      ON t2.user_type_id = c2.user_type_id
    WHERE c2.object_id = OBJECT_ID('dbo.FAC_SVR_SHAP')
      AND c2.name = 'CLIEN'
  ) AS tipo_despues,
  @rowsBackfill AS rows_backfill;
