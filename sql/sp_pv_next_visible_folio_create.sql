SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.sp_pv_next_visible_folio
  @SUC NVARCHAR(255),
  @TIPO_FOLIO VARCHAR(2),
  @FECHA DATE = NULL,
  @IDFOL_OUT NVARCHAR(255) OUTPUT,
  @CONSEC_OUT INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm NVARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @tipoNorm VARCHAR(2) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_FOLIO, ''))));
  DECLARE @fechaNorm DATE = ISNULL(@FECHA, CONVERT(DATE, GETDATE()));
  DECLARE @lockResource NVARCHAR(120);
  DECLARE @lockResult INT;

  DECLARE @nextConsec TABLE (
    CONSEC INT NOT NULL
  );

  IF @sucNorm = ''
    THROW 57100, 'SUC es requerido para generar folio visible', 1;

  IF @tipoNorm NOT IN ('CP', 'CA', 'VF')
    THROW 57101, 'TIPO_FOLIO invalido. Valores permitidos: CP, CA, VF', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SET @lockResource =
      CONCAT(
        'PV_VISIBLE_FOLIO_',
        @sucNorm,
        '_',
        CONVERT(CHAR(8), @fechaNorm, 112),
        '_',
        @tipoNorm
      );

    EXEC @lockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 15000;

    IF @lockResult < 0
      THROW 57102, 'No se pudo obtener lock para generar folio visible', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.DAT_FOLIOS_CONSEC WITH (UPDLOCK, HOLDLOCK)
      WHERE SUC = @sucNorm
        AND FECHA = @fechaNorm
        AND TIPO_FOLIO = @tipoNorm
    )
    BEGIN
      UPDATE dbo.DAT_FOLIOS_CONSEC
      SET
        ULTIMO_CONSEC = ULTIMO_CONSEC + 1,
        FCNM = GETDATE()
      OUTPUT inserted.ULTIMO_CONSEC INTO @nextConsec (CONSEC)
      WHERE SUC = @sucNorm
        AND FECHA = @fechaNorm
        AND TIPO_FOLIO = @tipoNorm;
    END
    ELSE
    BEGIN
      INSERT INTO dbo.DAT_FOLIOS_CONSEC (
        SUC,
        FECHA,
        TIPO_FOLIO,
        ULTIMO_CONSEC,
        FCNM
      )
      VALUES (
        @sucNorm,
        @fechaNorm,
        @tipoNorm,
        1,
        GETDATE()
      );

      INSERT INTO @nextConsec (CONSEC)
      VALUES (1);
    END;

    SELECT TOP 1 @CONSEC_OUT = CONSEC
    FROM @nextConsec;

    IF ISNULL(@CONSEC_OUT, 0) <= 0
      THROW 57103, 'No se pudo resolver consecutivo visible', 1;

    SET @IDFOL_OUT =
      CONCAT(
        @sucNorm,
        '-',
        CONVERT(CHAR(8), @fechaNorm, 112),
        '-',
        @tipoNorm,
        '-',
        RIGHT('0000' + CONVERT(VARCHAR(10), @CONSEC_OUT), 4)
      );

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
