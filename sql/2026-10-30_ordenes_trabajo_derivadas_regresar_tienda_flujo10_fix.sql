/*
  IOEDESARROLLO: una ORD derivada (REEORD informado) debe continuar a flujo 10
  al regresar a tienda. La relación de derivación tiene prioridad sobre TIPOM;
  solo una ORD no derivada se enruta a 9.1/9.2 según su incidencia.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59050, 'Este parche solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spMerma NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_merma'));
  IF @spMerma IS NULL
    THROW 59053, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spMerma = REPLACE(@spMerma, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spMerma = REPLACE(@spMerma, '@TIPOM = @tipom,', '@TIPOM = 0,');
  SET @spMerma = REPLACE(@spMerma, 'TIPOM = @tipom,', 'TIPOM = 0,');

  IF CHARINDEX('@TIPOM = @tipom,', @spMerma) > 0
     OR CHARINDEX('TIPOM = @tipom,', @spMerma) > 0
     OR CHARINDEX('@TIPOM = 0,', @spMerma) = 0
    THROW 59054, 'No se pudo dejar TIPOM=0 en la ORD nueva de merma', 1;

  EXEC sys.sp_executesql @spMerma;

  DECLARE @spRegresar NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
  IF @spRegresar IS NULL
    THROW 59051, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

  SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @rutaActual NVARCHAR(MAX) = N'WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL THEN 10';
  DECLARE @rutaCorrecta NVARCHAR(MAX) = N'WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';

  IF CHARINDEX(@rutaActual, @spRegresar) > 0
    SET @spRegresar = REPLACE(@spRegresar, @rutaActual, @rutaCorrecta);
  ELSE IF CHARINDEX(@rutaCorrecta, @spRegresar) = 0
    THROW 59052, 'No se encontró la regla esperada; no se modificó el procedimiento', 1;

  EXEC sys.sp_executesql @spRegresar;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
