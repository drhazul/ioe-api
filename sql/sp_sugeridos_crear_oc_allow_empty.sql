ALTER PROCEDURE dbo.sp_sugeridos_crear_oc
  @SUC NVARCHAR(20),
  @NPROV INT,
  @USR NVARCHAR(100),
  @TIPO NVARCHAR(80) = N'NORMAL',
  @SUG BIT = 1,
  @ITEMS_JSON NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm NVARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, N''))));
  DECLARE @usrNorm NVARCHAR(100) = LTRIM(RTRIM(ISNULL(@USR, N'')));
  IF @sucNorm = N'' THROW 51001, 'La sucursal es requerida para crear la orden.', 1;
  IF @NPROV IS NULL THROW 51002, 'El proveedor es requerido para crear la orden.', 1;
  IF @usrNorm = N'' THROW 51003, 'El usuario es requerido para crear la orden.', 1;
  IF ISJSON(@ITEMS_JSON) <> 1 THROW 51004, 'El detalle de articulos no es JSON valido.', 1;

  DECLARE @items TABLE (
    POS INT IDENTITY(1,1) NOT NULL,
    ART NVARCHAR(50) NOT NULL,
    CTO MONEY NOT NULL,
    CTDPED FLOAT NOT NULL,
    UNCOM NVARCHAR(80) NULL
  );

  INSERT INTO @items (ART, CTO, CTDPED, UNCOM)
  SELECT
    LTRIM(RTRIM(JSON_VALUE(value, '$.art'))),
    TRY_CONVERT(MONEY, JSON_VALUE(value, '$.cto')),
    TRY_CONVERT(FLOAT, JSON_VALUE(value, '$.ctdped')),
    NULLIF(LTRIM(RTRIM(JSON_VALUE(value, '$.uncom'))), N'')
  FROM OPENJSON(@ITEMS_JSON)
  WHERE LTRIM(RTRIM(ISNULL(JSON_VALUE(value, '$.art'), N''))) <> N''
    AND TRY_CONVERT(FLOAT, JSON_VALUE(value, '$.ctdped')) > 0
    AND TRY_CONVERT(MONEY, JSON_VALUE(value, '$.cto')) IS NOT NULL;

  DECLARE @NPED NVARCHAR(50);

  BEGIN TRANSACTION;

  EXEC sys.sp_getapplock
    @Resource = 'REC_CAB_PED_NPED',
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 15000;

  SELECT @NPED = CONVERT(NVARCHAR(50), ISNULL(MAX(TRY_CONVERT(BIGINT, NPED)), 450000000) + 1)
  FROM dbo.REC_CAB_PED WITH (UPDLOCK, HOLDLOCK)
  WHERE TRY_CONVERT(BIGINT, NPED) IS NOT NULL;

  INSERT INTO dbo.REC_CAB_PED (NPED, SUC, TIPO, NPROV, USR, FCNP, FCNC, IMPP, NART, FCNR, ESTATUS, SUG)
  SELECT
    @NPED,
    @sucNorm,
    NULLIF(LTRIM(RTRIM(@TIPO)), N''),
    @NPROV,
    @usrNorm,
    GETDATE(),
    NULL,
    ISNULL(SUM(CTO * CTDPED), 0),
    COUNT(1),
    NULL,
    N'ABIERTO',
    CASE WHEN @SUG = 1 THEN -1 ELSE 0 END
  FROM @items;

  INSERT INTO dbo.REC_DET_PED (BLOQ, RECI, POS, DREC, IDPED, NPED, ART, CTO, CTDPED, UNCOM, CTDREC)
  SELECT
    0,
    0,
    POS,
    NULL,
    CONCAT(POS, N'-', @NPED),
    @NPED,
    ART,
    CTO,
    CTDPED,
    UNCOM,
    NULL
  FROM @items
  ORDER BY POS;

  COMMIT TRANSACTION;

  SELECT @NPED AS NPED;
END;
