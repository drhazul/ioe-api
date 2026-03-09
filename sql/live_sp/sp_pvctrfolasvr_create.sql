
CREATE PROCEDURE dbo.sp_pvctrfolasvr_create
  @SUC NVARCHAR(255),
  @OPV NVARCHAR(255),
  @TER NVARCHAR(255) = NULL,
  @CLIEN INT = 1,
  @ESTA NVARCHAR(255) = N'PENDIENTE',
  @AUT NVARCHAR(255) = N'CP',
  @REQF INT = 0,
  @IDFOL_OUT NVARCHAR(255) OUTPUT,
  @TRA_OUT INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @sucTrim NVARCHAR(255) = LTRIM(RTRIM(@SUC));
  DECLARE @opvTrim NVARCHAR(255) = LTRIM(RTRIM(@OPV));
  DECLARE @autNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@AUT, 'CP'))));
  DECLARE @estaNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@ESTA, 'PENDIENTE'))));
  DECLARE @origenAut VARCHAR(2);
  DECLARE @folioTipo VARCHAR(2);
  DECLARE @folioVisible NVARCHAR(255);
  DECLARE @folioConsec INT;
  DECLARE @today DATE = CONVERT(DATE, GETDATE());

  IF (@sucTrim IS NULL OR @sucTrim = N'')
  BEGIN
    RAISERROR('SUC requerida', 16, 1);
    RETURN;
  END

  IF (@opvTrim IS NULL OR @opvTrim = N'')
  BEGIN
    RAISERROR('OPV requerida', 16, 1);
    RETURN;
  END

  IF @estaNorm IN ('EDITANDO','DEV PEND','PAGADO2','') SET @estaNorm = 'PENDIENTE';
  IF @estaNorm LIKE 'PAGADO%' SET @estaNorm = 'PAGADO';
  IF @estaNorm LIKE 'TRANSMIT%' SET @estaNorm = 'TRANSMITIR';
  IF @estaNorm NOT IN ('PENDIENTE','PAGADO','TRANSMITIR') SET @estaNorm = 'PENDIENTE';

  SET @folioTipo = CASE
    WHEN @autNorm IN ('CP', 'CA', 'VF') THEN @autNorm
    ELSE 'CP'
  END;

  SET @origenAut = CASE
    WHEN @autNorm IN ('DCA','CA','DC','DG') THEN 'CA'
    WHEN @autNorm IN ('DVF','VF') THEN 'VF'
    WHEN @autNorm = 'CP' THEN 'CA'
    ELSE 'CA'
  END;

  BEGIN TRY
    BEGIN TRAN;

    EXEC dbo.sp_pv_next_visible_folio
      @SUC = @sucTrim,
      @TIPO_FOLIO = @folioTipo,
      @FECHA = @today,
      @IDFOL_OUT = @folioVisible OUTPUT,
      @CONSEC_OUT = @folioConsec OUTPUT;

    IF ISNULL(LTRIM(RTRIM(@folioVisible)), '') = ''
      THROW 57110, 'No se pudo generar folio visible para PV_CTR_FOL_ASVR', 1;

    SET @IDFOL_OUT = @folioVisible;
    SET @TRA_OUT = ISNULL(@folioConsec, 0);

    INSERT INTO dbo.PV_CTR_FOL_ASVR (
      IDFOL, CLIEN, DOC, FCN, SUC, TER, TRA, OPV, ESTA,
      IMPT, FPGO, IMPP, AUT, REQF, FCNM, OPVM, MOD, IDFOLORIG,
      IDFOLINICIAL, ORIGEN_AUT
    )
    VALUES (
      @IDFOL_OUT, @CLIEN, NULL, GETDATE(), @sucTrim, @TER,
      CAST(@TRA_OUT AS NVARCHAR(255)), @opvTrim, @estaNorm,
      NULL, NULL, NULL, @autNorm, @REQF, GETDATE(), @opvTrim,
      NULL, NULL, @IDFOL_OUT, @origenAut
    );

    COMMIT;

    SELECT @IDFOL_OUT AS IDFOL, @TRA_OUT AS TRA, @origenAut AS ORIGEN_AUT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@msg, 16, 1);
  END CATCH
END;

