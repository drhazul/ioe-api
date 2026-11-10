/*
  IOEDESARROLLO: mostrar en DAT_JAO_ORD las solicitudes pendientes de cambio
  de material creadas desde SIN FLUJO para ANALISTA_INV e INVJEF.
  El filtro selCtrlOrd=14 del procedimiento mantiene la cola limitada a revisión.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59097, 'Este ajuste solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spPanel NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_panel'));
  IF @spPanel IS NULL
    THROW 59098, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

  SET @spPanel = REPLACE(@spPanel, CHAR(13), N'');
  SET @spPanel = REPLACE(@spPanel, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @branch NVARCHAR(MAX) =
    N'    ELSE IF @ROLE_CODE IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'    BEGIN' + CHAR(10) +
    N'      INSERT INTO @allowedStatus (ESTSEGU)' + CHAR(10) +
    N'      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (9.3), (10), (12);' + CHAR(10) +
    N'    END';
  DECLARE @marker NVARCHAR(180) =
    N'      -- Inventarios: incluir solicitudes de cambio material pendientes sin flujo.';
  DECLARE @branchCorrected NVARCHAR(MAX) =
    N'    ELSE IF @ROLE_CODE IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'    BEGIN' + CHAR(10) +
    N'      INSERT INTO @allowedStatus (ESTSEGU)' + CHAR(10) +
    N'      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (9.3), (10), (12);' + CHAR(10) +
    @marker + CHAR(10) +
    N'      SET @ALLOW_NULL_ESTSEGU = 1;' + CHAR(10) +
    N'    END';

  DECLARE @queueRule NVARCHAR(MAX) =
    N'      AND (' + CHAR(10) +
    N'        @ROLE_CODE NOT IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'        OR TRY_CONVERT(INT, o.selCtrlOrd) = 14' + CHAR(10) +
    N'      )';
  DECLARE @queueRuleCorrected NVARCHAR(MAX) =
    @queueRule + CHAR(10) +
    N'      AND (' + CHAR(10) +
    N'        @ROLE_CODE NOT IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'        OR TRY_CONVERT(FLOAT, o.ESTSEGU) IS NOT NULL' + CHAR(10) +
    N'        OR (' + CHAR(10) +
    N'          TRY_CONVERT(INT, o.selCtrlOrd) = 14' + CHAR(10) +
    N'          AND TRY_CONVERT(INT, tipomx.TIPOM) = 1' + CHAR(10) +
    N'        )' + CHAR(10) +
    N'      )';
  DECLARE @queueMarker NVARCHAR(200) =
    N'        OR TRY_CONVERT(FLOAT, o.ESTSEGU) IS NOT NULL';

  IF CHARINDEX(@branch, @spPanel) > 0
    SET @spPanel = REPLACE(@spPanel, @branch, @branchCorrected);
  ELSE IF CHARINDEX(@marker, @spPanel) = 0
    THROW 59099, 'No se encontró la regla de cola de Inventarios; no se modificó el procedimiento', 1;

  IF CHARINDEX(@queueMarker, @spPanel) = 0
  BEGIN
    IF CHARINDEX(@queueRule, @spPanel) > 0
      SET @spPanel = REPLACE(@spPanel, @queueRule, @queueRuleCorrected);
    ELSE
      THROW 59100, 'No se encontró el filtro selCtrlOrd de Inventarios; no se modificó el procedimiento', 1;
  END;

  EXEC sys.sp_executesql @spPanel;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
