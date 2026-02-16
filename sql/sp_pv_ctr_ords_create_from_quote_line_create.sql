CREATE OR ALTER PROCEDURE dbo.sp_pv_ctr_ords_create_from_quote_line
  @IDFOL NVARCHAR(255),
  @ART NVARCHAR(255),
  @DESCART NVARCHAR(255) = NULL,
  @CTD FLOAT,
  @CLIEN INT,
  @ESTADO NVARCHAR(50),
  @TIPO NVARCHAR(255),
  @FCNM DATETIME = NULL,
  @COMAD NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10),
  @OPV NVARCHAR(255),
  @IORD_OUT NVARCHAR(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@ART, '')));
  DECLARE @descArtNorm NVARCHAR(255) = LEFT(LTRIM(RTRIM(ISNULL(@DESCART, ''))), 255);
  DECLARE @ctdNorm FLOAT = @CTD;
  DECLARE @clienNorm INT = @CLIEN;
  DECLARE @estadoNorm NVARCHAR(50) = UPPER(LTRIM(RTRIM(ISNULL(@ESTADO, ''))));
  DECLARE @tipoNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@TIPO, '')));
  DECLARE @fcnmNorm DATETIME = @FCNM;
  DECLARE @comadNorm NVARCHAR(MAX) = NULLIF(LTRIM(RTRIM(ISNULL(@COMAD, ''))), '');
  DECLARE @sucNorm NVARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@OPV, '')));
  DECLARE @qtyEpsilon FLOAT = 0.0001;

  DECLARE @now DATETIME = GETDATE();
  DECLARE @iord NVARCHAR(255);
  DECLARE @clsArt FLOAT = NULL;
  DECLARE @valOrd FLOAT = NULL;
  DECLARE @ctord FLOAT = 100;
  DECLARE @ncliente NVARCHAR(255) = '';
  DECLARE @datArtObject NVARCHAR(517) = NULL;
  DECLARE @conTpoOrdObject NVARCHAR(517) = NULL;
  DECLARE @lookupSql NVARCHAR(MAX) = N'';

  SET @IORD_OUT = NULL;

  IF @idfolNorm = '' OR @artNorm = '' OR @tipoNorm = '' OR @sucNorm = '' OR @opvNorm = ''
    THROW 50063, 'Datos obligatorios incompletos para crear ORD.', 1;

  IF @fcnmNorm IS NULL
    THROW 50070, 'La fecha de entrega es obligatoria.', 1;

  IF @comadNorm IS NULL
    THROW 50071, 'El campo COMAD es obligatorio.', 1;

  IF @clienNorm IS NULL OR @clienNorm = 1
    THROW 50060, 'No se permite crear ORD para el cliente seleccionado.', 1;

  IF @estadoNorm <> 'EDITANDO'
    THROW 50061, 'El documento no esta en estado EDITANDO.', 1;

  IF @ctdNorm IS NULL
    THROW 50062, 'La cantidad registrada para el articulo no permite crear ORD.', 1;

  IF ABS(@ctdNorm - 1.0) > @qtyEpsilon AND ABS(@ctdNorm - 0.5) > @qtyEpsilon
    THROW 50062, 'La cantidad registrada para el articulo no permite crear ORD.', 1;

  SELECT TOP 1
    @datArtObject = QUOTENAME(s.name) + N'.' + QUOTENAME(o.name)
  FROM sys.objects o
  INNER JOIN sys.schemas s
    ON s.schema_id = o.schema_id
  WHERE o.name = N'DAT_ART'
    AND o.type IN (N'U', N'V')
  ORDER BY
    CASE WHEN s.name = N'dbo' THEN 0 ELSE 1 END,
    s.name ASC;

  IF @datArtObject IS NOT NULL
  BEGIN
    SET @lookupSql = N'
      SELECT TOP 1
        @clsArtOut = TRY_CONVERT(FLOAT, SCLA2)
      FROM ' + @datArtObject + N'
      WHERE ART = @artIn
      ORDER BY SUC ASC;';

    EXEC sys.sp_executesql
      @lookupSql,
      N'@artIn NVARCHAR(255), @clsArtOut FLOAT OUTPUT',
      @artIn = @artNorm,
      @clsArtOut = @clsArt OUTPUT;
  END;

  SELECT TOP 1
    @conTpoOrdObject = QUOTENAME(s.name) + N'.' + QUOTENAME(o.name)
  FROM sys.objects o
  INNER JOIN sys.schemas s
    ON s.schema_id = o.schema_id
  WHERE o.name = N'CON_TPO_ORD'
    AND o.type IN (N'U', N'V')
  ORDER BY
    CASE WHEN s.name = N'dbo' THEN 0 ELSE 1 END,
    s.name ASC;

  IF @conTpoOrdObject IS NOT NULL AND @clsArt IS NOT NULL
  BEGIN
    SET @lookupSql = N'
      SELECT TOP 1
        @valOrdOut = TRY_CONVERT(FLOAT, SCLA2)
      FROM ' + @conTpoOrdObject + N'
      WHERE TRY_CONVERT(FLOAT, SCLA2) = @clsArtIn;';

    EXEC sys.sp_executesql
      @lookupSql,
      N'@clsArtIn FLOAT, @valOrdOut FLOAT OUTPUT',
      @clsArtIn = @clsArt,
      @valOrdOut = @valOrd OUTPUT;
  END;

  IF @valOrd IS NOT NULL
    SET @ctord = 120;

  SELECT TOP 1
    @ncliente = LEFT(LTRIM(RTRIM(ISNULL(RazonSocialReceptor, ''))), 255)
  FROM dbo.FACT_CLIENT_SHP
  WHERE IDC = @clienNorm;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    EXEC dbo.sp_pv_ctr_ords_generate_iord
      @SUC = @sucNorm,
      @FCN = @now,
      @IORD_OUT = @iord OUTPUT;

    IF @iord IS NULL OR LTRIM(RTRIM(@iord)) = ''
      THROW 50068, 'No se pudo generar IORD para la orden.', 1;

    INSERT INTO dbo.PV_CTR_ORDS
    (
      IORD,
      IDFOL,
      TIPO,
      OPV,
      FCNS,
      FCNM,
      CLIEN,
      CTD,
      ART,
      COMAD,
      ESTATUS,
      SUC,
      NCLIENTE,
      DESCART,
      CTORD
    )
    VALUES
    (
      @iord,
      @idfolNorm,
      @tipoNorm,
      @opvNorm,
      @now,
      @fcnmNorm,
      @clienNorm,
      @ctdNorm,
      @artNorm,
      @comadNorm,
      1,
      @sucNorm,
      NULLIF(@ncliente, ''),
      NULLIF(@descArtNorm, ''),
      @ctord
    );

    INSERT INTO dbo.PV_CTR_ORDS_DET (IORDP, IORD, ART, JOB)
    VALUES
      (CONCAT('1', @iord), @iord, @artNorm, 'OD'),
      (CONCAT('2', @iord), @iord, @artNorm, 'OI'),
      (CONCAT('3', @iord), @iord, @artNorm, 'ADD');

    SET @IORD_OUT = @iord;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END
GO
