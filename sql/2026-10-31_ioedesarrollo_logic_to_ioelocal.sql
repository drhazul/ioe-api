/*
  Transferencia controlada de reglas probadas en IOEDESARROLLO a IOELOCAL.
  Solo altera definiciones de procedimientos; no ejecuta DML sobre órdenes.
  Conserva las demás diferencias propias de cada procedimiento en IOELOCAL.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOELOCAL'
  THROW 59110, 'Este despliegue solo se permite en IOELOCAL', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  /* DAT_JAO_ORD: mostrar SIN FLUJO pendiente de cambio material en Inventarios. */
  DECLARE @spPanel NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_panel'));
  IF @spPanel IS NULL
    THROW 59111, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

  SET @spPanel = REPLACE(@spPanel, CHAR(13), N'');
  SET @spPanel = REPLACE(@spPanel, 'CREATE               PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @invBranch NVARCHAR(MAX) =
    N'    ELSE IF @ROLE_CODE IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'    BEGIN' + CHAR(10) +
    N'      INSERT INTO @allowedStatus (ESTSEGU)' + CHAR(10) +
    N'      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (9.3), (10), (12);' + CHAR(10) +
    N'    END';
  DECLARE @invBranchUpdated NVARCHAR(MAX) =
    N'    ELSE IF @ROLE_CODE IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'    BEGIN' + CHAR(10) +
    N'      INSERT INTO @allowedStatus (ESTSEGU)' + CHAR(10) +
    N'      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (9.3), (10), (12);' + CHAR(10) +
    N'      -- Inventarios: incluir solicitudes de cambio material pendientes sin flujo.' + CHAR(10) +
    N'      SET @ALLOW_NULL_ESTSEGU = 1;' + CHAR(10) +
    N'    END';
  DECLARE @invBranchMarker NVARCHAR(200) =
    N'      -- Inventarios: incluir solicitudes de cambio material pendientes sin flujo.';

  IF CHARINDEX(@invBranchMarker, @spPanel) = 0
  BEGIN
    IF CHARINDEX(@invBranch, @spPanel) = 0
      THROW 59112, 'No se encontró el bloque de roles Inventarios en sp_ordenes_trabajo_panel', 1;
    SET @spPanel = REPLACE(@spPanel, @invBranch, @invBranchUpdated);
  END;

  DECLARE @queueRule NVARCHAR(MAX) =
    N'      AND (' + CHAR(10) +
    N'        @ROLE_CODE NOT IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'        OR TRY_CONVERT(INT, o.selCtrlOrd) = 14' + CHAR(10) +
    N'      )';
  DECLARE @queueRuleUpdated NVARCHAR(MAX) =
    @queueRule + CHAR(10) +
    N'      AND (' + CHAR(10) +
    N'        @ROLE_CODE NOT IN (''ANALISTA_INV'', ''INVJEF'')' + CHAR(10) +
    N'        OR TRY_CONVERT(FLOAT, o.ESTSEGU) IS NOT NULL' + CHAR(10) +
    N'        OR (' + CHAR(10) +
    N'          TRY_CONVERT(INT, o.selCtrlOrd) = 14' + CHAR(10) +
    N'          AND TRY_CONVERT(INT, tipomx.TIPOM) = 1' + CHAR(10) +
    N'        )' + CHAR(10) +
    N'      )';
  DECLARE @queueRuleMarker NVARCHAR(200) =
    N'        OR TRY_CONVERT(FLOAT, o.ESTSEGU) IS NOT NULL';

  IF CHARINDEX(@queueRuleMarker, @spPanel) = 0
  BEGIN
    IF CHARINDEX(@queueRule, @spPanel) = 0
      THROW 59113, 'No se encontró el filtro selCtrlOrd de Inventarios en sp_ordenes_trabajo_panel', 1;
    SET @spPanel = REPLACE(@spPanel, @queueRule, @queueRuleUpdated);
  END;
  EXEC sys.sp_executesql @spPanel;

  /* Cambio material: conservar 9.1/TIPOM=1 y habilitar la solicitud pendiente SIN FLUJO. */
  DECLARE @spCambio NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_cambio_material'));
  IF @spCambio IS NULL
    THROW 59114, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio, CHAR(13), N'');
  SET @spCambio = REPLACE(@spCambio, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spCambio = REPLACE(@spCambio, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spCambio = REPLACE(@spCambio, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @oldDeclaration NVARCHAR(200) = N'DECLARE @estseguOrd FLOAT = 0;';
  DECLARE @newDeclaration NVARCHAR(300) =
    N'DECLARE @estseguOrd FLOAT = 0;' + CHAR(10) + N'  DECLARE @selCtrlOrd INT = 0;';
  DECLARE @oldSelect NVARCHAR(200) = N'@estseguOrd = TRY_CONVERT(FLOAT, o.ESTSEGU)';
  DECLARE @newSelect NVARCHAR(300) =
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
  DECLARE @quantityLimit NVARCHAR(300) =
    N'  IF @CTD_C_M - @ctdOrig > 0.0001' + CHAR(10) +
    N'    THROW 58027, ''CTD_C_M no puede ser mayor a la cantidad de la ORD origen'', 1;';
  DECLARE @quantityMarker NVARCHAR(200) =
    N'  -- Cambio material: la cantidad nueva puede superar la cantidad de la ORD origen.';
  DECLARE @oldRemainder NVARCHAR(100) = N'SET @remanente = @ctdOrig - @ctdAfectada;';
  DECLARE @newRemainder NVARCHAR(180) =
    N'SET @remanente = CASE WHEN @ctdOrig > @ctdAfectada THEN @ctdOrig - @ctdAfectada ELSE 0 END;';

  IF CHARINDEX(N'DECLARE @selCtrlOrd INT = 0;', @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldDeclaration, @spCambio) = 0
      THROW 59115, 'No se encontró la declaración ESTSEGU esperada en cambio material', 1;
    SET @spCambio = REPLACE(@spCambio, @oldDeclaration, @newDeclaration);
  END;
  IF CHARINDEX(N'@selCtrlOrd = TRY_CONVERT(INT, o.selCtrlOrd)', @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldSelect, @spCambio) = 0
      THROW 59116, 'No se encontró la lectura ESTSEGU esperada en cambio material', 1;
    SET @spCambio = REPLACE(@spCambio, @oldSelect, @newSelect);
  END;
  IF CHARINDEX(N'ISNULL(@selCtrlOrd, 0) = 14', @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldFlowCheck, @spCambio) = 0
      THROW 59117, 'No se encontró la validación de flujo esperada en cambio material', 1;
    SET @spCambio = REPLACE(@spCambio, @oldFlowCheck, @newFlowCheck);
  END;
  IF CHARINDEX(@quantityMarker, @spCambio) = 0
  BEGIN
    IF CHARINDEX(@quantityLimit, @spCambio) = 0
      THROW 59118, 'No se encontró el límite CTD_C_M esperado en cambio material', 1;
    SET @spCambio = REPLACE(@spCambio, @quantityLimit, @quantityMarker);
  END;
  IF CHARINDEX(@newRemainder, @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldRemainder, @spCambio) = 0
      THROW 59119, 'No se encontró el cálculo de remanente esperado en cambio material', 1;
    SET @spCambio = REPLACE(@spCambio, @oldRemainder, @newRemainder);
  END;
  EXEC sys.sp_executesql @spCambio;

  /* Retorno a tienda: conservar rutas actuales salvo la regla de origen entregado. */
  DECLARE @spRegresar NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_regresar_tienda_lote'));
  IF @spRegresar IS NULL
    THROW 59120, 'No existe dbo.sp_ordenes_trabajo_regresar_tienda_lote', 1;

  SET @spRegresar = REPLACE(@spRegresar, CHAR(13), N'');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE               PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spRegresar = REPLACE(@spRegresar, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @routeCurrent NVARCHAR(MAX) =
    N'WHEN' + CHAR(10) +
    N'          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL' + CHAR(10) +
    N'          THEN 10' + CHAR(10) +
    N'        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1' + CHAR(10) +
    N'        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';
  DECLARE @routeUpdated NVARCHAR(MAX) =
    N'WHEN' + CHAR(10) +
    N'          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL' + CHAR(10) +
    N'          AND EXISTS (' + CHAR(10) +
    N'            SELECT 1' + CHAR(10) +
    N'            FROM dbo.PV_CTR_ORDS_FLUJO_HIST h' + CHAR(10) +
    N'            WHERE UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '''')))) =' + CHAR(10) +
    N'                  UPPER(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))))' + CHAR(10) +
    N'              AND TRY_CONVERT(FLOAT, h.ESTSEGU) = 11' + CHAR(10) +
    N'          ) THEN 10' + CHAR(10) +
    N'        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL' + CHAR(10) +
    N'          AND TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2' + CHAR(10) +
    N'        WHEN NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''''))), '''') IS NOT NULL THEN 10' + CHAR(10) +
    N'        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1' + CHAR(10) +
    N'        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2';

  IF CHARINDEX(@routeUpdated, @spRegresar) = 0
  BEGIN
    IF CHARINDEX(@routeCurrent, @spRegresar) = 0
      THROW 59121, 'No se encontró la ruta actual esperada en regresar a tienda', 1;
    SET @spRegresar = REPLACE(@spRegresar, @routeCurrent, @routeUpdated);
  END;
  EXEC sys.sp_executesql @spRegresar;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
