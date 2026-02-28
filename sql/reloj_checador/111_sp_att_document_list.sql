CREATE OR ALTER PROCEDURE dbo.sp_att_document_list
  @IDUSUARIO INT = NULL,
  @IDINC BIGINT = NULL,
  @SUC NVARCHAR(10) = NULL,
  @DATE_FROM DATE = NULL,
  @DATE_TO DATE = NULL,
  @PAGE INT = 1,
  @LIMIT INT = 100,
  @REQUESTED_BY INT = NULL,
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm NVARCHAR(10) = NULLIF(LTRIM(RTRIM(ISNULL(@SUC, ''))), '');
  DECLARE @safePage INT = CASE WHEN ISNULL(@PAGE, 0) < 1 THEN 1 ELSE @PAGE END;
  DECLARE @safeLimit INT = CASE
    WHEN ISNULL(@LIMIT, 0) < 1 THEN 100
    WHEN @LIMIT > 500 THEN 500
    ELSE @LIMIT
  END;
  DECLARE @metadataJson NVARCHAR(MAX);

  SET @metadataJson = (
    SELECT
      @URL AS url,
      @METHOD AS method,
      (
        SELECT
          @IDUSUARIO AS idUsuario,
          @IDINC AS idInc,
          @sucNorm AS suc,
          @DATE_FROM AS dateFrom,
          @DATE_TO AS dateTo,
          @safePage AS page,
          @safeLimit AS [limit]
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      ) AS filters
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
    NULL,
    @sucNorm,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  SELECT
    d.IDDOC,
    d.IDUSUARIO,
    u.USERNAME,
    LTRIM(RTRIM(CONCAT(ISNULL(u.NOMBRE, ''), ' ', ISNULL(u.APELLIDOS, '')))) AS NOMBRE_COMPLETO,
    d.IDINC,
    d.SUC,
    d.TIPO,
    d.FILE_NAME,
    d.MIME_TYPE,
    d.FILE_SIZE,
    d.SHA256,
    d.FCNR,
    COUNT(1) OVER() AS TOTAL_COUNT
  FROM dbo.ATT_DOCUMENTO d
  LEFT JOIN dbo.USUARIO u ON u.IDUSUARIO = d.IDUSUARIO
  WHERE (@IDUSUARIO IS NULL OR d.IDUSUARIO = @IDUSUARIO)
    AND (@IDINC IS NULL OR d.IDINC = @IDINC)
    AND (@sucNorm IS NULL OR d.SUC = @sucNorm)
    AND (@DATE_FROM IS NULL OR CONVERT(DATE, d.FCNR) >= @DATE_FROM)
    AND (@DATE_TO IS NULL OR CONVERT(DATE, d.FCNR) <= @DATE_TO)
  ORDER BY d.FCNR DESC
  OFFSET (@safePage - 1) * @safeLimit ROWS
  FETCH NEXT @safeLimit ROWS ONLY;
END;
GO


