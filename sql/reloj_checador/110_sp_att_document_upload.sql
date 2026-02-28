CREATE OR ALTER PROCEDURE dbo.sp_att_document_upload
  @IDUSUARIO INT,
  @IDINC BIGINT = NULL,
  @SUC NVARCHAR(10),
  @TIPO VARCHAR(30),
  @FILE_NAME NVARCHAR(160),
  @MIME_TYPE NVARCHAR(80),
  @CONTENT VARBINARY(MAX),
  @SHA256 VARCHAR(64) = NULL,
  @UPLOADED_BY INT = NULL,
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @sucNorm NVARCHAR(10) = LTRIM(RTRIM(ISNULL(@SUC, '')));
  DECLARE @tipoNorm VARCHAR(30) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO, ''))));
  DECLARE @fileNameNorm NVARCHAR(160) = LTRIM(RTRIM(ISNULL(@FILE_NAME, '')));
  DECLARE @mimeNorm NVARCHAR(80) = LTRIM(RTRIM(ISNULL(@MIME_TYPE, '')));
  DECLARE @fileSize INT = DATALENGTH(@CONTENT);
  DECLARE @idDoc BIGINT;
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDUSUARIO IS NULL OR @IDUSUARIO <= 0
    THROW 52341, 'IDUSUARIO invalido para documento', 1;

  IF @sucNorm = ''
    THROW 52342, 'SUC es requerido para documento', 1;

  IF @tipoNorm NOT IN ('EXPEDIENTE', 'JUSTIFICANTE', 'INE', 'CONTRATO', 'OTRO')
    THROW 52343, 'TIPO de documento invalido', 1;

  IF @fileNameNorm = ''
    THROW 52344, 'FILE_NAME es requerido', 1;

  IF @mimeNorm = ''
    THROW 52345, 'MIME_TYPE es requerido', 1;

  IF @fileSize IS NULL OR @fileSize <= 0
    THROW 52346, 'CONTENT de documento es requerido', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.USUARIO WHERE IDUSUARIO = @IDUSUARIO)
    THROW 52347, 'Usuario de documento no existe', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.DAT_SUC WHERE SUC = @sucNorm)
    THROW 52348, 'SUC de documento no existe', 1;

  IF @IDINC IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ATT_INCIDENCIA WHERE IDINC = @IDINC)
    THROW 52349, 'IDINC no existe para adjuntar documento', 1;

  BEGIN TRANSACTION;

  INSERT INTO dbo.ATT_DOCUMENTO (
    IDUSUARIO,
    IDINC,
    SUC,
    TIPO,
    FILE_NAME,
    MIME_TYPE,
    FILE_SIZE,
    CONTENT,
    SHA256
  )
  VALUES (
    @IDUSUARIO,
    @IDINC,
    @sucNorm,
    @tipoNorm,
    @fileNameNorm,
    @mimeNorm,
    @fileSize,
    @CONTENT,
    NULLIF(LTRIM(RTRIM(ISNULL(@SHA256, ''))), '')
  );

  SET @idDoc = SCOPE_IDENTITY();

  SET @metadataJson = (
    SELECT
      @URL AS url,
      @METHOD AS method,
      (
        SELECT
          @IDUSUARIO AS idUsuario,
          @IDINC AS idInc,
          @sucNorm AS suc,
          @tipoNorm AS tipo,
          @fileNameNorm AS fileName,
          @mimeNorm AS mimeType,
          @fileSize AS fileSize,
          @SHA256 AS sha256
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
    COALESCE(@UPLOADED_BY, @IDUSUARIO),
    'POST',
    'reloj_checador',
    'ATT_DOCUMENTO',
    CONVERT(NVARCHAR(80), @idDoc),
    @sucNorm,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  COMMIT TRANSACTION;

  SELECT TOP 1
    d.IDDOC,
    d.IDUSUARIO,
    d.IDINC,
    d.SUC,
    d.TIPO,
    d.FILE_NAME,
    d.MIME_TYPE,
    d.FILE_SIZE,
    d.SHA256,
    d.FCNR
  FROM dbo.ATT_DOCUMENTO d
  WHERE d.IDDOC = @idDoc;
END;
GO


