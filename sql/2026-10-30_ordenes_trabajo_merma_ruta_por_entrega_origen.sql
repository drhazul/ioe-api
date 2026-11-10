/*
  IOEDESARROLLO: distinguir la ruta de una ORD derivada de merma según si la
  ORD origen llegó al cliente (flujo 11). Con origen entregado -> flujo 10;
  sin entrega previa -> flujo 9.2. Cambio material derivado -> flujo 10.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59070, 'Este parche solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spRegresar NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
  IF @spRegresar IS NULL
    THROW 59071, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

  SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @rutaActual NVARCHAR(MAX) = N'WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';
  DECLARE @rutaCorrecta NVARCHAR(MAX) = N'WHEN
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

  IF CHARINDEX(@rutaActual, @spRegresar) > 0
    SET @spRegresar = REPLACE(@spRegresar, @rutaActual, @rutaCorrecta);
  ELSE IF CHARINDEX(@rutaCorrecta, @spRegresar) = 0
    THROW 59072, 'No se encontró la ruta anterior ni la regla condicional; no se modificó el SP', 1;

  EXEC sys.sp_executesql @spRegresar;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
