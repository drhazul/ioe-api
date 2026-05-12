/*
  2026-05-06
  Ajuste: sp_ordenes_trabajo_registrar_mb51 ahora también actualiza DAT_ART.STOCK
  por SUC+ART con el signo de CTDA, en la misma ejecución del movimiento MB51.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE IOELOCAL;
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

  IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_ART', 'STOCK') IS NOT NULL
  BEGIN
    ;WITH art_target AS (
      SELECT TOP 1
        a.SUC,
        a.ART,
        a.STOCK,
        a.BLOQ
      FROM dbo.DAT_ART a WITH (UPDLOCK, ROWLOCK)
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))))
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART, ''))))
      ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC
    )
    UPDATE art_target
    SET STOCK = ROUND(ISNULL(TRY_CONVERT(FLOAT, STOCK), 0) + ISNULL(@CTDA, 0), 4);
  END;
END;
GO
