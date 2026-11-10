/*
  IOEDESARROLLO: permitir autorizar cambio de material en ORD SIN FLUJO
  solo cuando la solicitud está pendiente de revisión (selCtrlOrd=14).
  Las validaciones actuales de flujo 9.1 y TIPOM=1 permanecen para el resto.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59100, 'Este ajuste solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spCambio NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_cambio_material'));
  IF @spCambio IS NULL
    THROW 59101, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio, CHAR(13), N'');
  SET @spCambio = REPLACE(@spCambio, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spCambio = REPLACE(@spCambio, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spCambio = REPLACE(@spCambio, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @oldDeclaration NVARCHAR(200) =
    N'DECLARE @estseguOrd FLOAT = 0;';
  DECLARE @newDeclaration NVARCHAR(300) =
    N'DECLARE @estseguOrd FLOAT = 0;' + CHAR(10) +
    N'  DECLARE @selCtrlOrd INT = 0;';
  DECLARE @oldSelect NVARCHAR(300) =
    N'@estseguOrd = TRY_CONVERT(FLOAT, o.ESTSEGU)';
  DECLARE @newSelect NVARCHAR(400) =
    N'@estseguOrd = TRY_CONVERT(FLOAT, o.ESTSEGU),' + CHAR(10) +
    N'    @selCtrlOrd = TRY_CONVERT(INT, o.selCtrlOrd)';
  DECLARE @oldFlowCheck NVARCHAR(300) =
    N'IF @estseguOrd IS NULL OR ABS(@estseguOrd - 9.1) > 0.0001' + CHAR(10) +
    N'    THROW 58023, ''La ORD debe estar en flujo 9.1 para aplicar cambio material'', 1;';
  DECLARE @newFlowCheck NVARCHAR(600) =
    N'IF NOT (' + CHAR(10) +
    N'    (@estseguOrd IS NOT NULL AND ABS(@estseguOrd - 9.1) <= 0.0001)' + CHAR(10) +
    N'    OR (@estseguOrd IS NULL AND ISNULL(@selCtrlOrd, 0) = 14)' + CHAR(10) +
    N'  )' + CHAR(10) +
    N'    THROW 58023, ''La ORD debe estar en flujo 9.1 o SIN FLUJO con selCtrlOrd=14 para autorizar cambio material'', 1;';

  IF CHARINDEX(@newDeclaration, @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldDeclaration, @spCambio) = 0
      THROW 59102, 'No se encontró la declaración esperada de ESTSEGU', 1;
    SET @spCambio = REPLACE(@spCambio, @oldDeclaration, @newDeclaration);
  END;

  IF CHARINDEX(@newSelect, @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldSelect, @spCambio) = 0
      THROW 59103, 'No se encontró la lectura esperada de ESTSEGU', 1;
    SET @spCambio = REPLACE(@spCambio, @oldSelect, @newSelect);
  END;

  IF CHARINDEX(@newFlowCheck, @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldFlowCheck, @spCambio) = 0
      THROW 59104, 'No se encontró la validación de flujo esperada; no se modificó el procedimiento', 1;
    SET @spCambio = REPLACE(@spCambio, @oldFlowCheck, @newFlowCheck);
  END;

  EXEC sys.sp_executesql @spCambio;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
