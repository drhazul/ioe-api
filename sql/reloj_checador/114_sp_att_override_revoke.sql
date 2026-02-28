CREATE OR ALTER PROCEDURE dbo.sp_att_override_revoke
  @IDOVR BIGINT,
  @REVOKED_BY INT,
  @REASON NVARCHAR(250),
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @suc NVARCHAR(10);
  DECLARE @beforeJson NVARCHAR(MAX);
  DECLARE @afterJson NVARCHAR(MAX);
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDOVR IS NULL OR @IDOVR <= 0
    THROW 52401, 'IDOVR invalido', 1;

  IF @REVOKED_BY IS NULL OR @REVOKED_BY <= 0
    THROW 52402, 'REVOKED_BY invalido', 1;

  IF NULLIF(LTRIM(RTRIM(ISNULL(@REASON, ''))), '') IS NULL
    THROW 52403, 'REASON es requerido para revocar override', 1;

  BEGIN TRANSACTION;

  SELECT TOP 1
    @suc = o.SUC,
    @beforeJson = (
      SELECT
        o.IDOVR,
        o.IDUSUARIO,
        o.SUC,
        o.TIPO,
        o.REASON,
        o.AUTH_BY,
        o.VALID_UNTIL,
        o.FCNR
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM dbo.ATT_OVERRIDE o WITH (UPDLOCK, HOLDLOCK)
  WHERE o.IDOVR = @IDOVR;

  IF @beforeJson IS NULL
    THROW 52404, 'Override no encontrado para revocar', 1;

  UPDATE dbo.ATT_OVERRIDE
  SET VALID_UNTIL = CASE
    WHEN VALID_UNTIL > SYSUTCDATETIME() THEN SYSUTCDATETIME()
    ELSE VALID_UNTIL
  END
  WHERE IDOVR = @IDOVR;

  SELECT TOP 1
    @afterJson = (
      SELECT
        o.IDOVR,
        o.IDUSUARIO,
        o.SUC,
        o.TIPO,
        o.REASON,
        o.AUTH_BY,
        o.VALID_UNTIL,
        o.FCNR
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM dbo.ATT_OVERRIDE o
  WHERE o.IDOVR = @IDOVR;

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
    @REVOKED_BY,
    'PUT',
    'reloj_checador',
    'ATT_OVERRIDE',
    CONVERT(NVARCHAR(80), @IDOVR),
    @suc,
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
  WHERE o.IDOVR = @IDOVR;
END;
GO


