/*
  Taller: permite repetir merma sin ciclo intermedio de entrega/garantía.
  Regla: las ORDs creadas por merma conservan TIPOM=2; al volver de flujo 9
  se reciben en flujo 9.2 incluso si tienen REEORD. Cambio material y órdenes
  sin incidencia continúan su ruta normal a flujo 10.

  Destino autorizado: IOEDESARROLLO.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59010, 'Este parche solo se permite en IOEDESARROLLO', 1;
GO

DECLARE @spMerma NVARCHAR(MAX) =
  OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_merma'));
IF @spMerma IS NULL
  THROW 59011, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

SET @spMerma = REPLACE(@spMerma, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @spMerma = REPLACE(@spMerma, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

/* Conservar el tipo de incidencia 2 al clonar la ORD derivada de merma. */
SET @spMerma = REPLACE(@spMerma, '@TIPOM = 0,', '@TIPOM = @tipom,');
SET @spMerma = REPLACE(@spMerma, 'TIPOM = 0,', 'TIPOM = @tipom,');

IF CHARINDEX('@TIPOM = @tipom,', @spMerma) = 0
   OR CHARINDEX('TIPOM = @tipom,', @spMerma) = 0
  THROW 59012, 'No se pudo conservar TIPOM=2 en la ORD derivada de merma', 1;

EXEC sys.sp_executesql @spMerma;
GO

DECLARE @spRegresar NVARCHAR(MAX) =
  OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
IF @spRegresar IS NULL
  THROW 59013, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

DECLARE @rutaAnterior NVARCHAR(MAX) = N'WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL
          THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';
DECLARE @rutaNueva NVARCHAR(MAX) = N'WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL THEN 10';

IF CHARINDEX(@rutaAnterior, @spRegresar) > 0
  SET @spRegresar = REPLACE(@spRegresar, @rutaAnterior, @rutaNueva);
ELSE IF CHARINDEX(@rutaNueva, @spRegresar) = 0
  THROW 59014, 'No se encontró la ruta esperada de recepción en tienda', 1;

IF CHARINDEX('TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2', @spRegresar) = 0
  THROW 59015, 'La regla TIPOM=2 -> flujo 9.2 no quedó instalada', 1;

EXEC sys.sp_executesql @spRegresar;
GO
