/*
  IOELOCAL: despliegue final de la ruta de merma validada en IOEDESARROLLO.
  La ORD derivada inicia con TIPOM=0; después la incidencia se captura desde
  el módulo. Al recibir en tienda, la derivada de merma va a 10 si el origen
  tiene historial de entrega 11 y a 9.2 si el origen nunca tuvo flujo 11.
  El cambio material derivado sigue a 10. No modifica datos de órdenes.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOELOCAL'
  THROW 59090, 'Este parche solo se permite en IOELOCAL', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spMerma NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_merma'));
  IF @spMerma IS NULL
    THROW 59091, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spMerma = REPLACE(@spMerma, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spMerma = REPLACE(@spMerma, '@TIPOM = @tipom,', '@TIPOM = 0,');
  SET @spMerma = REPLACE(@spMerma, 'TIPOM = @tipom,', 'TIPOM = 0,');

  IF CHARINDEX('@TIPOM = @tipom,', @spMerma) > 0
     OR CHARINDEX('TIPOM = @tipom,', @spMerma) > 0
     OR CHARINDEX('@TIPOM = 0,', @spMerma) = 0
    THROW 59092, 'No se pudo asegurar TIPOM=0 en la ORD nueva de merma', 1;

  EXEC sys.sp_executesql @spMerma;

  DECLARE @spRegresar NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
  IF @spRegresar IS NULL
    THROW 59093, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

  SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @rutaAnterior NVARCHAR(MAX) = N'WHEN
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

  IF CHARINDEX(@rutaAnterior, @spRegresar) > 0
    SET @spRegresar = REPLACE(@spRegresar, @rutaAnterior, @rutaCorrecta);
  ELSE IF CHARINDEX(@rutaCorrecta, @spRegresar) = 0
    THROW 59094, 'No se encontró la ruta esperada; no se modificó el procedimiento', 1;

  EXEC sys.sp_executesql @spRegresar;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
