IF OBJECT_ID('dbo.sp_pvctrfolasvr_create', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_pvctrfolasvr_create;
GO

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

  DECLARE @sucTrim NVARCHAR(255) = LTRIM(RTRIM(@SUC));
  DECLARE @opvTrim NVARCHAR(255) = LTRIM(RTRIM(@OPV));

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

  DECLARE @today DATE = CONVERT(DATE, GETDATE());
  DECLARE @count INT = 0;

  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  BEGIN TRY
    BEGIN TRAN;

    SELECT @count = COUNT(1)
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
    WHERE SUC = @sucTrim
      AND CONVERT(DATE, FCN) = @today;

    SET @TRA_OUT = ISNULL(@count, 0) + 1;

    DECLARE @seq INT = 1000 + @TRA_OUT;
    SET @IDFOL_OUT = @sucTrim
      + RIGHT('00' + CAST(DAY(@today) AS NVARCHAR(2)), 2)
      + RIGHT('00' + CAST(MONTH(@today) AS NVARCHAR(2)), 2)
      + CAST(YEAR(@today) AS NVARCHAR(4))
      + CAST(@seq AS NVARCHAR(10));

    INSERT INTO dbo.PV_CTR_FOL_ASVR (
      IDFOL,
      CLIEN,
      DOC,
      FCN,
      SUC,
      TER,
      TRA,
      OPV,
      ESTA,
      IMPT,
      FPGO,
      IMPP,
      AUT,
      REQF,
      FCNM,
      OPVM,
      MOD,
      IDFOLORIG
    )
    VALUES (
      @IDFOL_OUT,
      @CLIEN,
      NULL,
      GETDATE(),
      @sucTrim,
      @TER,
      CAST(@TRA_OUT AS NVARCHAR(255)),
      @opvTrim,
      @ESTA,
      NULL,
      NULL,
      NULL,
      @AUT,
      @REQF,
      GETDATE(),
      @opvTrim,
      NULL,
      NULL
    );

    COMMIT;

    SELECT @IDFOL_OUT AS IDFOL, @TRA_OUT AS TRA;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@msg, 16, 1);
  END CATCH
END;
GO
