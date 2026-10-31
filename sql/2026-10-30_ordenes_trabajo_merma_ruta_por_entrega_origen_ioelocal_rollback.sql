/*
  Rollback del último despliegue en IOELOCAL. Restaura la ruta anterior:
  cualquier ORD con REEORD avanza a flujo 10 antes de evaluar TIPOM.
  No modifica datos de órdenes.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOELOCAL'
  THROW 59100, 'Este rollback solo se permite en IOELOCAL', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spRegresar NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
  IF @spRegresar IS NULL
    THROW 59101, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

  SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @rutaNueva NVARCHAR(MAX) = N'WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
            WHERE UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '''')))) =
                  UPPER(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))))
              AND TRY_CONVERT(FLOAT, h.ESTSEGU) = 11
          ) THEN 10
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          AND TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';
  DECLARE @rutaAnterior NVARCHAR(MAX) = N'WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';

  IF CHARINDEX(@rutaNueva, @spRegresar) > 0
    SET @spRegresar = REPLACE(@spRegresar, @rutaNueva, @rutaAnterior);
  ELSE IF CHARINDEX(@rutaAnterior, @spRegresar) = 0
    THROW 59102, 'No se encontró la regla aplicada ni la regla anterior; no se modificó el procedimiento', 1;

  EXEC sys.sp_executesql @spRegresar;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
