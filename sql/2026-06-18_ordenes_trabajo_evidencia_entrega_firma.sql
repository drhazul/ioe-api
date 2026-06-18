/*
  2026-06-18
  Evidencia de entrega de ORDs
  - Persistir firma digital de entrega en PV_CTR_ORDS
  - Conservar firma al consultar detalle
  - Evitar herencia de firma en clones de ORD
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.PV_CTR_ORDS', 'FIRMA_CLIENTE') IS NULL
BEGIN
  ALTER TABLE dbo.PV_CTR_ORDS
    ADD FIRMA_CLIENTE NVARCHAR(MAX) NULL;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_set_estado
  @IORD NVARCHAR(255),
  @ESTSEGU FLOAT,
  @ESTATUS INT = NULL,
  @ASIGN NVARCHAR(255) = NULL,
  @LABOR INT = NULL,
  @OBS NVARCHAR(255) = NULL,
  @FIRMA_CLIENTE NVARCHAR(MAX) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PV_CTR_ORDS o
    LEFT JOIN dbo.DAT_LAB lab
      ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
    WHERE o.IORD = @IORD
      AND (
        @SUC IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@SUC)
        OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) = UPPER(@SUC)
      )
      AND (
        @IS_ADMIN = 1
        OR NOT EXISTS (SELECT 1 FROM @allowed)
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (SELECT SUC FROM @allowed)
        OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) IN (SELECT SUC FROM @allowed)
      )
  )
  BEGIN
    THROW 58010, 'No existe la ORD o no esta autorizada para la sucursal', 1;
  END;

  UPDATE dbo.PV_CTR_ORDS
  SET
    ESTSEGU = @ESTSEGU,
    ESTATUS = COALESCE(@ESTATUS, ESTATUS),
    ASIGN = COALESCE(NULLIF(@ASIGN, ''), ASIGN),
    LABOR = COALESCE(@LABOR, LABOR),
    FCNMOD = GETDATE(),
    FCNEN = CASE WHEN @ESTSEGU = 11 THEN GETDATE() ELSE FCNEN END,
    HR_ENT = CASE WHEN @ESTSEGU = 11 THEN GETDATE() ELSE HR_ENT END,
    FIRMA_CLIENTE = CASE
      WHEN @ESTSEGU = 11 THEN COALESCE(NULLIF(@FIRMA_CLIENTE, ''), FIRMA_CLIENTE)
      ELSE FIRMA_CLIENTE
    END,
    COMAD = CASE
      WHEN NULLIF(@OBS, '') IS NULL THEN COMAD
      ELSE LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          @OBS
        ),
        2000
      )
    END
  WHERE IORD = @IORD;

  SELECT TOP 1
    o.IORD,
    o.IDFOL,
    o.ESTATUS,
    o.ESTSEGU,
    o.SUC,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  WHERE o.IORD = @IORD;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_clone_ord
  @IORD_ORIG NVARCHAR(255),
  @IORD_NEW NVARCHAR(255),
  @NEW_ART NVARCHAR(255) = NULL,
  @NEW_CTD FLOAT = NULL,
  @TIPOM INT = NULL,
  @MOTR INT = NULL,
  @REEORD NVARCHAR(255) = NULL,
  @DOCDIF NVARCHAR(255) = NULL,
  @ESTSEGU FLOAT = 3,
  @ESTATUS INT = 3
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID('dbo.PV_CTR_ORDS', 'U') IS NULL
    THROW 58001, 'No existe tabla PV_CTR_ORDS', 1;

  DECLARE @cols NVARCHAR(MAX);
  DECLARE @vals NVARCHAR(MAX);
  DECLARE @sql NVARCHAR(MAX);

  ;WITH cols AS (
    SELECT
      c.name,
      c.column_id,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsComputed')) AS is_computed
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.PV_CTR_ORDS')
  )
  SELECT
    @cols = STRING_AGG(QUOTENAME(name), ','),
    @vals = STRING_AGG(
      CASE
        WHEN name = 'ART' THEN 'COALESCE(NULLIF(@P_NEW_ART, ''''), o.[ART])'
        WHEN name = 'MAT' THEN 'COALESCE(NULLIF(@P_NEW_ART, ''''), o.[MAT])'
        WHEN name = 'CTD' THEN 'COALESCE(@P_NEW_CTD, TRY_CONVERT(FLOAT, o.[CTD]))'
        WHEN name = 'ESTSEGU' THEN '@P_ESTSEGU'
        WHEN name = 'ESTATUS' THEN '@P_ESTATUS'
        WHEN name = 'FCNMOD' THEN 'GETDATE()'
        WHEN name = 'REEORD' THEN 'COALESCE(NULLIF(@P_REEORD, ''''), @P_IORD_ORIG)'
        WHEN name = 'REOORD' THEN 'COALESCE(NULLIF(@P_REEORD, ''''), @P_IORD_ORIG)'
        WHEN name = 'TIPOM' THEN 'COALESCE(@P_TIPOM, TRY_CONVERT(INT, o.[TIPOM]))'
        WHEN name = 'TPOM' THEN 'COALESCE(@P_TIPOM, TRY_CONVERT(INT, o.[TPOM]))'
        WHEN name = 'MOTR' THEN 'COALESCE(@P_MOTR, TRY_CONVERT(INT, o.[MOTR]))'
        WHEN name = 'DOCDIF' THEN 'COALESCE(NULLIF(@P_DOCDIF, ''''), o.[DOCDIF])'
        WHEN name = 'DOCIF' THEN 'COALESCE(NULLIF(@P_DOCDIF, ''''), o.[DOCIF])'
        WHEN name = 'FIRMA_CLIENTE' THEN 'NULL'
        ELSE 'o.' + QUOTENAME(name)
      END,
      ','
    )
  FROM cols
  WHERE name <> 'IORD'
    AND ISNULL(is_computed, 0) = 0;

  IF ISNULL(@cols, '') = '' OR ISNULL(@vals, '') = ''
    THROW 58002, 'No se pudo resolver columnas para clonar ORD', 1;

  SET @sql = N'
    INSERT INTO dbo.PV_CTR_ORDS (IORD,' + @cols + N')
    SELECT @P_IORD_NEW,' + @vals + N'
    FROM dbo.PV_CTR_ORDS o
    WHERE o.IORD = @P_IORD_ORIG;

    IF @@ROWCOUNT = 0
      THROW 58003, ''No existe IORD origen para clonar'', 1;
  ';

  EXEC sp_executesql
    @sql,
    N'@P_IORD_ORIG NVARCHAR(255), @P_IORD_NEW NVARCHAR(255), @P_NEW_ART NVARCHAR(255), @P_NEW_CTD FLOAT, @P_TIPOM INT, @P_MOTR INT, @P_REEORD NVARCHAR(255), @P_DOCDIF NVARCHAR(255), @P_ESTSEGU FLOAT, @P_ESTATUS INT',
    @P_IORD_ORIG = @IORD_ORIG,
    @P_IORD_NEW = @IORD_NEW,
    @P_NEW_ART = @NEW_ART,
    @P_NEW_CTD = @NEW_CTD,
    @P_TIPOM = @TIPOM,
    @P_MOTR = @MOTR,
    @P_REEORD = @REEORD,
    @P_DOCDIF = @DOCDIF,
    @P_ESTSEGU = @ESTSEGU,
    @P_ESTATUS = @ESTATUS;
END;
GO
