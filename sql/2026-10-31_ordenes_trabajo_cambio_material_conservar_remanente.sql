/*
  IOEDESARROLLO: si se cambia material solo para una parte de la cantidad,
  conservar la ORD original activa por el remanente en flujo 3. El cambio total
  mantiene el cierre/anulación existente. No modifica datos de órdenes.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59130, 'Este ajuste solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spCambio NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_cambio_material'));
  IF @spCambio IS NULL
    THROW 59131, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio, CHAR(13), N'');
  SET @spCambio = REPLACE(@spCambio, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spCambio = REPLACE(@spCambio, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spCambio = REPLACE(@spCambio, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @oldOriginalUpdate NVARCHAR(MAX) =
    N'    UPDATE dbo.PV_CTR_ORDS' + CHAR(10) +
    N'    SET' + CHAR(10) +
    N'      CTD = @ctdOrig,' + CHAR(10) +
    N'      CTD_C_M = @ctdAfectada,' + CHAR(10) +
    N'      REEORD = @newIord,' + CHAR(10) +
    N'      selCtrlOrd = NULL,' + CHAR(10) +
    N'      ESTSEGU = 4,' + CHAR(10) +
    N'      ESTATUS = 2,' + CHAR(10) +
    N'      FCNMOD = GETDATE(),' + CHAR(10) +
    N'      COMAD = LEFT(' + CHAR(10) +
    N'        CONCAT(' + CHAR(10) +
    N'          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''''),' + CHAR(10) +
    N'          CASE' + CHAR(10) +
    N'            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''''))) = ''''' + CHAR(10) +
    N'              THEN ''''' + CHAR(10) +
    N'            ELSE '' | ''' + CHAR(10) +
    N'          END,' + CHAR(10) +
    N'          ''CAMBIO MATERIAL: '',' + CHAR(10) +
    N'          @motivoLabel' + CHAR(10) +
    N'        ),' + CHAR(10) +
    N'        2000' + CHAR(10) +
    N'      )' + CHAR(10) +
    N'    WHERE IORD = @IORD;';

  DECLARE @newOriginalUpdate NVARCHAR(MAX) =
    N'    UPDATE dbo.PV_CTR_ORDS' + CHAR(10) +
    N'    SET' + CHAR(10) +
    N'      CTD = CASE WHEN @remanente > 0.0001 THEN @remanente ELSE @ctdOrig END,' + CHAR(10) +
    N'      CTD_C_M = CASE WHEN @remanente > 0.0001 THEN NULL ELSE @ctdAfectada END,' + CHAR(10) +
    N'      MOTR = CASE WHEN @remanente > 0.0001 THEN NULL ELSE MOTR END,' + CHAR(10) +
    N'      TIPOM = CASE WHEN @remanente > 0.0001 THEN 0 ELSE TIPOM END,' + CHAR(10) +
    N'      REEORD = CASE WHEN @remanente > 0.0001 THEN NULL ELSE @newIord END,' + CHAR(10) +
    N'      selCtrlOrd = NULL,' + CHAR(10) +
    N'      ESTSEGU = CASE WHEN @remanente > 0.0001 THEN 3 ELSE 4 END,' + CHAR(10) +
    N'      ESTATUS = 2,' + CHAR(10) +
    N'      FCNMOD = GETDATE(),' + CHAR(10) +
    N'      COMAD = LEFT(' + CHAR(10) +
    N'        CONCAT(' + CHAR(10) +
    N'          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''''),' + CHAR(10) +
    N'          CASE' + CHAR(10) +
    N'            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''''))) = ''''' + CHAR(10) +
    N'              THEN ''''' + CHAR(10) +
    N'            ELSE '' | ''' + CHAR(10) +
    N'          END,' + CHAR(10) +
    N'          ''CAMBIO MATERIAL: '',' + CHAR(10) +
    N'          @motivoLabel' + CHAR(10) +
    N'        ),' + CHAR(10) +
    N'        2000' + CHAR(10) +
    N'      )' + CHAR(10) +
    N'    WHERE IORD = @IORD;';

  DECLARE @partialMarker NVARCHAR(200) =
    N'CTD = CASE WHEN @remanente > 0.0001 THEN @remanente ELSE @ctdOrig END';
  IF CHARINDEX(@partialMarker, @spCambio) = 0
  BEGIN
    IF CHARINDEX(@oldOriginalUpdate, @spCambio) = 0
      THROW 59132, 'No se encontró la actualización original esperada; no se modificó el procedimiento', 1;
    SET @spCambio = REPLACE(@spCambio, @oldOriginalUpdate, @newOriginalUpdate);
  END;

  EXEC sys.sp_executesql @spCambio;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
