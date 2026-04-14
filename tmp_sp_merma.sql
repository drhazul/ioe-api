
CREATE   PROCEDURE dbo.sp_ordenes_trabajo_merma
  @IORD NVARCHAR(255),
  @CANTIDAD_MERMA FLOAT,
  @MOTIVO NVARCHAR(255),
  @CREAR_NUEVA_ORD BIT = 1,
  @MOTR INT = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @idfol NVARCHAR(255);
  DECLARE @sucOrd NVARCHAR(10);
  DECLARE @artOrig NVARCHAR(255);
  DECLARE @ctdOrig FLOAT;
  DECLARE @clien FLOAT;
  DECLARE @remanente FLOAT;
  DECLARE @newIord NVARCHAR(255) = NULL;
  DECLARE @tipom INT = 2;
  DECLARE @tipomOrd INT = 0;
  DECLARE @estseguOrd FLOAT = 0;
  DECLARE @motrInt INT = ISNULL(@MOTR, TRY_CONVERT(INT, @MOTIVO));
  DECLARE @motivoLabel NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@MOTIVO, '')));
  DECLARE @ctdMermaAbs FLOAT = 0;
  DECLARE @ctdMermaSalida FLOAT = 0;
  DECLARE @docpMerma NVARCHAR(255);
  DECLARE @txtMermaReingreso NVARCHAR(255);
  DECLARE @txtMermaSalida NVARCHAR(255);

  IF ISNULL(@CANTIDAD_MERMA, 0) <= 0
    THROW 58030, 'cantidadMerma debe ser mayor a cero', 1;

  IF OBJECT_ID('dbo.DAT_ORD_MOTM', 'U') IS NOT NULL
  BEGIN
    IF @motrInt IS NULL OR @motrInt <= 0
    BEGIN
      SELECT TOP 1 @motrInt = TRY_CONVERT(INT, IDM)
      FROM dbo.DAT_ORD_MOTM
      WHERE TRY_CONVERT(INT, TIPO) = 2
        AND UPPER(LTRIM(RTRIM(ISNULL(MOTM, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@motivoLabel, ''))));
    END;

    SELECT TOP 1 @motivoLabel = LTRIM(RTRIM(ISNULL(MOTM, '')))
    FROM dbo.DAT_ORD_MOTM
    WHERE TRY_CONVERT(INT, IDM) = @motrInt
      AND TRY_CONVERT(INT, TIPO) = 2;

    IF @motrInt IS NULL OR @motrInt <= 0 OR LTRIM(RTRIM(ISNULL(@motivoLabel, ''))) = ''
      THROW 58031, 'Debe seleccionar un motivo valido de DAT_ORD_MOTM para merma', 1;
  END;

  IF LTRIM(RTRIM(ISNULL(@motivoLabel, ''))) = ''
    THROW 58031, 'motivo es requerido para merma', 1;

  SELECT TOP 1
    @idfol = o.IDFOL,
    @sucOrd = o.SUC,
    @artOrig = o.ART,
    @ctdOrig = TRY_CONVERT(FLOAT, o.CTD),
    @clien = TRY_CONVERT(FLOAT, o.CLIEN),
    @tipomOrd = TRY_CONVERT(INT, o.TIPOM),
    @estseguOrd = TRY_CONVERT(FLOAT, o.ESTSEGU)
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  WHERE o.IORD = @IORD
    AND (
      @SUC IS NULL
      OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@SUC)
      OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) = UPPER(@SUC)
    )
    AND (
      @IS_ADMIN = 1
      OR NOT EXISTS (SELECT 1 FROM @allowed)
      OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (SELECT SUC FROM @allowed)
      OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) IN (SELECT SUC FROM @allowed)
    );

  IF @idfol IS NULL
    THROW 58032, 'No existe la ORD origen o no tiene acceso por sucursal', 1;

  IF @estseguOrd IS NULL OR ABS(@estseguOrd - 9.2) > 0.0001
    THROW 58035, 'La ORD debe estar en flujo 9.2 para aplicar merma', 1;

  IF ISNULL(@tipomOrd, 0) <> 2
    THROW 58036, 'La ORD debe tener TIPOM=2 para aplicar merma', 1;

  IF ISNULL(@ctdOrig, 0) <= 0
    THROW 58033, 'La ORD no tiene cantidad valida para procesar merma', 1;

  IF @CANTIDAD_MERMA > @ctdOrig
    THROW 58034, 'cantidadMerma no puede ser mayor a la cantidad original', 1;

  SET @remanente = @ctdOrig - @CANTIDAD_MERMA;

  IF @CREAR_NUEVA_ORD = 1
    SET @newIord = LEFT(CONCAT(ISNULL(@idfol, 'ORD'), '-MR-', FORMAT(GETDATE(), 'yyyyMMddHHmmss'), '-', RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)), 255);

  SET @ctdMermaAbs = ABS(@CANTIDAD_MERMA);
  SET @ctdMermaSalida = -ABS(@CANTIDAD_MERMA);
  SET @docpMerma = ISNULL(@idfol, @IORD);
  SET @txtMermaReingreso = CONCAT('Reintegracion por merma ORD ', @IORD);
  SET @txtMermaSalida = CONCAT('Salida por merma ORD ', ISNULL(@newIord, @IORD));

  BEGIN TRY
    BEGIN TRANSACTION;

    IF @CREAR_NUEVA_ORD = 1
    BEGIN
      EXEC dbo.sp_ordenes_trabajo_clone_ord
        @IORD_ORIG = @IORD,
        @IORD_NEW = @newIord,
        @NEW_ART = @artOrig,
        @NEW_CTD = @CANTIDAD_MERMA,
        @TIPOM = @tipom,
        @MOTR = @motrInt,
        @REEORD = @IORD,
        @DOCDIF = NULL,
        @ESTSEGU = 3,
        @ESTATUS = 2;

      IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.PV_CTR_ORDS_DET (IORD, ART, JOB, ESF, CIL, EJE)
        SELECT
          @newIord,
          d.ART,
          d.JOB,
          d.ESF,
          d.CIL,
          d.EJE
        FROM dbo.PV_CTR_ORDS_DET d
        WHERE d.IORD = @IORD;
      END;
    END;

    UPDATE dbo.PV_CTR_ORDS
    SET
      CTD = CASE WHEN @remanente > 0 THEN @remanente ELSE CTD END,
      ESTSEGU = CASE WHEN @remanente > 0 THEN ESTSEGU ELSE 4 END,
      ESTATUS = 2,
      FCNMOD = GETDATE(),
      COMAD = LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          'MERMA: ',
          @motivoLabel
        ),
        2000
      )
    WHERE IORD = @IORD;

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdMermaAbs,
      @TXT = @txtMermaReingreso,
      @DOCP = @docpMerma,
      @USR = @USER,
      @CLSM = 'ORD';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdMermaSalida,
      @TXT = @txtMermaSalida,
      @DOCP = @docpMerma,
      @USR = @USER,
      @CLSM = 'ORD';

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    @IORD AS IORD_ORIG,
    @newIord AS IORD_NUEVA,
    @idfol AS IDFOL,
    @motrInt AS MOTR,
    @motivoLabel AS MOTIVO,
    @ctdOrig AS CTD_ORIGINAL,
    @CANTIDAD_MERMA AS CTD_MERMA,
    @remanente AS CTD_REMANENTE,
    CASE WHEN @remanente <= 0 THEN 1 ELSE 0 END AS ORD_CANCELADA,
    @sucOrd AS SUC,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR;
END;

