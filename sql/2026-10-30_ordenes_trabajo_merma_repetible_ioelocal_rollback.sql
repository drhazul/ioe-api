/*
  Rollback solicitado: retirar de IOELOCAL la regla de merma repetible
  aplicada el 2026-10-30. Revierte solo definiciones de procedimientos;
  no actualiza datos de órdenes.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOELOCAL'
  THROW 59040, 'Este rollback solo se permite en IOELOCAL', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spMerma NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_merma'));
  IF @spMerma IS NULL
    THROW 59041, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spMerma = REPLACE(@spMerma, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spMerma = REPLACE(@spMerma, '@TIPOM = @tipom,', '@TIPOM = 0,');
  SET @spMerma = REPLACE(@spMerma, 'TIPOM = @tipom,', 'TIPOM = 0,');

  IF CHARINDEX('@TIPOM = 0,', @spMerma) = 0
     OR CHARINDEX('TIPOM = 0,', @spMerma) = 0
    THROW 59042, 'No se pudo restaurar la lógica anterior de TIPOM', 1;

  EXEC sys.sp_executesql @spMerma;

  DECLARE @spRegresar NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
  IF @spRegresar IS NULL
    THROW 59043, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

  SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @rutaNueva NVARCHAR(MAX) = N'WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL THEN 10';
  DECLARE @rutaAnterior NVARCHAR(MAX) = N'WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';

  IF CHARINDEX(@rutaNueva, @spRegresar) > 0
    SET @spRegresar = REPLACE(@spRegresar, @rutaNueva, @rutaAnterior);
  ELSE IF CHARINDEX(@rutaAnterior, @spRegresar) = 0
    THROW 59044, 'No se encontró la regla instalada para flujo 9.2', 1;

  EXEC sys.sp_executesql @spRegresar;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
