CREATE OR ALTER PROCEDURE dbo.sp_pv_ctr_ords_generate_iord
  @SUC NVARCHAR(10),
  @FCN DATETIME = NULL,
  @IORD_OUT NVARCHAR(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm NVARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @fcnNorm DATETIME = ISNULL(@FCN, GETDATE());
  DECLARE @fcnDate DATE = CAST(@fcnNorm AS DATE);
  DECLARE @serie INT;
  DECLARE @serieTxt NVARCHAR(10);
  DECLARE @prefix NVARCHAR(30);
  DECLARE @next INT;
  DECLARE @lockResult INT;
  DECLARE @lockResource NVARCHAR(200);

  IF @sucNorm = ''
    THROW 50064, 'SUC es requerida.', 1;

  /*
    SERIE_FECHA (logica "serie 1990"):
    dias transcurridos desde 1990-01-01, con padding a 5 digitos.
    Ejemplo: 2026-02-13 -> 13193 -> "13193"
  */
  SET @serie = DATEDIFF(DAY, CONVERT(DATE, '19900101'), @fcnDate);
  IF @serie < 0
    THROW 50065, 'La fecha de serie no es valida para generar IORD.', 1;

  SET @serieTxt = RIGHT(REPLICATE('0', 5) + CAST(@serie AS NVARCHAR(10)), 5);
  SET @prefix = @sucNorm + @serieTxt;
  SET @lockResource = CONCAT('PV_CTR_ORDS_IORD_', @sucNorm, '_', CONVERT(VARCHAR(8), @fcnDate, 112));

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    EXEC @lockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 15000;

    IF @lockResult < 0
      THROW 50066, 'No se pudo adquirir bloqueo para generar IORD.', 1;

    SELECT
      @next = ISNULL(MAX(TRY_CONVERT(INT, RIGHT(LTRIM(RTRIM(IORD)), 4))), 0) + 1
    FROM dbo.PV_CTR_ORDS WITH (UPDLOCK, HOLDLOCK)
    WHERE LEFT(LTRIM(RTRIM(IORD)), LEN(@prefix)) = @prefix
      AND LEN(LTRIM(RTRIM(IORD))) = LEN(@prefix) + 4
      AND TRY_CONVERT(INT, RIGHT(LTRIM(RTRIM(IORD)), 4)) IS NOT NULL;

    IF @next > 9999
      THROW 50067, 'Se alcanzo el maximo consecutivo diario para IORD.', 1;

    SET @IORD_OUT = @prefix + RIGHT(REPLICATE('0', 4) + CAST(@next AS NVARCHAR(10)), 4);

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END
GO
