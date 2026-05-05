CREATE OR ALTER PROCEDURE dbo.sp_att_timelog_admin_update
  @IDTIMELOG BIGINT,
  @FCNR DATETIME2(0) = NULL,
  @NOTES VARCHAR(250) = NULL,
  @TIPO VARCHAR(20) = NULL,
  @REASON NVARCHAR(250),
  @CHANGED_BY INT,
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @tipoNorm VARCHAR(20) = NULL;
  DECLARE @suc NVARCHAR(10) = NULL;
  DECLARE @beforeJson NVARCHAR(MAX);
  DECLARE @afterJson NVARCHAR(MAX);
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDTIMELOG IS NULL OR @IDTIMELOG <= 0
    THROW 52201, 'IDTIMELOG invalido', 1;

  IF @CHANGED_BY IS NULL OR @CHANGED_BY <= 0
    THROW 52202, 'CHANGED_BY invalido', 1;

  IF NULLIF(LTRIM(RTRIM(ISNULL(@REASON, ''))), '') IS NULL
    THROW 52203, 'REASON es requerido', 1;

  IF @TIPO IS NOT NULL
  BEGIN
    SET @tipoNorm = UPPER(LTRIM(RTRIM(@TIPO)));
    IF @tipoNorm NOT IN ('ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA')
      THROW 52204, 'TIPO invalido para ATT_TIME_LOG', 1;
  END;

  BEGIN TRANSACTION;

  SELECT TOP 1
    @suc = tl.SUC,
    @beforeJson = (
      SELECT
        tl.IDTIMELOG,
        tl.IDUSUARIO,
        tl.SUC,
        tl.TIPO,
        tl.FCNR,
        tl.LAT,
        tl.LON,
        tl.GPS_ACCURACY_M,
        tl.WITHIN_GEOFENCE,
        tl.AUTH_METHOD,
        tl.LIVENESS_OK,
        tl.DEVICE_ID,
        tl.CLIENT_IP,
        tl.NOTES,
        tl.hash_verificacion,
        tl.LOCKED
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM dbo.ATT_TIME_LOG tl WITH (UPDLOCK, HOLDLOCK)
  WHERE tl.IDTIMELOG = @IDTIMELOG;

  IF @beforeJson IS NULL
    THROW 52205, 'No existe ATT_TIME_LOG con IDTIMELOG indicado', 1;

  UPDATE dbo.ATT_TIME_LOG
  SET
    FCNR = COALESCE(@FCNR, FCNR),
    NOTES = COALESCE(@NOTES, NOTES),
    TIPO = COALESCE(@tipoNorm, TIPO)
  WHERE IDTIMELOG = @IDTIMELOG;

  SELECT TOP 1
    @afterJson = (
      SELECT
        tl.IDTIMELOG,
        tl.IDUSUARIO,
        tl.SUC,
        tl.TIPO,
        tl.FCNR,
        tl.LAT,
        tl.LON,
        tl.GPS_ACCURACY_M,
        tl.WITHIN_GEOFENCE,
        tl.AUTH_METHOD,
        tl.LIVENESS_OK,
        tl.DEVICE_ID,
        tl.CLIENT_IP,
        tl.NOTES,
        tl.hash_verificacion,
        tl.LOCKED
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM dbo.ATT_TIME_LOG tl
  WHERE tl.IDTIMELOG = @IDTIMELOG;

  SET @metadataJson = (
    SELECT
      @URL AS url,
      @METHOD AS method,
      @REASON AS reason,
      JSON_QUERY(@beforeJson) AS [before],
      JSON_QUERY(@afterJson) AS [after]
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
  );

  INSERT INTO dbo.AUDIT_LOG (
    IDUSUARIO,
    ACTION,
    MODULO,
    ENTIDAD,
    ENTIDAD_ID,
    SUC,
    METADATA_JSON,
    IP,
    FCNR
  )
  VALUES (
    @CHANGED_BY,
    'ADMIN_UPDATE',
    'reloj_checador',
    'ATT_TIME_LOG',
    CONVERT(NVARCHAR(80), @IDTIMELOG),
    @suc,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  IF OBJECT_ID('dbo.LOGS_AUDITORIA', 'U') IS NOT NULL
  BEGIN
    INSERT INTO dbo.LOGS_AUDITORIA (
      admin_id,
      accion,
      modulo,
      ip_origen,
      detalles
    )
    VALUES (
      @CHANGED_BY,
      'ADMIN_UPDATE_ATT_TIME_LOG',
      'reloj_checador',
      @IP,
      (
        SELECT
          @CHANGED_BY AS ID_ADMIN,
          @IDTIMELOG AS IDTIMELOG,
          JSON_QUERY(@beforeJson) AS valor_anterior,
          JSON_QUERY(@afterJson) AS valor_nuevo,
          @REASON AS motivo,
          @URL AS url,
          @METHOD AS metodo
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      )
    );
  END;

  COMMIT TRANSACTION;

  SELECT TOP 1
    tl.IDTIMELOG,
    tl.IDUSUARIO,
    tl.SUC,
    tl.TIPO,
    tl.FCNR,
    tl.LAT,
    tl.LON,
    tl.GPS_ACCURACY_M,
    tl.WITHIN_GEOFENCE,
    tl.AUTH_METHOD,
    tl.LIVENESS_OK,
    tl.DEVICE_ID,
    tl.CLIENT_IP,
    tl.NOTES,
    tl.hash_verificacion,
    tl.LOCKED
  FROM dbo.ATT_TIME_LOG tl
  WHERE tl.IDTIMELOG = @IDTIMELOG;
END;
GO


