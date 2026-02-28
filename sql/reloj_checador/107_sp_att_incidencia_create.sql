CREATE OR ALTER PROCEDURE dbo.sp_att_incidencia_create
  @IDUSUARIO INT,
  @SUC NVARCHAR(10),
  @TIPO VARCHAR(30),
  @FECHA_INI DATE,
  @FECHA_FIN DATE,
  @MOTIVO NVARCHAR(250) = NULL,
  @ESTATUS VARCHAR(20) = 'SOLICITADA',
  @APROBADA_POR INT = NULL,
  @CREATED_BY INT = NULL,
  @IP NVARCHAR(64) = NULL,
  @URL NVARCHAR(400) = NULL,
  @METHOD NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @sucNorm NVARCHAR(10) = LTRIM(RTRIM(ISNULL(@SUC, '')));
  DECLARE @tipoNorm VARCHAR(30) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO, ''))));
  DECLARE @estatusNorm VARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@ESTATUS, 'SOLICITADA'))));
  DECLARE @idInc BIGINT;
  DECLARE @metadataJson NVARCHAR(MAX);

  IF @IDUSUARIO IS NULL OR @IDUSUARIO <= 0
    THROW 52301, 'IDUSUARIO invalido', 1;

  IF @sucNorm = ''
    THROW 52302, 'SUC es requerido', 1;

  IF @tipoNorm NOT IN ('VACACIONES', 'PERMISO_GOCE', 'PERMISO_SIN_GOCE', 'INCAPACIDAD', 'FALTA', 'RETARDO', 'OTRO')
    THROW 52303, 'TIPO de incidencia invalido', 1;

  IF @estatusNorm NOT IN ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'CERRADA')
    THROW 52304, 'ESTATUS de incidencia invalido', 1;

  IF @FECHA_INI IS NULL OR @FECHA_FIN IS NULL OR @FECHA_FIN < @FECHA_INI
    THROW 52305, 'Rango de fechas invalido', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.USUARIO WHERE IDUSUARIO = @IDUSUARIO)
    THROW 52306, 'Usuario de incidencia no existe', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.DAT_SUC WHERE SUC = @sucNorm)
    THROW 52307, 'SUC de incidencia no existe', 1;

  BEGIN TRANSACTION;

  INSERT INTO dbo.ATT_INCIDENCIA (
    IDUSUARIO,
    SUC,
    TIPO,
    FECHA_INI,
    FECHA_FIN,
    MOTIVO,
    ESTATUS,
    APROBADA_POR
  )
  VALUES (
    @IDUSUARIO,
    @sucNorm,
    @tipoNorm,
    @FECHA_INI,
    @FECHA_FIN,
    NULLIF(LTRIM(RTRIM(ISNULL(@MOTIVO, ''))), ''),
    @estatusNorm,
    @APROBADA_POR
  );

  SET @idInc = SCOPE_IDENTITY();

  SET @metadataJson = (
    SELECT
      @URL AS url,
      @METHOD AS method,
      (
        SELECT
          @IDUSUARIO AS idUsuario,
          @sucNorm AS suc,
          @tipoNorm AS tipo,
          @FECHA_INI AS fechaIni,
          @FECHA_FIN AS fechaFin,
          @MOTIVO AS motivo,
          @estatusNorm AS estatus,
          @APROBADA_POR AS aprobadaPor
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
    COALESCE(@CREATED_BY, @IDUSUARIO),
    'POST',
    'reloj_checador',
    'ATT_INCIDENCIA',
    CONVERT(NVARCHAR(80), @idInc),
    @sucNorm,
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
  WHERE i.IDINC = @idInc;
END;
GO


