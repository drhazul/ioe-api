/*
  Folios de los CFDI que cuelgan de una factura: notas de credito (NC) y
  complementos de pago (PG).

  Generaliza `sp_fact_cfdi_nc_reserve`. El tipo decide la serie y el sufijo
  del IDFOL, y como el consecutivo se lleva POR SERIE, cada familia numera
  aparte sin tocar la de facturas:

    NC -> serie 'NC' + 2 letras del RFC, IDFOL <folio>-NC
    PG -> serie 'PG' + 2 letras del RFC, IDFOL <folio>-PG

  Las notas ya emitidas con el procedimiento anterior siguen contando bien:
  la serie es la misma, y el consecutivo sale del maximo de esa serie.
*/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.sp_fact_cfdi_rel_reserve
  @IDFOL_ORIGEN NVARCHAR(100),
  @RFCEMISOR NVARCHAR(40),
  @FECHA DATE,
  @USUARIO NVARCHAR(100) = NULL,
  @TIPO NVARCHAR(2) = 'NC'
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @rfcNorm NVARCHAR(40) = UPPER(LTRIM(RTRIM(ISNULL(@RFCEMISOR, ''))));
  DECLARE @idfolOrigen NVARCHAR(100) = LTRIM(RTRIM(ISNULL(@IDFOL_ORIGEN, '')));
  DECLARE @tipoNorm NVARCHAR(2) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO, 'NC'))));

  IF LEN(@idfolOrigen) = 0
    THROW 58020, 'IDFOL_ORIGEN es requerido.', 1;
  IF LEN(@rfcNorm) < 4
    THROW 58021, 'RFCEMISOR debe contener al menos 4 caracteres.', 1;
  IF @tipoNorm NOT IN ('NC', 'PG')
    THROW 58023, 'TIPO debe ser NC (nota de credito) o PG (complemento de pago).', 1;

  DECLARE @serie NVARCHAR(4) = CONCAT(@tipoNorm, LEFT(@rfcNorm, 2));
  DECLARE @idfol NVARCHAR(100) = CONCAT(@idfolOrigen, '-', @tipoNorm);
  DECLARE @lockResource NVARCHAR(255) = CONCAT('FACT_CFDI_SERIE_', @serie);
  DECLARE @lock INT;

  BEGIN TRAN;

  EXEC @lock = sp_getapplock
    @Resource = @lockResource,
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 15000;

  IF @lock < 0
  BEGIN
    ROLLBACK TRAN;
    THROW 58022, 'No se pudo obtener lock para reservar folio.', 1;
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
