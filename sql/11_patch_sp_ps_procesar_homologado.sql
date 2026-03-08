SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE dbo.sp_ps_procesar
  @IDFOL NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @serviceType CHAR(2);
  DECLARE @total DECIMAL(18, 4);
  DECLARE @isCashOut BIT = 0;
  DECLARE @origenActual VARCHAR(2);
  DECLARE @origenFinal VARCHAR(2);

  IF @idfolNorm = '' THROW 57070, 'IDFOL es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL = @idfolNorm)
      THROW 57071, 'El ticket no contiene renglones', 1;

    IF EXISTS (
      SELECT 1 FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm AND LTRIM(RTRIM(ISNULL(ORD, ''))) = ''
    ) THROW 57072, 'Todas las lineas deben tener referencia asignada (ORD)', 1;

    IF EXISTS (
      SELECT 1 FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm AND TRY_CONVERT(DECIMAL(18,4), PVTA) IS NULL
    ) THROW 57073, 'Todas las lineas deben tener PVTA capturado', 1;

    SELECT TOP 1 @serviceType = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    IF @serviceType NOT IN ('AD','AP','CR','DC','DG')
      THROW 57075, 'Tipo de servicio invalido para procesar', 1;

    SELECT @total = ROUND(SUM(
      ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0) * ISNULL(TRY_CONVERT(DECIMAL(18,4), CTD), 0)
    ), 4)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    IF @total IS NULL OR @total <= 0
      THROW 57074, 'El total del ticket no es valido para procesar', 1;

    IF @serviceType IN ('DG', 'DC') SET @isCashOut = 1;

    SELECT TOP 1
      @origenActual = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT,'')))) IN ('CA','VF') THEN UPPER(LTRIM(RTRIM(ORIGEN_AUT)))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(AUT,'')))) IN ('DVF','VF') THEN 'VF'
        ELSE 'CA'
      END
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE IDFOL = @idfolNorm;

    SET @origenFinal = CASE
      WHEN @serviceType IN ('DC','DG') THEN 'CA'
      WHEN @origenActual IN ('CA','VF') THEN @origenActual
      ELSE 'CA'
    END;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET
      AUT = @serviceType,
      ESTA = 'PENDIENTE',
      IMPT = CASE WHEN @isCashOut = 1 THEN (@total * -1) ELSE @total END,
      ORIGEN_AUT = @origenFinal,
      IDFOLINICIAL = ISNULL(NULLIF(LTRIM(RTRIM(IDFOLINICIAL)), ''), IDFOL),
      FCNM = GETDATE()
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0 COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS IDFOL,
      @serviceType AS SERVICE_TYPE,
      @total AS TOTAL,
      CASE WHEN @isCashOut = 1 THEN (@total * -1) ELSE @total END AS IMPT,
      @origenFinal AS ORIGEN_AUT,
      CAST(1 AS BIT) AS GO_TO_PAGO;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
