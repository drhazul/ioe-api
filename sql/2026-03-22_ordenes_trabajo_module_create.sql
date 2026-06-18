/*
  2026-03-22
  Modulo Ordenes de Trabajo (DAT_JAO_ORD)
  - Panel server-side con filtros
  - Flujo operativo (autorizar, enviar, recibir, entregar, garantia)
  - Procesos transaccionales de cambio material y merma
  - Escaneo por codigo (IORD o IDFOL)
  - Registro de movimientos en DAT_MB51 y diferencia contable en DAT_CTRL_CTAS
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
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
        WHEN name = 'ART' THEN '@P_ART'
        WHEN name = 'CTDA' THEN '@P_CTDA'
        WHEN name = 'CTOT' THEN 'ABS(@P_CTDA)'
        WHEN name = 'TXT' THEN 'LEFT(ISNULL(@P_TXT, ''''), 255)'
        WHEN name = 'SUC' THEN '@P_SUC'
        WHEN name = 'DOCP' THEN 'LEFT(ISNULL(@P_DOCP, ''''), 255)'
        WHEN name = 'USER' THEN 'LEFT(ISNULL(@P_USR, SYSTEM_USER), 255)'
        WHEN name = 'CLSM' THEN 'LEFT(ISNULL(@P_CLSM, ''ORD''), 50)'
        WHEN name = 'FCND' THEN 'CONVERT(date, GETDATE())'
        WHEN name = 'FCNC' THEN 'GETDATE()'
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
    N'@P_SUC NVARCHAR(10), @P_ART NVARCHAR(255), @P_CTDA FLOAT, @P_TXT NVARCHAR(255), @P_DOCP NVARCHAR(255), @P_USR NVARCHAR(255), @P_CLSM NVARCHAR(50)',
    @P_SUC = @SUC,
    @P_ART = @ART,
    @P_CTDA = @CTDA,
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
  @DESC_MOV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    RETURN;

  IF ABS(ISNULL(@DIFF, 0)) < 0.0001
    RETURN;

  DECLARE @impt FLOAT = CASE WHEN @DIFF > 0 THEN -ABS(@DIFF) ELSE ABS(@DIFF) END;
  DECLARE @mov INT = CASE WHEN @DIFF > 0 THEN 602 ELSE 601 END;
  DECLARE @cta NVARCHAR(20) = '101001002';
  DECLARE @doc NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@DOCDIF, '')));

  IF @doc = ''
    SET @doc = CONCAT('ODIF-', FORMAT(GETDATE(), 'yyyyMMddHHmmss'), '-', RIGHT(CONVERT(VARCHAR(36), NEWID()), 4));

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
    @P_DOC = @doc,
    @P_MOV = @mov;
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

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_panel
  @IORD NVARCHAR(255) = NULL,
  @IDFOL NVARCHAR(255) = NULL,
  @CLIENT NVARCHAR(255) = NULL,
  @ART NVARCHAR(255) = NULL,
  @TIPO NVARCHAR(255) = NULL,
  @LABOR NVARCHAR(255) = NULL,
  @ESTATUS NVARCHAR(255) = NULL,
  @ESTSEGU NVARCHAR(255) = NULL,
  @FECINI NVARCHAR(30) = NULL,
  @FECFIN NVARCHAR(30) = NULL,
  @ASIGN NVARCHAR(255) = NULL,
  @TIPOM NVARCHAR(255) = NULL,
  @MOTR NVARCHAR(255) = NULL,
  @SUC NVARCHAR(10) = NULL,
  @SEARCH NVARCHAR(255) = NULL,
  @PAGE INT = 1,
  @PAGESIZE INT = 25,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @HOME_SUC NVARCHAR(10) = NULL,
  @PANEL_MODE NVARCHAR(20) = 'operativo',
  @ROLE_CODE NVARCHAR(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @PAGE IS NULL OR @PAGE < 1 SET @PAGE = 1;
  IF @PAGESIZE IS NULL OR @PAGESIZE < 1 SET @PAGESIZE = 25;
  IF @PAGESIZE > 25 SET @PAGESIZE = 25;

  SET @PANEL_MODE = LOWER(LTRIM(RTRIM(ISNULL(@PANEL_MODE, 'operativo'))));
  IF @PANEL_MODE NOT IN ('operativo', 'estado', 'anulados', 'entregadas')
    SET @PANEL_MODE = 'operativo';

  SET @ROLE_CODE = UPPER(LTRIM(RTRIM(ISNULL(@ROLE_CODE, ''))));
  SET @HOME_SUC = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(@HOME_SUC, '')))), '');

  DECLARE @ROLE_TIPO_SCOPE NVARCHAR(20) = NULL;
  DECLARE @USE_HOME_LAB_SCOPE BIT = 0;
  IF @ROLE_CODE IN ('ENC_MAQUILA', 'ENCARGADO_MAQUILA')
    SET @ROLE_TIPO_SCOPE = 'TALLADO';
  ELSE IF @ROLE_CODE IN ('ENC_BISEL', 'ENCARGADO_BISELADO')
    SET @ROLE_TIPO_SCOPE = 'BISELADO';

  IF @ROLE_CODE IN (
    'ANALISTA',
    'ANALISTA_ORD',
    'ENC_MAQUILA',
    'ENCARGADO_MAQUILA',
    'ENC_BISEL',
    'ENCARGADO_BISELADO'
  )
    SET @USE_HOME_LAB_SCOPE = 1;

  DECLARE @offset INT = (@PAGE - 1) * @PAGESIZE;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @allowedStatus TABLE (ESTSEGU FLOAT PRIMARY KEY);
  DECLARE @ALLOW_NULL_ESTSEGU BIT = 0;

  IF @PANEL_MODE = 'estado'
  BEGIN
    IF @IS_ADMIN = 1 OR @ROLE_CODE IN ('JEF_TALLER', 'ANALISTA_ORD', 'ANALISTA')
      INSERT INTO @allowedStatus (ESTSEGU)
      SELECT DISTINCT TRY_CONVERT(FLOAT, ESTA)
      FROM dbo.DAT_EST_ORD
      WHERE TRY_CONVERT(FLOAT, ESTA) IS NOT NULL;
  END
  ELSE IF @PANEL_MODE = 'anulados'
  BEGIN
    IF @IS_ADMIN = 1 OR @ROLE_CODE IN ('JEF_TALLER', 'TALLER')
      INSERT INTO @allowedStatus (ESTSEGU) VALUES (4);
  END
  ELSE IF @PANEL_MODE = 'entregadas'
  BEGIN
    IF @IS_ADMIN = 1 OR @ROLE_CODE IN ('JEF_TALLER', 'TALLER')
      INSERT INTO @allowedStatus (ESTSEGU) VALUES (11);
  END
  ELSE
  BEGIN
    IF @IS_ADMIN = 1 OR @ROLE_CODE IN ('JEF_TALLER', 'TALLER')
    BEGIN
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (10), (12);
      SET @ALLOW_NULL_ESTSEGU = 1;
    END
    ELSE IF @ROLE_CODE IN ('ANALISTA', 'ANALISTA_ORD')
    BEGIN
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (10), (12);
      SET @ALLOW_NULL_ESTSEGU = 1;
    END
    ELSE IF @ROLE_CODE IN ('ENC_MAQUILA', 'ENCARGADO_MAQUILA', 'ENC_BISEL', 'ENCARGADO_BISELADO')
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (5), (7), (8), (9), (9.1), (9.2);
  END;

  WITH base AS (
    SELECT
      o.IORD,
      o.IDFOL,
      o.TIPO,
      LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), ''))) AS OPV_ID,
      COALESCE(
        NULLIF(LTRIM(RTRIM(ISNULL(uopv.NOMBRE, ''))), ''),
        NULLIF(
          LTRIM(
            RTRIM(
              CONCAT(
                ISNULL(opv.NOMB, ''),
                CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(opv.APELP, ''))) END,
                CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(opv.APELM, ''))) END
              )
            )
          ),
          ''
        ),
        LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
      ) AS OPV,
      o.FCNS,
      o.FCNM,
      o.CLIEN,
      o.NCLIENTE,
      o.MAT,
      o.CTD,
      o.ART,
      o.DESCART,
      o.COMAD,
      o.ESTATUS,
      o.ESTSEGU,
      o.ASIGN,
      o.LABOR,
      o.MOTR,
      tipomx.TIPOM,
      reeordx.REEORD,
      docdifx.DOCDIF,
      o.SUC,
      e.TIPO AS ESTSEGU_DESC,
      ROW_NUMBER() OVER (
        ORDER BY ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) DESC, o.IORD DESC
      ) AS RN,
      COUNT(1) OVER () AS TOTAL_COUNT
    FROM dbo.PV_CTR_ORDS o
    OUTER APPLY (
      SELECT TOP 1 TRY_CONVERT(INT, j.[value]) AS TIPOM
      FROM OPENJSON((SELECT o.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) j
      WHERE j.[key] IN ('TIPOM', 'TPOM')
      ORDER BY CASE WHEN j.[key] = 'TIPOM' THEN 0 ELSE 1 END
    ) tipomx
    OUTER APPLY (
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(CAST(j.[value] AS NVARCHAR(255)), ''))) AS REEORD
      FROM OPENJSON((SELECT o.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) j
      WHERE j.[key] IN ('REEORD', 'REOORD')
      ORDER BY CASE WHEN j.[key] = 'REEORD' THEN 0 ELSE 1 END
    ) reeordx
    OUTER APPLY (
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(CAST(j.[value] AS NVARCHAR(255)), ''))) AS DOCDIF
      FROM OPENJSON((SELECT o.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) j
      WHERE j.[key] IN ('DOCDIF', 'DOCIF')
      ORDER BY CASE WHEN j.[key] = 'DOCDIF' THEN 0 ELSE 1 END
    ) docdifx
    LEFT JOIN dbo.DAT_EST_ORD e
      ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
    LEFT JOIN dbo.USUARIO uopv
      ON TRY_CONVERT(INT, uopv.IDUSUARIO) = TRY_CONVERT(INT, o.OPV)
    LEFT JOIN dbo.PV_OPV opv
      ON LTRIM(RTRIM(ISNULL(CAST(opv.IDOPV AS NVARCHAR(100)), ''))) = LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
    LEFT JOIN dbo.DAT_LAB lab
      ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
    WHERE
      (@IORD IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''))) LIKE '%' + @IORD + '%')
      AND (@IDFOL IS NULL OR LTRIM(RTRIM(ISNULL(o.IDFOL, ''))) LIKE '%' + @IDFOL + '%')
      AND (
        @CLIENT IS NULL
        OR (
          CASE
            WHEN TRY_CONVERT(DECIMAL(38, 0), o.CLIEN) IS NOT NULL
              THEN CONVERT(NVARCHAR(255), CONVERT(DECIMAL(38, 0), o.CLIEN))
            ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(255), ISNULL(o.CLIEN, ''))))
          END
        ) LIKE '%' + @CLIENT + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE '%' + UPPER(@CLIENT) + '%'
      )
      AND (@ART IS NULL OR LTRIM(RTRIM(ISNULL(o.ART, ''))) LIKE '%' + @ART + '%')
      AND (@TIPO IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) LIKE '%' + UPPER(@TIPO) + '%')
      AND (@LABOR IS NULL OR CAST(ISNULL(o.LABOR, '') AS NVARCHAR(255)) = @LABOR)
      AND (@ESTATUS IS NULL OR CAST(ISNULL(o.ESTATUS, '') AS NVARCHAR(255)) = @ESTATUS)
      AND (
        @ESTSEGU IS NULL
        OR (
          UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '')))) = 'NULL'
          AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
        )
        OR CAST(ISNULL(o.ESTSEGU, '') AS NVARCHAR(255)) = @ESTSEGU
      )
      AND (@ASIGN IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) LIKE '%' + UPPER(@ASIGN) + '%')
      AND (@TIPOM IS NULL OR CAST(ISNULL(tipomx.TIPOM, '') AS NVARCHAR(255)) = @TIPOM)
      AND (@MOTR IS NULL OR CAST(ISNULL(o.MOTR, '') AS NVARCHAR(255)) = @MOTR)
      AND (
        @SUC IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@SUC)
      )
      AND (@FECINI IS NULL OR TRY_CONVERT(DATE, o.FCNS) >= TRY_CONVERT(DATE, @FECINI))
      AND (@FECFIN IS NULL OR TRY_CONVERT(DATE, ISNULL(o.FCNM, o.FCNS)) <= TRY_CONVERT(DATE, @FECFIN))
      AND (
        @SEARCH IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.ART, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.DESCART, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR (
          CASE
            WHEN TRY_CONVERT(DECIMAL(38, 0), o.CLIEN) IS NOT NULL
              THEN CONVERT(NVARCHAR(255), CONVERT(DECIMAL(38, 0), o.CLIEN))
            ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(255), ISNULL(o.CLIEN, ''))))
          END
        ) LIKE '%' + @SEARCH + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
      )
      AND (
        @IS_ADMIN = 1
        OR NOT EXISTS (SELECT 1 FROM @allowed)
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (SELECT SUC FROM @allowed)
      )
      AND (
        @USE_HOME_LAB_SCOPE = 0
        OR (
          @HOME_SUC IS NOT NULL
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = @HOME_SUC
            OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) = @HOME_SUC
          )
        )
      )
      AND (
        @ROLE_TIPO_SCOPE IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) = @ROLE_TIPO_SCOPE
      )
      AND TRY_CONVERT(INT, o.ESTATUS) = 2
      AND (
        EXISTS (
          SELECT 1
          FROM @allowedStatus a
          WHERE a.ESTSEGU = TRY_CONVERT(FLOAT, o.ESTSEGU)
        )
        OR (
          @ALLOW_NULL_ESTSEGU = 1
          AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
        )
      )
  )
  SELECT *
  FROM base
  WHERE RN > @offset
    AND RN <= (@offset + @PAGESIZE)
  ORDER BY RN;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_detalle
  @IORD NVARCHAR(255),
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

  DECLARE @headerJson NVARCHAR(MAX);
  DECLARE @detailsJson NVARCHAR(MAX);

  SELECT @headerJson = (
    SELECT TOP 1
      o.*,
      e.TIPO AS ESTSEGU_DESC
    FROM dbo.PV_CTR_ORDS o
    LEFT JOIN dbo.DAT_EST_ORD e
      ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
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
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
  );

  IF @headerJson IS NULL
  BEGIN
    SELECT
      CAST(NULL AS NVARCHAR(MAX)) AS HEADER_JSON,
      CAST('[]' AS NVARCHAR(MAX)) AS DETAILS_JSON;
    RETURN;
  END;

  SELECT @detailsJson = (
    SELECT
      d.*
    FROM dbo.PV_CTR_ORDS_DET d
    WHERE d.IORD = @IORD
    ORDER BY
      CASE WHEN TRY_CONVERT(BIGINT, d.IORDP) IS NULL THEN 1 ELSE 0 END,
      TRY_CONVERT(BIGINT, d.IORDP),
      d.ART
    FOR JSON PATH
  );

  SELECT
    @headerJson AS HEADER_JSON,
    ISNULL(@detailsJson, '[]') AS DETAILS_JSON;
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

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_autorizar
  @IORD NVARCHAR(255),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = 3,
    @ESTATUS = 2,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_enviar
  @IORD NVARCHAR(255),
  @ASIGN NVARCHAR(255) = NULL,
  @LABOR INT = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = 5,
    @ESTATUS = 2,
    @ASIGN = @ASIGN,
    @LABOR = @LABOR,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_recibir
  @IORD NVARCHAR(255),
  @DESTINO NVARCHAR(20) = 'TALLER',
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  DECLARE @estado FLOAT = CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(@DESTINO, 'TALLER')))) = 'ANALISTA' THEN 10 ELSE 7 END;

  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = @estado,
    @ESTATUS = 2,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_entregar
  @IORD NVARCHAR(255),
  @OBS NVARCHAR(255) = NULL,
  @FIRMA_CLIENTE NVARCHAR(MAX) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = 11,
    @ESTATUS = 2,
    @OBS = @OBS,
    @FIRMA_CLIENTE = @FIRMA_CLIENTE,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_garantia
  @IORD NVARCHAR(255),
  @MOTIVO NVARCHAR(255),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = 12,
    @ESTATUS = 2,
    @OBS = @MOTIVO,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material
  @IORD NVARCHAR(255),
  @ART_NUEVO NVARCHAR(255),
  @MOTIVO NVARCHAR(255),
  @LABOR INT = NULL,
  @DOCDIF NVARCHAR(255) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @idfol NVARCHAR(255);
  DECLARE @sucOrd NVARCHAR(10);
  DECLARE @artOrig NVARCHAR(255);
  DECLARE @ctd FLOAT;
  DECLARE @clien FLOAT;
  DECLARE @newIord NVARCHAR(255);
  DECLARE @tipom INT = 1;
  DECLARE @motrInt INT = TRY_CONVERT(INT, @MOTIVO);
  DECLARE @doc NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@DOCDIF, '')));
  DECLARE @costOrig FLOAT = 0;
  DECLARE @costNuevo FLOAT = 0;
  DECLARE @ctdAbs FLOAT = 0;
  DECLARE @ctdSalida FLOAT = 0;
  DECLARE @docpOrig NVARCHAR(255);
  DECLARE @docpNew NVARCHAR(255);
  DECLARE @diffCost FLOAT = 0;
  DECLARE @txtReingreso NVARCHAR(255);
  DECLARE @txtSalida NVARCHAR(255);
  DECLARE @txtDiff NVARCHAR(255);

  IF LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''))) = ''
    THROW 58020, 'artNuevo es requerido para cambio de material', 1;

  IF LTRIM(RTRIM(ISNULL(@MOTIVO, ''))) = ''
    THROW 58021, 'motivo es requerido para cambio de material', 1;

  IF @doc = ''
    SET @doc = CONCAT('ODIF-', FORMAT(GETDATE(), 'yyyyMMddHHmmss'), '-', RIGHT(CONVERT(VARCHAR(36), NEWID()), 4));

  SELECT TOP 1
    @idfol = o.IDFOL,
    @sucOrd = o.SUC,
    @artOrig = o.ART,
    @ctd = TRY_CONVERT(FLOAT, o.CTD),
    @clien = TRY_CONVERT(FLOAT, o.CLIEN)
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
    );

  IF @idfol IS NULL
    THROW 58022, 'No existe la ORD origen o no tiene acceso por sucursal', 1;

  SET @newIord = LEFT(CONCAT(ISNULL(@idfol, 'ORD'), '-CM-', FORMAT(GETDATE(), 'yyyyMMddHHmmss'), '-', RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)), 255);
  SET @ctdAbs = ABS(ISNULL(@ctd, 0));
  SET @ctdSalida = -ABS(ISNULL(@ctd, 0));
  SET @docpOrig = ISNULL(@idfol, @IORD);
  SET @docpNew = ISNULL(@idfol, @newIord);
  SET @txtReingreso = CONCAT('Reintegracion por cambio material ORD ', @IORD);
  SET @txtSalida = CONCAT('Salida por cambio material ORD ', @newIord);
  SET @txtDiff = CONCAT('Diferencia cambio material ORD ', @IORD, ' -> ', @newIord);

  BEGIN TRY
    BEGIN TRANSACTION;

    EXEC dbo.sp_ordenes_trabajo_clone_ord
      @IORD_ORIG = @IORD,
      @IORD_NEW = @newIord,
      @NEW_ART = @ART_NUEVO,
      @NEW_CTD = @ctd,
      @TIPOM = @tipom,
      @MOTR = @motrInt,
      @REEORD = @IORD,
      @DOCDIF = @doc,
      @ESTSEGU = 3,
      @ESTATUS = 2;

    IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
    BEGIN
      INSERT INTO dbo.PV_CTR_ORDS_DET (IORD, ART, JOB, ESF, CIL, EJE)
      SELECT
        @newIord,
        COALESCE(NULLIF(@ART_NUEVO, ''), d.ART),
        d.JOB,
        d.ESF,
        d.CIL,
        d.EJE
      FROM dbo.PV_CTR_ORDS_DET d
      WHERE d.IORD = @IORD;
    END;

    UPDATE dbo.PV_CTR_ORDS
    SET
      ESTSEGU = 4,
      ESTATUS = 2,
      FCNMOD = GETDATE(),
      COMAD = LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          'CAMBIO MATERIAL: ',
          @MOTIVO
        ),
        2000
      )
    WHERE IORD = @IORD;

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdAbs,
      @TXT = @txtReingreso,
      @DOCP = @docpOrig,
      @USR = @USER,
      @CLSM = 'ORD';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @ART_NUEVO,
      @CTDA = @ctdSalida,
      @TXT = @txtSalida,
      @DOCP = @docpNew,
      @USR = @USER,
      @CLSM = 'ORD';

    IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
    BEGIN
      SELECT TOP 1 @costOrig = TRY_CONVERT(FLOAT, a.CTOP)
      FROM dbo.DAT_ART a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@artOrig, ''))));

      SELECT TOP 1 @costNuevo = TRY_CONVERT(FLOAT, a.CTOP)
      FROM dbo.DAT_ART a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''))));
    END;

    SET @diffCost = (ISNULL(@costNuevo, 0) - ISNULL(@costOrig, 0)) * ISNULL(@ctd, 0);

    EXEC dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff
      @SUC = @sucOrd,
      @CLIENT = @clien,
      @IDFOL = @idfol,
      @DIFF = @diffCost,
      @DOCDIF = @doc,
      @DESC_MOV = @txtDiff;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    @IORD AS IORD_ORIG,
    @newIord AS IORD_NUEVA,
    @idfol AS IDFOL,
    @doc AS DOCDIF,
    @sucOrd AS SUC,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma
  @IORD NVARCHAR(255),
  @CANTIDAD_MERMA FLOAT,
  @MOTIVO NVARCHAR(255),
  @CREAR_NUEVA_ORD BIT = 1,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @idfol NVARCHAR(255);
  DECLARE @sucOrd NVARCHAR(10);
  DECLARE @artOrig NVARCHAR(255);
  DECLARE @ctdOrig FLOAT;
  DECLARE @clien FLOAT;
  DECLARE @remanente FLOAT;
  DECLARE @newIord NVARCHAR(255) = NULL;
  DECLARE @tipom INT = 2;
  DECLARE @motrInt INT = TRY_CONVERT(INT, @MOTIVO);
  DECLARE @ctdMermaAbs FLOAT = 0;
  DECLARE @ctdMermaSalida FLOAT = 0;
  DECLARE @docpMerma NVARCHAR(255);
  DECLARE @txtMermaReingreso NVARCHAR(255);
  DECLARE @txtMermaSalida NVARCHAR(255);

  IF ISNULL(@CANTIDAD_MERMA, 0) <= 0
    THROW 58030, 'cantidadMerma debe ser mayor a cero', 1;

  IF LTRIM(RTRIM(ISNULL(@MOTIVO, ''))) = ''
    THROW 58031, 'motivo es requerido para merma', 1;

  SELECT TOP 1
    @idfol = o.IDFOL,
    @sucOrd = o.SUC,
    @artOrig = o.ART,
    @ctdOrig = TRY_CONVERT(FLOAT, o.CTD),
    @clien = TRY_CONVERT(FLOAT, o.CLIEN)
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
    );

  IF @idfol IS NULL
    THROW 58032, 'No existe la ORD origen o no tiene acceso por sucursal', 1;

  IF ISNULL(@ctdOrig, 0) <= 0
    THROW 58033, 'La ORD no tiene cantidad valida para procesar merma', 1;

  IF @CANTIDAD_MERMA > @ctdOrig
    THROW 58034, 'cantidadMerma no puede ser mayor a la cantidad original', 1;

  SET @remanente = @ctdOrig - @CANTIDAD_MERMA;

  IF @CREAR_NUEVA_ORD = 1
    SET @newIord = LEFT(CONCAT(ISNULL(@idfol, 'ORD'), '-MR-', FORMAT(GETDATE(), 'yyyyMMddHHmmss'), '-', RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)), 255);

  SET @ctdMermaAbs = ABS(@CANTIDAD_MERMA);
  SET @ctdMermaSalida = -ABS(@CANTIDAD_MERMA);
  SET @docpMerma = ISNULL(@idfol, @IORD);
  SET @txtMermaReingreso = CONCAT('Reintegracion por merma ORD ', @IORD);
  SET @txtMermaSalida = CONCAT('Salida por merma ORD ', ISNULL(@newIord, @IORD));

  BEGIN TRY
    BEGIN TRANSACTION;

    IF @CREAR_NUEVA_ORD = 1
    BEGIN
      EXEC dbo.sp_ordenes_trabajo_clone_ord
        @IORD_ORIG = @IORD,
        @IORD_NEW = @newIord,
        @NEW_ART = @artOrig,
        @NEW_CTD = @CANTIDAD_MERMA,
        @TIPOM = @tipom,
        @MOTR = @motrInt,
        @REEORD = @IORD,
        @DOCDIF = NULL,
        @ESTSEGU = 3,
        @ESTATUS = 2;

      IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.PV_CTR_ORDS_DET (IORD, ART, JOB, ESF, CIL, EJE)
        SELECT
          @newIord,
          d.ART,
          d.JOB,
          d.ESF,
          d.CIL,
          d.EJE
        FROM dbo.PV_CTR_ORDS_DET d
        WHERE d.IORD = @IORD;
      END;
    END;

    UPDATE dbo.PV_CTR_ORDS
    SET
      CTD = CASE WHEN @remanente > 0 THEN @remanente ELSE CTD END,
      ESTSEGU = CASE WHEN @remanente > 0 THEN ESTSEGU ELSE 4 END,
      ESTATUS = 2,
      FCNMOD = GETDATE(),
      COMAD = LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          'MERMA: ',
          @MOTIVO
        ),
        2000
      )
    WHERE IORD = @IORD;

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdMermaAbs,
      @TXT = @txtMermaReingreso,
      @DOCP = @docpMerma,
      @USR = @USER,
      @CLSM = 'ORD';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdMermaSalida,
      @TXT = @txtMermaSalida,
      @DOCP = @docpMerma,
      @USR = @USER,
      @CLSM = 'ORD';

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    @IORD AS IORD_ORIG,
    @newIord AS IORD_NUEVA,
    @idfol AS IDFOL,
    @ctdOrig AS CTD_ORIGINAL,
    @CANTIDAD_MERMA AS CTD_MERMA,
    @remanente AS CTD_REMANENTE,
    CASE WHEN @remanente <= 0 THEN 1 ELSE 0 END AS ORD_CANCELADA,
    @sucOrd AS SUC,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_scan_recibir
  @CODE NVARCHAR(255),
  @DESTINO NVARCHAR(20) = 'TALLER',
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @iord NVARCHAR(255);
  DECLARE @obs NVARCHAR(255);

  SELECT TOP 1 @iord = o.IORD
  FROM dbo.PV_CTR_ORDS o
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@CODE, ''))));

  IF @iord IS NULL
  BEGIN
    SELECT TOP 1 @iord = o.IORD
    FROM dbo.PV_CTR_ORDS o
    WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@CODE, ''))))
    ORDER BY ISNULL(o.FCNMOD, o.FCNM) DESC;
  END;

  IF @iord IS NULL
    THROW 58040, 'No se encontro ORD para el codigo escaneado', 1;

  EXEC dbo.sp_ordenes_trabajo_recibir
    @IORD = @iord,
    @DESTINO = @DESTINO,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_scan_entregar
  @CODE NVARCHAR(255),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @iord NVARCHAR(255);
  DECLARE @obs NVARCHAR(255);

  SELECT TOP 1 @iord = o.IORD
  FROM dbo.PV_CTR_ORDS o
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@CODE, ''))));

  IF @iord IS NULL
  BEGIN
    SELECT TOP 1 @iord = o.IORD
    FROM dbo.PV_CTR_ORDS o
    WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@CODE, ''))))
    ORDER BY ISNULL(o.FCNMOD, o.FCNM) DESC;
  END;

  IF @iord IS NULL
    THROW 58041, 'No se encontro ORD para el codigo escaneado', 1;

  SET @obs = CONCAT('Entrega por escaneo [', ISNULL(@CODE, ''), ']');

  EXEC dbo.sp_ordenes_trabajo_entregar
    @IORD = @iord,
    @OBS = @obs,
    @FIRMA_CLIENTE = NULL,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO
