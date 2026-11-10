/*
  IOEDESARROLLO: permitir que el cambio de material afecte 1.0 unidades
  cuando la ORD original fue capturada con 0.5. La regla aplica únicamente
  a cambio material; el SP de merma conserva el límite de cantidad original.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59097, 'Este ajuste solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @sp NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_cambio_material'));
  IF @sp IS NULL
    THROW 59098, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

  SET @sp = REPLACE(@sp, CHAR(13), N'');
  SET @sp = REPLACE(@sp, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @sp = REPLACE(@sp, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @sp = REPLACE(@sp, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @limit NVARCHAR(MAX) =
    N'  IF @CTD_C_M - @ctdOrig > 0.0001' + CHAR(10) +
    N'    THROW 58027, ''CTD_C_M no puede ser mayor a la cantidad de la ORD origen'', 1;';
  DECLARE @marker NVARCHAR(200) =
    N'  -- Cambio material: la cantidad nueva puede superar la cantidad de la ORD origen.';
  DECLARE @remanenteCurrent NVARCHAR(100) =
    N'SET @remanente = @ctdOrig - @ctdAfectada;';
  DECLARE @remanenteCorrected NVARCHAR(180) =
    N'SET @remanente = CASE WHEN @ctdOrig > @ctdAfectada THEN @ctdOrig - @ctdAfectada ELSE 0 END;';

  IF CHARINDEX(@limit, @sp) > 0
    SET @sp = REPLACE(@sp, @limit, @marker);
  ELSE IF CHARINDEX(@marker, @sp) = 0
    THROW 59099, 'No se encontró el límite de cantidad esperado; no se modificó el procedimiento', 1;

  IF CHARINDEX(@remanenteCurrent, @sp) > 0
    SET @sp = REPLACE(@sp, @remanenteCurrent, @remanenteCorrected);
  ELSE IF CHARINDEX(@remanenteCorrected, @sp) = 0
    THROW 59100, 'No se encontró el cálculo del remanente esperado; no se modificó el procedimiento', 1;

  EXEC sys.sp_executesql @sp;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
