
CREATE PROCEDURE dbo.sp_ps_folio_create
  @SUC VARCHAR(4),
  @TER NVARCHAR(50) = NULL,
  @OPV NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm VARCHAR(4) = UPP
ER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @terNorm NVARCHAR(50) = NULLIF(LTRIM(RTRIM(ISNULL(@TER, ''))), '');
  DECLARE @opvNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@OPV, '')));
  DECLARE @idfol NVARCHAR(255);
  DECLARE @nextTra INT;
  DECLARE @lockRes
ult INT;
  DECLARE @lockResource NVARCHAR(100);

  IF @sucNorm = '' THROW 57001, 'SUC es requerido', 1;
  IF @opvNorm = '' THROW 57002, 'OPV es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTIO
N;
    END;

    SET @lockResource = 'PS_FOLIO_CREATE_' + @sucNorm;

    EXEC @lockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 15000;

    IF @lockResult < 0
 THROW 57003, 'No se pudo obtener lock para crear folio PS', 1;

    SELECT @nextTra = ISNULL(MAX(TRY_CONVERT(INT, TRA)), 0) + 1
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
    WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm;

    IF @next
Tra IS NULL OR @nextTra < 1 SET @nextTra = 1;

    SET @idfol = CONCAT('PS',@sucNorm,'-',CONVERT(VARCHAR(8), GETDATE(), 112),'-',RIGHT('000000' + CAST(@nextTra AS VARCHAR(10)), 6));

    WHILE EXISTS (SELECT 1 FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL = @idfol
)
    BEGIN
      SET @nextTra = @nextTra + 1;
      SET @idfol = CONCAT('PS',@sucNorm,'-',CONVERT(VARCHAR(8), GETDATE(), 112),'-',RIGHT('000000' + CAST(@nextTra AS VARCHAR(10)), 6));
    END;

    INSERT INTO dbo.PV_CTR_FOL_ASVR (
      IDFOL, CLIEN, FCN
, SUC, TER, TRA, OPV, ESTA, IMPT, FPGO, IMPP, AUT, REQF, FCNM, OPVM,
      IDFOLINICIAL, ORIGEN_AUT
    )
    VALUES (
      @idfol, 1, GETDATE(), @sucNorm, @terNorm, CAST(@nextTra AS NVARCHAR(20)), @opvNorm,
      'PENDIENTE', 0, NULL, 0, 'PS', 0, GETDAT
E(), @opvNorm,
      @idfol, 'CA'
    );

    IF @startedTran = 1 AND @@TRANCOUNT > 0 COMMIT TRANSACTION;

    SELECT @idfol AS IDFOL, @sucNorm AS SUC, CAST(@nextTra AS NVARCHAR(20)) AS TRA, @opvNorm AS OPV, 'PENDIENTE' AS ESTA, 'CA' AS ORIGEN_AUT;
  END 
TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;                                                                                                                                                
