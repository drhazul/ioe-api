CREATE OR ALTER PROCEDURE dbo.sp_att_incidencia_list
  @SUC NVARCHAR(10) = NULL,
  @IDUSUARIO INT = NULL,
  @DATE_FROM DATE = NULL,
  @DATE_TO DATE = NULL,
  @ESTATUS VARCHAR(20) = NULL,
  @TIPO VARCHAR(30) = NULL,
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
  DECLARE @estatusNorm VARCHAR(20) = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(@ESTATUS, '')))), '');
  DECLARE @tipoNorm VARCHAR(30) = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(@TIPO, '')))), '');
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
          @sucNorm AS suc,
          @IDUSUARIO AS idUsuario,
          @DATE_FROM AS dateFrom,
          @DATE_TO AS dateTo,
          @estatusNorm AS estatus,
          @tipoNorm AS tipo,
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
    'ATT_INCIDENCIA',
    NULL,
    @sucNorm,
    @metadataJson,
    @IP,
    SYSUTCDATETIME()
  );

  SELECT
    i.IDINC,
    i.IDUSUARIO,
    u.USERNAME,
    LTRIM(RTRIM(CONCAT(ISNULL(u.NOMBRE, ''), ' ', ISNULL(u.APELLIDOS, '')))) AS NOMBRE_COMPLETO,
    i.SUC,
    i.TIPO,
    i.FECHA_INI,
    i.FECHA_FIN,
    i.MOTIVO,
    i.ESTATUS,
    i.APROBADA_POR,
    i.FCNR,
    COUNT(1) OVER() AS TOTAL_COUNT
  FROM dbo.ATT_INCIDENCIA i
  LEFT JOIN dbo.USUARIO u ON u.IDUSUARIO = i.IDUSUARIO
  WHERE (@IDUSUARIO IS NULL OR i.IDUSUARIO = @IDUSUARIO)
    AND (@sucNorm IS NULL OR i.SUC = @sucNorm)
    AND (@estatusNorm IS NULL OR UPPER(i.ESTATUS) = @estatusNorm)
    AND (@tipoNorm IS NULL OR UPPER(i.TIPO) = @tipoNorm)
    AND (@DATE_FROM IS NULL OR i.FECHA_FIN >= @DATE_FROM)
    AND (@DATE_TO IS NULL OR i.FECHA_INI <= @DATE_TO)
  ORDER BY i.FECHA_INI DESC, i.IDINC DESC
  OFFSET (@safePage - 1) * @safeLimit ROWS
  FETCH NEXT @safeLimit ROWS ONLY;
END;
GO


