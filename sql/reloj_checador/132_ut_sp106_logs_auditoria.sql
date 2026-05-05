SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.ATT_TIME_LOG', 'U') IS NULL
  THROW 53100, 'Falta tabla dbo.ATT_TIME_LOG', 1;

IF OBJECT_ID('dbo.LOGS_AUDITORIA', 'U') IS NULL
  THROW 53101, 'Falta tabla dbo.LOGS_AUDITORIA', 1;

IF OBJECT_ID('dbo.sp_att_timelog_admin_update', 'P') IS NULL
  THROW 53102, 'Falta SP dbo.sp_att_timelog_admin_update', 1;

DECLARE @idUsuario INT = NULL;
DECLARE @suc NVARCHAR(10) = NULL;
DECLARE @idTimeLog BIGINT = NULL;
DECLARE @reason NVARCHAR(250) = N'UT_SP106_CAMBIO_CONTROLADO';
DECLARE @eventUtc DATETIME2(0) = SYSUTCDATETIME();
DECLARE @hash VARCHAR(64) = LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'UT_SP106_BASELINE'), 2));

SELECT TOP 1 @idUsuario = u.IDUSUARIO
FROM dbo.USUARIO u
WHERE u.IDUSUARIO > 0
ORDER BY u.IDUSUARIO;

SELECT TOP 1 @suc = LTRIM(RTRIM(d.SUC))
FROM dbo.DAT_SUC d
WHERE NULLIF(LTRIM(RTRIM(ISNULL(d.SUC, ''))), '') IS NOT NULL
ORDER BY d.SUC;

IF @idUsuario IS NULL
  THROW 53103, 'No existe usuario base para prueba', 1;

IF @suc IS NULL
  THROW 53104, 'No existe SUC base para prueba', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  INSERT INTO dbo.ATT_TIME_LOG (
    IDUSUARIO,
    SUC,
    TIPO,
    FCNR,
    AUTH_METHOD,
    LIVENESS_OK,
    LAT,
    LON,
    NOTES,
    CLIENT_IP,
    hash_verificacion,
    LOCKED
  )
  VALUES (
    @idUsuario,
    @suc,
    'ENTRADA',
    @eventUtc,
    'PIN',
    1,
    19.4326000,
    -99.1332000,
    'UT_SP106_BEFORE',
    '127.0.0.1',
    @hash,
    1
  );

  SET @idTimeLog = SCOPE_IDENTITY();

  EXEC dbo.sp_att_timelog_admin_update
    @IDTIMELOG = @idTimeLog,
    @FCNR = DATEADD(MINUTE, 5, @eventUtc),
    @NOTES = 'UT_SP106_AFTER',
    @TIPO = 'SALIDA',
    @REASON = @reason,
    @CHANGED_BY = @idUsuario,
    @IP = N'127.0.0.1',
    @URL = N'unit://sp106',
    @METHOD = N'PATCH';

  SELECT TOP 1
    la.id AS log_id,
    la.admin_id,
    la.accion,
    la.modulo,
    la.fecha,
    JSON_VALUE(la.detalles, '$.motivo') AS motivo,
    JSON_VALUE(la.detalles, '$.valor_anterior.NOTES') AS notes_antes,
    JSON_VALUE(la.detalles, '$.valor_nuevo.NOTES') AS notes_despues,
    JSON_VALUE(la.detalles, '$.valor_anterior.TIPO') AS tipo_antes,
    JSON_VALUE(la.detalles, '$.valor_nuevo.TIPO') AS tipo_despues,
    JSON_QUERY(la.detalles, '$.valor_anterior') AS valor_anterior_json,
    JSON_QUERY(la.detalles, '$.valor_nuevo') AS valor_nuevo_json
  FROM dbo.LOGS_AUDITORIA la
  WHERE la.admin_id = @idUsuario
    AND la.accion = 'ADMIN_UPDATE_ATT_TIME_LOG'
    AND JSON_VALUE(la.detalles, '$.IDTIMELOG') = CONVERT(VARCHAR(30), @idTimeLog)
    AND JSON_VALUE(la.detalles, '$.motivo') = @reason
  ORDER BY la.id DESC;

  ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
