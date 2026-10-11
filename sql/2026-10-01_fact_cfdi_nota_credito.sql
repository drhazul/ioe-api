/*
  Folios para notas de credito.

  Por que un procedimiento aparte: `sp_fact_cfdi_serie_reserve` numera por
  serie, y la serie es LEFT(RFC,4). Si una nota de credito pasara por ahi
  consumiria un folio de la serie de FACTURAS, y la numeracion de ingresos
  quedaria con huecos. Las notas llevan su propia serie, 'NC' + las dos
  primeras letras del RFC, con su propio consecutivo y su propio candado.

  El renglon se guarda en la misma tabla de control, con IDFOL = <folio>-NC.
  Asi la relacion entre la factura y sus notas queda registrada sin crear
  nada en FAC_SVR_SHAP: una factura puede tener varias notas parciales, y
  cada una es una REEMISION distinta de ese mismo IDFOL.
*/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.sp_fact_cfdi_nc_reserve
  @IDFOL_ORIGEN NVARCHAR(100),
  @RFCEMISOR NVARCHAR(40),
  @FECHA DATE,
  @USUARIO NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @rfcNorm NVARCHAR(40) = UPPER(LTRIM(RTRIM(ISNULL(@RFCEMISOR, ''))));
  DECLARE @idfolOrigen NVARCHAR(100) = LTRIM(RTRIM(ISNULL(@IDFOL_ORIGEN, '')));

  IF LEN(@idfolOrigen) = 0
    THROW 58020, 'IDFOL_ORIGEN es requerido para reservar folio de nota de credito.', 1;
  IF LEN(@rfcNorm) < 4
    THROW 58021, 'RFCEMISOR debe contener al menos 4 caracteres.', 1;

  DECLARE @serie NVARCHAR(4) = CONCAT('NC', LEFT(@rfcNorm, 2));
  DECLARE @idfol NVARCHAR(100) = CONCAT(@idfolOrigen, '-NC');
  DECLARE @lockResource NVARCHAR(255) = CONCAT('FACT_CFDI_SERIE_', @serie);
  DECLARE @lock INT;

  BEGIN TRAN;

  -- Mismo candado por serie que usa el procedimiento de facturas: dos notas
  -- simultaneas no pueden quedarse con el mismo folio.
  EXEC @lock = sp_getapplock
    @Resource = @lockResource,
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 15000;

  IF @lock < 0
  BEGIN
    ROLLBACK TRAN;
    THROW 58022, 'No se pudo obtener lock para reservar folio de nota de credito.', 1;
  END;

  DECLARE @reemision INT;
  SELECT @reemision = ISNULL(MAX(REEMISION), 0) + 1
  FROM dbo.FACT_CFDI_FOLIOS_DIARIOS WITH (UPDLOCK, HOLDLOCK)
  WHERE IDFOL = @idfol;

  DECLARE @consecutivo INT;
  SELECT @consecutivo = ISNULL(MAX(CONSECUTIVO_GLOBAL), 0) + 1
  FROM dbo.FACT_CFDI_FOLIOS_DIARIOS WITH (UPDLOCK, HOLDLOCK)
  WHERE SERIE = @serie;

  IF ISNULL(@consecutivo, 0) <= 0 SET @consecutivo = 1;

  DECLARE @folio NVARCHAR(20) = CASE
    WHEN LEN(CONVERT(VARCHAR(20), @consecutivo)) >= 5
      THEN CONVERT(VARCHAR(20), @consecutivo)
    ELSE RIGHT('00000' + CONVERT(VARCHAR(20), @consecutivo), 5)
  END;

  INSERT INTO dbo.FACT_CFDI_FOLIOS_DIARIOS (
    IDFOL, REEMISION, RFCEMISOR, SERIE, FOLIO, NOMENCLATURA,
    FECHA, CONSECUTIVO, CONSECUTIVO_GLOBAL, ESTADO,
    USUARIO_CREACION, USUARIO_ULT_MOD, FCNC, FCNM
  )
  VALUES (
    @idfol, @reemision, @rfcNorm, @serie, @folio,
    CONCAT(@serie, '-', @folio),
    @FECHA, @consecutivo, @consecutivo, 'RESERVADO',
    @USUARIO, @USUARIO, GETDATE(), GETDATE()
  );

  COMMIT TRAN;

  SELECT
    @idfol AS IDFOL,
    @serie AS SERIE,
    @folio AS FOLIO,
    CONCAT(@serie, '-', @folio) AS NOMENCLATURA,
    @reemision AS REEMISION,
    @consecutivo AS CONSECUTIVO;
END;
GO
