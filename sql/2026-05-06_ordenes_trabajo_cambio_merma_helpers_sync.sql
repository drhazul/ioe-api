/* Sync helpers MB51/CTRL_CTAS para flujo cambio-merma */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_mb51
  @SUC NVARCHAR(10),
  @ART NVARCHAR(255),
  @CTDA FLOAT,
  @TXT NVARCHAR(255),
  @DOCP NVARCHAR(255),
  @USR NVARCHAR(255) = NULL,
  @CLSM NVARCHAR(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID('dbo.DAT_MB51', 'U') IS NULL
    RETURN;

  DECLARE @ctop FLOAT = 0;
  IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
  BEGIN
    SELECT TOP 1
      @ctop = ISNULL(TRY_CONVERT(FLOAT, a.CTOP), 0)
    FROM dbo.DAT_ART a
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))))
      AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART, ''))))
    ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC;
  END;

  DECLARE @cols NVARCHAR(MAX);
  DECLARE @vals NVARCHAR(MAX);
  DECLARE @sql NVARCHAR(MAX);

  ;WITH cols AS (
    SELECT
      c.name,
      c.column_id,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsIdentity')) AS is_identity,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsComputed')) AS is_computed
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.DAT_MB51')
  )
  SELECT
    @cols = STRING_AGG(QUOTENAME(name), ','),
    @vals = STRING_AGG(
      CASE
        WHEN name = 'IDPD' THEN 'CONVERT(NVARCHAR(36), NEWID())'
        WHEN name = 'ART' THEN '@P_ART'
        WHEN name = 'CTDA' THEN '@P_CTDA'
        WHEN name = 'CTOT' THEN 'ROUND(ISNULL(@P_CTDA, 0) * ISNULL(@P_CTOP, 0), 2)'
        WHEN name = 'TXT' THEN 'LEFT(ISNULL(@P_TXT, ''''), 255)'
        WHEN name = 'SUC' THEN '@P_SUC'
        WHEN name = 'DOCP' THEN 'LEFT(ISNULL(@P_DOCP, ''''), 255)'
        WHEN name = 'USER' THEN 'LEFT(ISNULL(@P_USR, SYSTEM_USER), 255)'
        WHEN name = 'CLSM' THEN 'TRY_CONVERT(FLOAT, @P_CLSM)'
        WHEN name = 'FCND' THEN 'CONVERT(date, GETDATE())'
        WHEN name = 'FCNC' THEN 'GETDATE()'
        WHEN name = 'ALMACEN' THEN '''001'''
        ELSE 'NULL'
      END,
      ','
    )
  FROM cols
  WHERE ISNULL(is_identity, 0) = 0
    AND ISNULL(is_computed, 0) = 0;

  IF ISNULL(@cols, '') = '' OR ISNULL(@vals, '') = ''
    RETURN;

  SET @sql = N'INSERT INTO dbo.DAT_MB51 (' + @cols + N') VALUES (' + @vals + N');';

  EXEC sp_executesql
    @sql,
    N'@P_SUC NVARCHAR(10), @P_ART NVARCHAR(255), @P_CTDA FLOAT, @P_CTOP FLOAT, @P_TXT NVARCHAR(255), @P_DOCP NVARCHAR(255), @P_USR NVARCHAR(255), @P_CLSM NVARCHAR(50)',
    @P_SUC = @SUC,
    @P_ART = @ART,
    @P_CTDA = @CTDA,
    @P_CTOP = @ctop,
    @P_TXT = @TXT,
    @P_DOCP = @DOCP,
    @P_USR = @USR,
    @P_CLSM = @CLSM;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff
  @SUC NVARCHAR(10),
  @CLIENT FLOAT,
  @IDFOL NVARCHAR(255),
  @DIFF FLOAT,
  @DOCDIF NVARCHAR(255),
  @DESC_MOV NVARCHAR(255),
  @USR NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    RETURN;

  IF ABS(ISNULL(@DIFF, 0)) < 0.0001
    RETURN;

  DECLARE @mov INT = CASE WHEN @DIFF > 0 THEN 802 ELSE 801 END;
  DECLARE @impt FLOAT = CASE WHEN @DIFF > 0 THEN -ABS(@DIFF) ELSE ABS(@DIFF) END;
  DECLARE @cta NVARCHAR(20) = NULL;
  DECLARE @docSeed BIGINT = 80000000;
  DECLARE @docWidth INT = 8;
  DECLARE @maxCtrl BIGINT = 0;
  DECLARE @maxDoc BIGINT = 0;
  DECLARE @nextDoc BIGINT = 0;
  DECLARE @ndoc NVARCHAR(255) = NULL;
  DECLARE @lockResult INT;
  DECLARE @classCol NVARCHAR(10) = NULL;
  DECLARE @sucNorm NVARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @lockResource NVARCHAR(255) = CONCAT('OT_CYM_CTRLCTA_', @mov);
  DECLARE @sql NVARCHAR(MAX);

  IF OBJECT_ID('dbo.DAT_CAT_CTAS', 'U') IS NOT NULL
  BEGIN
    SELECT TOP 1
      @cta = LTRIM(RTRIM(ISNULL(CTA, '')))
    FROM dbo.DAT_CAT_CTAS
    WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = 'AD'
    ORDER BY CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(DCTA, '')))) = 'DIFERENCIAS EN ORD DE TRABAJO' THEN 0
      ELSE 1
    END, CTA;
  END;

  IF ISNULL(LTRIM(RTRIM(ISNULL(@cta, ''))), '') = ''
    SET @cta = '101001001';

  IF OBJECT_ID('dbo.DAT_CMOV', 'U') IS NOT NULL
  BEGIN
    SELECT TOP 1
      @docSeed = COALESCE(TRY_CONVERT(BIGINT, NDOC), @docSeed)
    FROM dbo.DAT_CMOV
    WHERE TRY_CONVERT(INT, CMOV) = @mov;
  END;

  SET @docWidth = CASE WHEN LEN(CONVERT(VARCHAR(50), ISNULL(@docSeed, 80000000))) > 8
                       THEN LEN(CONVERT(VARCHAR(50), ISNULL(@docSeed, 80000000)))
                       ELSE 8 END;

  EXEC @lockResult = sp_getapplock
    @Resource = @lockResource,
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 10000;

  IF @lockResult < 0
    THROW 58060, 'No se pudo obtener lock para generar NDOC de diferencia ORD trabajo', 1;

  SELECT @classCol = CASE
    WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CMOV') IS NOT NULL THEN 'CMOV'
    WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CLSD') IS NOT NULL THEN 'CLSD'
    ELSE NULL
  END;

  IF @classCol IS NOT NULL AND COL_LENGTH('dbo.DAT_CTRL_CTAS', 'NDOC') IS NOT NULL
  BEGIN
    SET @sql = N'
      SELECT @pMAX = ISNULL(MAX(
        TRY_CONVERT(BIGINT, LEFT(LTRIM(RTRIM(ISNULL(NDOC, ''''))), PATINDEX(''%[^0-9]%'', LTRIM(RTRIM(ISNULL(NDOC, ''''))) + ''X'') - 1))
      ), 0)
      FROM dbo.DAT_CTRL_CTAS WITH (UPDLOCK, HOLDLOCK)
      WHERE TRY_CONVERT(INT, ' + QUOTENAME(@classCol) + N') = @pMOV
        AND LTRIM(RTRIM(ISNULL(NDOC, ''''))) <> '''';';

    EXEC sp_executesql
      @sql,
      N'@pMOV INT, @pMAX BIGINT OUTPUT',
      @pMOV = @mov,
      @pMAX = @maxCtrl OUTPUT;
  END;

  IF OBJECT_ID('dbo.DAT_CTR_DOC', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'DOC') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'CLSMOV') IS NOT NULL
  BEGIN
    SELECT @maxDoc = ISNULL(MAX(
      TRY_CONVERT(BIGINT, LEFT(LTRIM(RTRIM(ISNULL(DOC, ''))), PATINDEX('%[^0-9]%', LTRIM(RTRIM(ISNULL(DOC, ''))) + 'X') - 1))
    ), 0)
    FROM dbo.DAT_CTR_DOC WITH (UPDLOCK, HOLDLOCK)
    WHERE TRY_CONVERT(INT, CLSMOV) = @mov
      AND LTRIM(RTRIM(ISNULL(DOC, ''))) <> '';
  END;

  SET @nextDoc = (SELECT MAX(V) FROM (VALUES (ISNULL(@docSeed, 80000000)), (ISNULL(@maxCtrl, 0)), (ISNULL(@maxDoc, 0))) AS T(V)) + 1;
  SET @ndoc = CONCAT(RIGHT(REPLICATE('0', @docWidth) + CONVERT(VARCHAR(50), @nextDoc), @docWidth), 'GT', ISNULL(@sucNorm, ''));

  IF OBJECT_ID('dbo.DAT_CTR_DOC', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'DOC') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'CLSMOV') IS NOT NULL
  BEGIN
    INSERT INTO dbo.DAT_CTR_DOC (DOC, CLSMOV, FCND, [USER], STAT)
    VALUES (@ndoc, CONVERT(VARCHAR(20), @mov), GETDATE(), LEFT(ISNULL(@USR, SYSTEM_USER), 255), 'V');
  END;

  DECLARE @cols NVARCHAR(MAX);
  DECLARE @vals NVARCHAR(MAX);

  ;WITH cols AS (
    SELECT
      c.name,
      c.column_id,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsIdentity')) AS is_identity,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsComputed')) AS is_computed
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.DAT_CTRL_CTAS')
  )
  SELECT
    @cols = STRING_AGG(QUOTENAME(name), ','),
    @vals = STRING_AGG(
      CASE
        WHEN name = 'SUC' THEN '@P_SUC'
        WHEN name = 'CLIENT' THEN '@P_CLIENT'
        WHEN name = 'IDFOL' THEN '@P_IDFOL'
        WHEN name = 'CTA' THEN '@P_CTA'
        WHEN name = 'IMPT' THEN '@P_IMPT'
        WHEN name = 'FCND' THEN 'GETDATE()'
        WHEN name = 'FCNR' THEN 'GETDATE()'
        WHEN name = 'FCN' THEN 'GETDATE()'
        WHEN name = 'FECHA' THEN 'GETDATE()'
        WHEN name = 'RTXT' THEN 'LEFT(ISNULL(@P_DESC_MOV, ''''), 255)'
        WHEN name = 'NDOC' THEN 'LEFT(@P_DOC, 255)'
        WHEN name = 'CLSD' THEN '@P_MOV'
        WHEN name = 'CMOV' THEN '@P_MOV'
        ELSE 'NULL'
      END,
      ','
    )
  FROM cols
  WHERE ISNULL(is_identity, 0) = 0
    AND ISNULL(is_computed, 0) = 0;

  IF ISNULL(@cols, '') = '' OR ISNULL(@vals, '') = ''
    RETURN;

  SET @sql = N'INSERT INTO dbo.DAT_CTRL_CTAS (' + @cols + N') VALUES (' + @vals + N');';

  EXEC sp_executesql
    @sql,
    N'@P_SUC NVARCHAR(10), @P_CLIENT FLOAT, @P_IDFOL NVARCHAR(255), @P_CTA NVARCHAR(20), @P_IMPT FLOAT, @P_DESC_MOV NVARCHAR(255), @P_DOC NVARCHAR(255), @P_MOV INT',
    @P_SUC = @SUC,
    @P_CLIENT = @CLIENT,
    @P_IDFOL = @IDFOL,
    @P_CTA = @cta,
    @P_IMPT = @impt,
    @P_DESC_MOV = @DESC_MOV,
    @P_DOC = @ndoc,
    @P_MOV = @mov;
END;
GO
