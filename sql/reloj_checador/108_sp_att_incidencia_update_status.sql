CREATE OR ALTER PROCEDURE dbo.sp_att_incidencia_update_status
  @IDINC BIGINT,
  @ESTATUS VARCHAR(20),
  @APROBADA_POR INT = NULL,
  @REASON NVARCHAR(250) = NULL,
  @CHANGED_BY INT,
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @estatusNorm VARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@ESTATUS, ''))));
  DECLARE @suc NVARCHAR(10);
  DECLARE @beforeJson NVARCHAR(MAX);
  DECLARE @afterJson NVARCHAR(MAX);
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDINC IS NULL OR @IDINC <= 0
    THROW 52321, 'IDINC invalido', 1;

  IF @CHANGED_BY IS NULL OR @CHANGED_BY <= 0
    THROW 52322, 'CHANGED_BY invalido', 1;

  IF @estatusNorm NOT IN ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'CERRADA')
    THROW 52323, 'ESTATUS invalido para incidencia', 1;

  BEGIN TRANSACTION;

  SELECT TOP 1
    @suc = i.SUC,
    @beforeJson = (
      SELECT
        i.IDINC,
        i.IDUSUARIO,
        i.SUC,
        i.TIPO,
        i.FECHA_INI,
        i.FECHA_FIN,
        i.MOTIVO,
        i.ESTATUS,
        i.APROBADA_POR,
        i.FCNR
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM dbo.ATT_INCIDENCIA i WITH (UPDLOCK, HOLDLOCK)
  WHERE i.IDINC = @IDINC;

  IF @beforeJson IS NULL
    THROW 52324, 'No existe incidencia para actualizar', 1;

  UPDATE dbo.ATT_INCIDENCIA
  SET
    ESTATUS = @estatusNorm,
    APROBADA_POR = CASE
      WHEN @estatusNorm IN ('APROBADA', 'RECHAZADA', 'CERRADA') THEN COALESCE(@APROBADA_POR, @CHANGED_BY)
      ELSE APROBADA_POR
    END
  WHERE IDINC = @IDINC;

  SELECT TOP 1
    @afterJson = (
      SELECT
        i.IDINC,
        i.IDUSUARIO,
        i.SUC,
        i.TIPO,
        i.FECHA_INI,
        i.FECHA_FIN,
        i.MOTIVO,
        i.ESTATUS,
        i.APROBADA_POR,
        i.FCNR
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM dbo.ATT_INCIDENCIA i
  WHERE i.IDINC = @IDINC;

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
    'PUT',
    'reloj_checador',
    'ATT_INCIDENCIA',
    CONVERT(NVARCHAR(80), @IDINC),
    @suc,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  COMMIT TRANSACTION;

  SELECT TOP 1
    i.IDINC,
    i.IDUSUARIO,
    i.SUC,
    i.TIPO,
    i.FECHA_INI,
    i.FECHA_FIN,
    i.MOTIVO,
    i.ESTATUS,
    i.APROBADA_POR,
    i.FCNR
  FROM dbo.ATT_INCIDENCIA i
  WHERE i.IDINC = @IDINC;
END;
GO


