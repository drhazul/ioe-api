

CREATE   PROCEDURE dbo.sp_ps_terminar

  @IDFOL NVARCHAR(255),

  @USER NVARCHAR(255) = NULL

AS

BEGIN

  SET NOCOUNT ON;

  SET XACT_ABORT ON;



  DECLARE @startedTran BIT = 0;

  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));



  IF @idfolNorm = ''

    THROW 57110, 'IDFOL es requerido', 1;



  BEGIN TRY

    IF @@TRANCOUNT = 0

    BEGIN

      SET @startedTran = 1;

      BEGIN TRANSACTION;

    END;



    UPDATE dbo.PV_CTR_FOL_ASVR

    SET ESTA = 'TRANSMITIR',

        FCNM = GETDATE()

    WHERE IDFOL = @idfolNorm;



    IF @@ROWCOUNT = 0

      THROW 57111, 'El folio no existe', 1;



    IF OBJECT_ID('dbo.PV_CTR_FOL_FORMTMP', 'U') IS NOT NULL

    BEGIN

      DELETE FROM dbo.PV_CTR_FOL_FORMTMP

      WHERE IDFOL = @idfolNorm;

    END



    IF @startedTran = 1 AND @@TRANCOUNT > 0

      COMMIT TRANSACTION;



    SELECT

      @idfolNorm AS IDFOL,

      'TRANSMITIR' AS ESTA,

      CAST(1 AS BIT) AS OK;

  END TRY

  BEGIN CATCH

    IF @startedTran = 1 AND @@TRANCOUNT > 0

      ROLLBACK TRANSACTION;

    THROW;

  END CATCH

END;


