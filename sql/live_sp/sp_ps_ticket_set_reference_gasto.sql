

CREATE   PROCEDURE dbo.sp_ps_ticket_set_reference_gasto

  @IDFOL_ACTUAL NVARCHAR(255),

  @TICKET_LINE_ID NVARCHAR(255),

  @REFGASTO NVARCHAR(120),

  @USER NVARCHAR(255) = NULL

AS

BEGIN

  SET NOCOUNT ON;

  SET XACT_ABORT ON;



  DECLARE @startedTran BIT = 0;

  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL_ACTUAL, '')));

  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@TICKET_LINE_ID, '')));

  DECLARE @refNorm NVARCHAR(120) = LTRIM(RTRIM(ISNULL(@REFGASTO, '')));

  DECLARE @lineUpc CHAR(2);

  DECLARE @resolvedRef NVARCHAR(120);



  IF @idfolNorm = '' OR @artNorm = '' OR @refNorm = ''

    THROW 57040, 'IDFOL_ACTUAL, TICKET_LINE_ID y REFGASTO son requeridos', 1;



  BEGIN TRY

    IF @@TRANCOUNT = 0

    BEGIN

      SET @startedTran = 1;

      BEGIN TRANSACTION;

    END;



    SELECT TOP 1 @lineUpc = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))

    FROM dbo.PV_TICKET_LOG WITH (UPDLOCK, HOLDLOCK)

    WHERE IDFOL = @idfolNorm

      AND ART = @artNorm;



    IF @lineUpc IS NULL OR @lineUpc = ''

      THROW 57041, 'La linea de ticket seleccionada no existe', 1;



    IF @lineUpc IN ('AP', 'AD', 'CR')

      THROW 57042, 'El tipo de servicio no admite referencia de gasto', 1;



    IF TRY_CONVERT(INT, @refNorm) IS NOT NULL

    BEGIN

      SELECT TOP 1 @resolvedRef = LTRIM(RTRIM(ISNULL(REFGASTO, '')))

      FROM dbo.DAT_REF_GTO

      WHERE IDR = TRY_CONVERT(INT, @refNorm);

    END



    IF @resolvedRef IS NULL OR @resolvedRef = ''

    BEGIN

      SELECT TOP 1 @resolvedRef = LTRIM(RTRIM(ISNULL(REFGASTO, '')))

      FROM dbo.DAT_REF_GTO

      WHERE UPPER(LTRIM(RTRIM(ISNULL(REFGASTO, '')))) = UPPER(@refNorm);

    END



    IF @resolvedRef IS NULL OR @resolvedRef = ''

      THROW 57043, 'La referencia de gasto no existe', 1;



    UPDATE dbo.PV_TICKET_LOG

    SET ORD = @resolvedRef

    WHERE IDFOL = @idfolNorm

      AND ART = @artNorm;



    IF @startedTran = 1 AND @@TRANCOUNT > 0

      COMMIT TRANSACTION;



    SELECT

      @idfolNorm AS IDFOL,

      @artNorm AS ART,

      @lineUpc AS UPC,

      @resolvedRef AS ORD;

  END TRY

  BEGIN CATCH

    IF @startedTran = 1 AND @@TRANCOUNT > 0

      ROLLBACK TRANSACTION;

    THROW;

  END CATCH

END;


