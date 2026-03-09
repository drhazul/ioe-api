SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE dbo.sp_pvctrfolasvr_create
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
GO

ALTER PROCEDURE dbo.sp_ps_folio_create
  @SUC VARCHAR(4),
  @TER NVARCHAR(50) = NULL,
  @OPV NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm VARCHAR(4) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @terNorm NVARCHAR(50) = NULLIF(LTRIM(RTRIM(ISNULL(@TER, ''))), '');
  DECLARE @opvNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@OPV, '')));
  DECLARE @idfol NVARCHAR(255);
  DECLARE @nextTra INT;
  DECLARE @lockResult INT;
  DECLARE @lockResource NVARCHAR(100);

  IF @sucNorm = '' THROW 57001, 'SUC es requerido', 1;
  IF @opvNorm = '' THROW 57002, 'OPV es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SET @lockResource = 'PS_FOLIO_CREATE_' + @sucNorm;

    EXEC @lockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 15000;

    IF @lockResult < 0 THROW 57003, 'No se pudo obtener lock para crear folio PS', 1;

    SELECT @nextTra = ISNULL(MAX(TRY_CONVERT(INT, TRA)), 0) + 1
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
    WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm;

    IF @nextTra IS NULL OR @nextTra < 1 SET @nextTra = 1;

    SET @idfol = CONCAT('PS',@sucNorm,'-',CONVERT(VARCHAR(8), GETDATE(), 112),'-',RIGHT('000000' + CAST(@nextTra AS VARCHAR(10)), 6));

    WHILE EXISTS (SELECT 1 FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL = @idfol)
    BEGIN
      SET @nextTra = @nextTra + 1;
      SET @idfol = CONCAT('PS',@sucNorm,'-',CONVERT(VARCHAR(8), GETDATE(), 112),'-',RIGHT('000000' + CAST(@nextTra AS VARCHAR(10)), 6));
    END;

    INSERT INTO dbo.PV_CTR_FOL_ASVR (
      IDFOL, CLIEN, FCN, SUC, TER, TRA, OPV, ESTA, IMPT, FPGO, IMPP, AUT, REQF, FCNM, OPVM,
      IDFOLINICIAL, ORIGEN_AUT
    )
    VALUES (
      @idfol, 1, GETDATE(), @sucNorm, @terNorm, CAST(@nextTra AS NVARCHAR(20)), @opvNorm,
      'PENDIENTE', 0, NULL, 0, 'PS', 0, GETDATE(), @opvNorm,
      @idfol, 'CA'
    );

    IF @startedTran = 1 AND @@TRANCOUNT > 0 COMMIT TRANSACTION;

    SELECT @idfol AS IDFOL, @sucNorm AS SUC, CAST(@nextTra AS NVARCHAR(20)) AS TRA, @opvNorm AS OPV, 'PENDIENTE' AS ESTA, 'CA' AS ORIGEN_AUT;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
