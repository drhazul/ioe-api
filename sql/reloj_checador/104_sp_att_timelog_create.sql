CREATE OR ALTER PROCEDURE dbo.sp_att_timelog_create
  @IDUSUARIO INT,
  @SUC NVARCHAR(10),
  @TIPO VARCHAR(20),
  @AUTH_METHOD VARCHAR(20),
  @LIVENESS_OK BIT,
  @LAT DECIMAL(10,7) = NULL,
  @LON DECIMAL(10,7) = NULL,
  @GPS_ACCURACY_M INT = NULL,
  @DEVICE_ID VARCHAR(80) = NULL,
  @CLIENT_IP VARCHAR(45) = NULL,
  @NOTES VARCHAR(250) = NULL,
  @OK BIT = NULL OUTPUT,
  @MESSAGE VARCHAR(200) = NULL OUTPUT,
  @IDTIMELOG BIGINT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET DATEFIRST 1;

  DECLARE @sucNorm NVARCHAR(10) = LTRIM(RTRIM(ISNULL(@SUC, '')));
  DECLARE @tipoNorm VARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO, ''))));
  DECLARE @authMethodNorm VARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@AUTH_METHOD, ''))));
  DECLARE @nowUtc DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @today DATE = CONVERT(DATE, @nowUtc);
  DECLARE @weekStart DATE = DATEADD(DAY, 1 - DATEPART(WEEKDAY, @today), @today);
  DECLARE @weekEnd DATE = DATEADD(DAY, 7, @weekStart);

  DECLARE @userDepto INT = NULL;
  DECLARE @userStatus NVARCHAR(30) = NULL;

  DECLARE @lastTipo VARCHAR(20) = NULL;
  DECLARE @lastFcnr DATETIME2(0) = NULL;
  DECLARE @isSequenceValid BIT = 0;

  DECLARE @hasWindowOverride BIT = 0;
  DECLARE @hasGeoOverride BIT = 0;
  DECLARE @hasSeqOverride BIT = 0;

  DECLARE @policyId INT = NULL;
  DECLARE @allowEarlyMin INT = 15;
  DECLARE @allowLateMin INT = 15;
  DECLARE @requireGps BIT = 0;
  DECLARE @policyLat DECIMAL(10,7) = NULL;
  DECLARE @policyLon DECIMAL(10,7) = NULL;
  DECLARE @policyRadiusM INT = NULL;
  DECLARE @gpsMaxAccuracyM INT = 50;
  DECLARE @requireLiveness BIT = 0;
  DECLARE @shiftStart TIME = NULL;
  DECLARE @shiftEnd TIME = NULL;
  DECLARE @lunchStart TIME = NULL;
  DECLARE @lunchEnd TIME = NULL;
  DECLARE @enforceWindows BIT = 0;
  DECLARE @overtimeDailyLimit DECIMAL(5,2) = 3.00;
  DECLARE @overtimeWeeklyLimit DECIMAL(5,2) = 9.00;

  DECLARE @baseWindowTime TIME = NULL;
  DECLARE @windowStart DATETIME2(0) = NULL;
  DECLARE @windowEnd DATETIME2(0) = NULL;

  DECLARE @withinGeofence BIT = 1;
  DECLARE @distanceM FLOAT = NULL;

  DECLARE @shiftSeconds INT = 28800;
  DECLARE @lunchSeconds INT = 0;
  DECLARE @dailyWorkedSeconds BIGINT = 0;
  DECLARE @dailyWorkedHours DECIMAL(10,2) = 0;
  DECLARE @dailyOvertimeHours DECIMAL(10,2) = 0;
  DECLARE @weeklyOvertimeHours DECIMAL(10,2) = 0;

  DECLARE @dailyAlertMetadata NVARCHAR(MAX) = NULL;
  DECLARE @weeklyAlertMetadata NVARCHAR(MAX) = NULL;

  SET @OK = 0;
  SET @MESSAGE = 'No procesado';
  SET @IDTIMELOG = NULL;

  BEGIN TRY
    IF @IDUSUARIO IS NULL OR @IDUSUARIO <= 0
      THROW 52101, 'IDUSUARIO invalido', 1;

    IF @sucNorm = ''
      THROW 52102, 'SUC es requerido', 1;

    IF @tipoNorm NOT IN ('ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA')
      THROW 52103, 'TIPO invalido. Valores: ENTRADA, SALIDA_COMER, REGRESO_COMER, SALIDA', 1;

    IF @authMethodNorm NOT IN ('FACE', 'FINGER', 'PIN')
      THROW 52104, 'AUTH_METHOD invalido. Valores: FACE, FINGER, PIN', 1;

    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.DAT_SUC WHERE SUC = @sucNorm)
      THROW 52105, 'La SUC no existe en DAT_SUC', 1;

    SELECT TOP 1
      @userDepto = TRY_CONVERT(INT, u.IDDEPTO),
      @userStatus = UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(30), ISNULL(u.ESTATUS, '')))))
    FROM dbo.USUARIO u
    WHERE u.IDUSUARIO = @IDUSUARIO;

    IF @userStatus IS NULL
      THROW 52106, 'El usuario no existe', 1;

    IF NOT (
      @userStatus IN ('ACTIVO', '1', 'TRUE')
      OR TRY_CONVERT(INT, @userStatus) = 1
    )
      THROW 52107, 'El usuario no esta activo', 1;

    DECLARE @policy TABLE (
      IDPOLICY INT NULL,
      SUC NVARCHAR(10) NOT NULL,
      IDDEPTO INT NULL,
      TIMEZONE VARCHAR(60) NOT NULL,
      ALLOW_EARLY_MIN INT NOT NULL,
      ALLOW_LATE_MIN INT NOT NULL,
      REQUIRE_GPS BIT NOT NULL,
      GEOFENCE_LAT DECIMAL(10,7) NULL,
      GEOFENCE_LON DECIMAL(10,7) NULL,
      GEOFENCE_RADIUS_M INT NULL,
      GPS_MAX_ACCURACY_M INT NOT NULL,
      REQUIRE_LIVENESS BIT NOT NULL,
      SHIFT_START TIME NULL,
      SHIFT_END TIME NULL,
      LUNCH_START TIME NULL,
      LUNCH_END TIME NULL,
      ENFORCE_WINDOWS BIT NOT NULL,
      OVERTIME_DAILY_LIMIT_HOURS DECIMAL(5,2) NOT NULL,
      OVERTIME_WEEKLY_LIMIT_HOURS DECIMAL(5,2) NOT NULL,
      ACTIVE BIT NOT NULL,
      FCNR DATETIME2(0) NOT NULL,
      IS_DB_POLICY BIT NOT NULL
    );

    INSERT INTO @policy
    EXEC dbo.sp_att_policy_get
      @SUC = @sucNorm,
      @IDDEPTO = @userDepto,
      @IDUSUARIO = @IDUSUARIO;

    SELECT TOP 1
      @policyId = p.IDPOLICY,
      @allowEarlyMin = p.ALLOW_EARLY_MIN,
      @allowLateMin = p.ALLOW_LATE_MIN,
      @requireGps = p.REQUIRE_GPS,
      @policyLat = p.GEOFENCE_LAT,
      @policyLon = p.GEOFENCE_LON,
      @policyRadiusM = p.GEOFENCE_RADIUS_M,
      @gpsMaxAccuracyM = p.GPS_MAX_ACCURACY_M,
      @requireLiveness = p.REQUIRE_LIVENESS,
      @shiftStart = p.SHIFT_START,
      @shiftEnd = p.SHIFT_END,
      @lunchStart = p.LUNCH_START,
      @lunchEnd = p.LUNCH_END,
      @enforceWindows = p.ENFORCE_WINDOWS,
      @overtimeDailyLimit = p.OVERTIME_DAILY_LIMIT_HOURS,
      @overtimeWeeklyLimit = p.OVERTIME_WEEKLY_LIMIT_HOURS
    FROM @policy p;

    SELECT TOP 1
      @lastTipo = tl.TIPO,
      @lastFcnr = tl.FCNR
    FROM dbo.ATT_TIME_LOG tl WITH (UPDLOCK, HOLDLOCK)
    WHERE tl.IDUSUARIO = @IDUSUARIO
      AND tl.SUC = @sucNorm
      AND CONVERT(DATE, tl.FCNR) = @today
    ORDER BY tl.FCNR DESC;

    IF EXISTS (
      SELECT 1
      FROM dbo.ATT_TIME_LOG tl WITH (UPDLOCK, HOLDLOCK)
      WHERE tl.IDUSUARIO = @IDUSUARIO
        AND tl.SUC = @sucNorm
        AND tl.TIPO = @tipoNorm
        AND DATEDIFF(SECOND, tl.FCNR, @nowUtc) BETWEEN 0 AND 30
    )
      THROW 52108, 'Marcaje duplicado detectado dentro de 30 segundos', 1;

    IF @lastTipo IS NULL
    BEGIN
      IF @tipoNorm = 'ENTRADA'
        SET @isSequenceValid = 1;
    END
    ELSE IF @lastTipo = 'ENTRADA'
    BEGIN
      IF @tipoNorm IN ('SALIDA_COMER', 'SALIDA')
        SET @isSequenceValid = 1;
    END
    ELSE IF @lastTipo = 'SALIDA_COMER'
    BEGIN
      IF @tipoNorm = 'REGRESO_COMER'
        SET @isSequenceValid = 1;
    END
    ELSE IF @lastTipo = 'REGRESO_COMER'
    BEGIN
      IF @tipoNorm = 'SALIDA'
        SET @isSequenceValid = 1;
    END
    ELSE IF @lastTipo = 'SALIDA'
    BEGIN
      SET @isSequenceValid = 0;
    END;

    IF @isSequenceValid = 0
    BEGIN
      SELECT TOP 1 @hasSeqOverride = 1
      FROM dbo.ATT_OVERRIDE ov
      WHERE ov.IDUSUARIO = @IDUSUARIO
        AND ov.SUC = @sucNorm
        AND ov.TIPO = 'SEQUENCE_OVERRIDE'
        AND ov.VALID_UNTIL >= @nowUtc
      ORDER BY ov.VALID_UNTIL DESC;

      IF ISNULL(@hasSeqOverride, 0) = 0
        THROW 52109, 'Secuencia de marcaje invalida para este checkpoint', 1;
    END;

    IF ISNULL(@enforceWindows, 0) = 1
    BEGIN
      SET @baseWindowTime = CASE
        WHEN @tipoNorm = 'ENTRADA' THEN @shiftStart
        WHEN @tipoNorm = 'SALIDA' THEN @shiftEnd
        WHEN @tipoNorm = 'SALIDA_COMER' THEN @lunchStart
        WHEN @tipoNorm = 'REGRESO_COMER' THEN @lunchEnd
        ELSE NULL
      END;

      IF @baseWindowTime IS NOT NULL
      BEGIN
        DECLARE @baseWindowDateTime DATETIME2(0) = DATEADD(
          SECOND,
          DATEDIFF(SECOND, CAST('00:00:00' AS TIME), @baseWindowTime),
          CAST(@today AS DATETIME2(0))
        );

        SET @windowStart = DATEADD(MINUTE, -ISNULL(@allowEarlyMin, 0), @baseWindowDateTime);
        SET @windowEnd = DATEADD(MINUTE, ISNULL(@allowLateMin, 0), @baseWindowDateTime);

        IF @nowUtc < @windowStart OR @nowUtc > @windowEnd
        BEGIN
          SELECT TOP 1 @hasWindowOverride = 1
          FROM dbo.ATT_OVERRIDE ov
          WHERE ov.IDUSUARIO = @IDUSUARIO
            AND ov.SUC = @sucNorm
            AND ov.TIPO = 'OUT_OF_WINDOW'
            AND ov.VALID_UNTIL >= @nowUtc
          ORDER BY ov.VALID_UNTIL DESC;

          IF ISNULL(@hasWindowOverride, 0) = 0
            THROW 52110, 'Marcaje fuera de la ventana permitida', 1;
        END;
      END;
    END;

    IF ISNULL(@requireGps, 0) = 1
    BEGIN
      IF @LAT IS NULL OR @LON IS NULL
        THROW 52111, 'La policy requiere GPS. LAT/LON son obligatorios', 1;

      IF @GPS_ACCURACY_M IS NOT NULL AND @GPS_ACCURACY_M > ISNULL(@gpsMaxAccuracyM, 50)
        THROW 52112, 'Precision GPS insuficiente para registrar marcaje', 1;

      IF @policyLat IS NULL OR @policyLon IS NULL OR @policyRadiusM IS NULL OR @policyRadiusM <= 0
        THROW 52113, 'Policy de geocerca incompleta para la SUC', 1;

      DECLARE @earthRadiusM FLOAT = 6371000.0;
      DECLARE @lat1 FLOAT = PI() * CONVERT(FLOAT, @policyLat) / 180.0;
      DECLARE @lon1 FLOAT = PI() * CONVERT(FLOAT, @policyLon) / 180.0;
      DECLARE @lat2 FLOAT = PI() * CONVERT(FLOAT, @LAT) / 180.0;
      DECLARE @lon2 FLOAT = PI() * CONVERT(FLOAT, @LON) / 180.0;
      DECLARE @dLat FLOAT = @lat2 - @lat1;
      DECLARE @dLon FLOAT = @lon2 - @lon1;
      DECLARE @a FLOAT =
        SIN(@dLat / 2.0) * SIN(@dLat / 2.0)
        + COS(@lat1) * COS(@lat2) * SIN(@dLon / 2.0) * SIN(@dLon / 2.0);
      DECLARE @c FLOAT = 2.0 * ATN2(SQRT(@a), SQRT(1.0 - @a));

      SET @distanceM = @earthRadiusM * @c;
      SET @withinGeofence = CASE WHEN @distanceM <= CONVERT(FLOAT, @policyRadiusM) THEN 1 ELSE 0 END;

      IF @withinGeofence = 0
      BEGIN
        SELECT TOP 1 @hasGeoOverride = 1
        FROM dbo.ATT_OVERRIDE ov
        WHERE ov.IDUSUARIO = @IDUSUARIO
          AND ov.SUC = @sucNorm
          AND ov.TIPO = 'OUT_OF_GEOFENCE'
          AND ov.VALID_UNTIL >= @nowUtc
        ORDER BY ov.VALID_UNTIL DESC;

        IF ISNULL(@hasGeoOverride, 0) = 0
          THROW 52114, 'Marcaje fuera de geocerca permitida', 1;
      END;
    END
    ELSE
    BEGIN
      SET @withinGeofence = 1;
    END;

    IF @authMethodNorm = 'FACE' AND ISNULL(@requireLiveness, 0) = 1 AND ISNULL(@LIVENESS_OK, 0) = 0
      THROW 52115, 'Liveness requerido para autenticacion FACE', 1;

    INSERT INTO dbo.ATT_TIME_LOG (
      IDUSUARIO,
      SUC,
      TIPO,
      FCNR,
      LAT,
      LON,
      GPS_ACCURACY_M,
      WITHIN_GEOFENCE,
      AUTH_METHOD,
      LIVENESS_OK,
      DEVICE_ID,
      CLIENT_IP,
      NOTES,
      LOCKED
    )
    VALUES (
      @IDUSUARIO,
      @sucNorm,
      @tipoNorm,
      @nowUtc,
      @LAT,
      @LON,
      @GPS_ACCURACY_M,
      ISNULL(@withinGeofence, 0),
      @authMethodNorm,
      ISNULL(@LIVENESS_OK, 0),
      NULLIF(LTRIM(RTRIM(ISNULL(@DEVICE_ID, ''))), ''),
      NULLIF(LTRIM(RTRIM(ISNULL(@CLIENT_IP, ''))), ''),
      NULLIF(LTRIM(RTRIM(ISNULL(@NOTES, ''))), ''),
      1
    );

    SET @IDTIMELOG = SCOPE_IDENTITY();

    IF @shiftStart IS NOT NULL AND @shiftEnd IS NOT NULL
    BEGIN
      DECLARE @shiftStartSeconds INT = DATEDIFF(SECOND, CAST('00:00:00' AS TIME), @shiftStart);
      DECLARE @shiftEndSeconds INT = DATEDIFF(SECOND, CAST('00:00:00' AS TIME), @shiftEnd);
      IF @shiftEndSeconds > @shiftStartSeconds
        SET @shiftSeconds = @shiftEndSeconds - @shiftStartSeconds;
    END;

    IF @lunchStart IS NOT NULL AND @lunchEnd IS NOT NULL
    BEGIN
      DECLARE @lunchStartSeconds INT = DATEDIFF(SECOND, CAST('00:00:00' AS TIME), @lunchStart);
      DECLARE @lunchEndSeconds INT = DATEDIFF(SECOND, CAST('00:00:00' AS TIME), @lunchEnd);
      IF @lunchEndSeconds > @lunchStartSeconds
      BEGIN
        SET @lunchSeconds = @lunchEndSeconds - @lunchStartSeconds;
        IF @shiftSeconds > @lunchSeconds
          SET @shiftSeconds = @shiftSeconds - @lunchSeconds;
      END;
    END;

    IF @shiftSeconds <= 0
      SET @shiftSeconds = 28800;

    ;WITH DayLogs AS (
      SELECT
        tl.TIPO,
        tl.FCNR,
        LEAD(tl.TIPO) OVER (ORDER BY tl.FCNR) AS NEXT_TIPO,
        LEAD(tl.FCNR) OVER (ORDER BY tl.FCNR) AS NEXT_FCNR
      FROM dbo.ATT_TIME_LOG tl
      WHERE tl.IDUSUARIO = @IDUSUARIO
        AND tl.SUC = @sucNorm
        AND CONVERT(DATE, tl.FCNR) = @today
    )
    SELECT
      @dailyWorkedSeconds = ISNULL(
        SUM(
          CASE
            WHEN TIPO IN ('ENTRADA', 'REGRESO_COMER')
             AND NEXT_TIPO IN ('SALIDA_COMER', 'SALIDA')
             AND NEXT_FCNR IS NOT NULL
             AND NEXT_FCNR > FCNR
            THEN DATEDIFF(SECOND, FCNR, NEXT_FCNR)
            ELSE 0
          END
        ),
        0
      )
    FROM DayLogs;

    SET @dailyWorkedHours = CONVERT(DECIMAL(10,2), @dailyWorkedSeconds / 3600.0);
    SET @dailyOvertimeHours = CONVERT(
      DECIMAL(10,2),
      CASE
        WHEN @dailyWorkedSeconds > @shiftSeconds
        THEN (@dailyWorkedSeconds - @shiftSeconds) / 3600.0
        ELSE 0
      END
    );

    ;WITH WeekLogs AS (
      SELECT
        CONVERT(DATE, tl.FCNR) AS FECHA,
        tl.TIPO,
        tl.FCNR,
        LEAD(tl.TIPO) OVER (PARTITION BY CONVERT(DATE, tl.FCNR) ORDER BY tl.FCNR) AS NEXT_TIPO,
        LEAD(tl.FCNR) OVER (PARTITION BY CONVERT(DATE, tl.FCNR) ORDER BY tl.FCNR) AS NEXT_FCNR
      FROM dbo.ATT_TIME_LOG tl
      WHERE tl.IDUSUARIO = @IDUSUARIO
        AND tl.SUC = @sucNorm
        AND CONVERT(DATE, tl.FCNR) >= @weekStart
        AND CONVERT(DATE, tl.FCNR) < @weekEnd
    ),
    WorkedByDay AS (
      SELECT
        FECHA,
        SUM(
          CASE
            WHEN TIPO IN ('ENTRADA', 'REGRESO_COMER')
             AND NEXT_TIPO IN ('SALIDA_COMER', 'SALIDA')
             AND NEXT_FCNR IS NOT NULL
             AND NEXT_FCNR > FCNR
            THEN DATEDIFF(SECOND, FCNR, NEXT_FCNR)
            ELSE 0
          END
        ) AS WORKED_SECONDS
      FROM WeekLogs
      GROUP BY FECHA
    )
    SELECT
      @weeklyOvertimeHours = ISNULL(
        SUM(
          CASE
            WHEN WORKED_SECONDS > @shiftSeconds
            THEN CONVERT(DECIMAL(10,4), (WORKED_SECONDS - @shiftSeconds) / 3600.0)
            ELSE 0
          END
        ),
        0
      )
    FROM WorkedByDay;

    SET @weeklyOvertimeHours = CONVERT(DECIMAL(10,2), @weeklyOvertimeHours);

    IF @dailyOvertimeHours > ISNULL(@overtimeDailyLimit, 3.00)
    BEGIN
      SET @dailyAlertMetadata = (
        SELECT
          @today AS [date],
          @dailyWorkedHours AS workedHours,
          CONVERT(DECIMAL(10,2), @shiftSeconds / 3600.0) AS normalHours,
          @dailyOvertimeHours AS overtimeHours,
          @overtimeDailyLimit AS limitHours
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      );

      IF NOT EXISTS (
        SELECT 1
        FROM dbo.ATT_ALERTA a
        WHERE a.IDUSUARIO = @IDUSUARIO
          AND a.SUC = @sucNorm
          AND a.TIPO = 'OVERTIME_DAILY'
          AND CONVERT(DATE, a.FCNR) = @today
      )
      BEGIN
        INSERT INTO dbo.ATT_ALERTA (IDUSUARIO, SUC, TIPO, MESSAGE, METADATA_JSON)
        VALUES (
          @IDUSUARIO,
          @sucNorm,
          'OVERTIME_DAILY',
          CONCAT('Horas extra diarias excedidas: ', @dailyOvertimeHours, 'h (limite ', @overtimeDailyLimit, 'h)'),
          @dailyAlertMetadata
        );
      END;
    END;

    IF @weeklyOvertimeHours > ISNULL(@overtimeWeeklyLimit, 9.00)
    BEGIN
      SET @weeklyAlertMetadata = (
        SELECT
          @weekStart AS weekStart,
          DATEADD(DAY, -1, @weekEnd) AS weekEnd,
          @weeklyOvertimeHours AS overtimeHours,
          @overtimeWeeklyLimit AS limitHours
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      );

      IF NOT EXISTS (
        SELECT 1
        FROM dbo.ATT_ALERTA a
        WHERE a.IDUSUARIO = @IDUSUARIO
          AND a.SUC = @sucNorm
          AND a.TIPO = 'OVERTIME_WEEKLY'
          AND a.FCNR >= CAST(@weekStart AS DATETIME2(0))
          AND a.FCNR < CAST(@weekEnd AS DATETIME2(0))
      )
      BEGIN
        INSERT INTO dbo.ATT_ALERTA (IDUSUARIO, SUC, TIPO, MESSAGE, METADATA_JSON)
        VALUES (
          @IDUSUARIO,
          @sucNorm,
          'OVERTIME_WEEKLY',
          CONCAT('Horas extra semanales excedidas: ', @weeklyOvertimeHours, 'h (limite ', @overtimeWeeklyLimit, 'h)'),
          @weeklyAlertMetadata
        );
      END;
    END;

    COMMIT TRANSACTION;

    SET @OK = 1;
    SET @MESSAGE = 'Marcaje registrado correctamente';

    SELECT
      @OK AS OK,
      @MESSAGE AS MESSAGE,
      @IDTIMELOG AS IDTIMELOG,
      @dailyWorkedHours AS DAILY_WORKED_HOURS,
      @dailyOvertimeHours AS DAILY_OVERTIME_HOURS,
      @weeklyOvertimeHours AS WEEKLY_OVERTIME_HOURS;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    SET @OK = 0;
    SET @MESSAGE = LEFT(ERROR_MESSAGE(), 200);
    SET @IDTIMELOG = NULL;

    THROW;
  END CATCH;
END;
GO


