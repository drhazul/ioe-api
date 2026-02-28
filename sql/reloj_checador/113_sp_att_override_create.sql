CREATE OR ALTER PROCEDURE dbo.sp_att_override_create
  @IDUSUARIO INT,
  @SUC NVARCHAR(10),
  @TIPO VARCHAR(30),
  @REASON NVARCHAR(250),
  @AUTH_BY INT,
  @VALID_UNTIL DATETIME2(0),
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @sucNorm NVARCHAR(10) = LTRIM(RTRIM(ISNULL(@SUC, '')));
  DECLARE @tipoNorm VARCHAR(30) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO, ''))));
  DECLARE @reasonNorm NVARCHAR(250) = NULLIF(LTRIM(RTRIM(ISNULL(@REASON, ''))), '');
  DECLARE @idOvr BIGINT;
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDUSUARIO IS NULL OR @IDUSUARIO <= 0
    THROW 52381, 'IDUSUARIO invalido para override', 1;

  IF @AUTH_BY IS NULL OR @AUTH_BY <= 0
    THROW 52382, 'AUTH_BY invalido para override', 1;

  IF @sucNorm = ''
    THROW 52383, 'SUC es requerido para override', 1;

  IF @tipoNorm NOT IN ('OUT_OF_WINDOW', 'OUT_OF_GEOFENCE', 'SEQUENCE_OVERRIDE')
    THROW 52384, 'TIPO de override invalido', 1;

  IF @reasonNorm IS NULL
    THROW 52385, 'REASON es requerido para override', 1;

  IF @VALID_UNTIL IS NULL OR @VALID_UNTIL <= SYSUTCDATETIME()
    THROW 52386, 'VALID_UNTIL debe ser una fecha futura', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.USUARIO WHERE IDUSUARIO = @IDUSUARIO)
    THROW 52387, 'Usuario objetivo de override no existe', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.USUARIO WHERE IDUSUARIO = @AUTH_BY)
    THROW 52388, 'Usuario autorizador no existe', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.DAT_SUC WHERE SUC = @sucNorm)
    THROW 52389, 'SUC de override no existe', 1;

  BEGIN TRANSACTION;

  INSERT INTO dbo.ATT_OVERRIDE (
    IDUSUARIO,
    SUC,
    TIPO,
    REASON,
    AUTH_BY,
    VALID_UNTIL
  )
  VALUES (
    @IDUSUARIO,
    @sucNorm,
    @tipoNorm,
    @reasonNorm,
    @AUTH_BY,
    @VALID_UNTIL
  );

  SET @idOvr = SCOPE_IDENTITY();

  SET @metadataJson = (
    SELECT
      @URL AS url,
      @METHOD AS method,
      (
        SELECT
          @IDUSUARIO AS idUsuario,
          @sucNorm AS suc,
          @tipoNorm AS tipo,
          @reasonNorm AS reason,
          @AUTH_BY AS authBy,
          @VALID_UNTIL AS validUntil
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      ) AS body
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
    @AUTH_BY,
    'POST',
    'reloj_checador',
    'ATT_OVERRIDE',
    CONVERT(NVARCHAR(80), @idOvr),
    @sucNorm,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  COMMIT TRANSACTION;

  SELECT TOP 1
    o.IDOVR,
    o.IDUSUARIO,
    o.SUC,
    o.TIPO,
    o.REASON,
    o.AUTH_BY,
    o.VALID_UNTIL,
    o.FCNR
  FROM dbo.ATT_OVERRIDE o
  WHERE o.IDOVR = @idOvr;
END;
GO


