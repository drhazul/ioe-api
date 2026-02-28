CREATE OR ALTER PROCEDURE dbo.sp_att_document_download
  @IDDOC BIGINT,
  @REQUESTED_BY INT = NULL,
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @suc NVARCHAR(10);
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDDOC IS NULL OR @IDDOC <= 0
    THROW 52361, 'IDDOC invalido', 1;

  SELECT TOP 1
    @suc = d.SUC
  FROM dbo.ATT_DOCUMENTO d
  WHERE d.IDDOC = @IDDOC;

  IF @suc IS NULL
    THROW 52362, 'Documento no encontrado', 1;

  SET @metadataJson = (
    SELECT
      @URL AS url,
      @METHOD AS method,
      (
        SELECT @IDDOC AS idDoc FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
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
    @REQUESTED_BY,
    'GET',
    'reloj_checador',
    'ATT_DOCUMENTO',
    CONVERT(NVARCHAR(80), @IDDOC),
    @suc,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  SELECT TOP 1
    d.IDDOC,
    d.IDUSUARIO,
    d.IDINC,
    d.SUC,
    d.TIPO,
    d.FILE_NAME,
    d.MIME_TYPE,
    d.FILE_SIZE,
    d.CONTENT,
    d.SHA256,
    d.FCNR
  FROM dbo.ATT_DOCUMENTO d
  WHERE d.IDDOC = @IDDOC;
END;
GO


