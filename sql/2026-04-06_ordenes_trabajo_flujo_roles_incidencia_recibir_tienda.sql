/*
  2026-04-06
  ORDs - Ajustes de flujo y visibilidad:
  1) Visibilidad por rol en sp_ordenes_trabajo_panel segun matriz operativa.
  2) Incidencia mantiene flujo 9 y persiste TIPOM.
  3) Recibir en tienda: 9 -> 9.1/9.2 segun TIPOM (o 10 si no hay incidencia).
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
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
  IF @PANEL_MODE NOT IN ('operativo', 'anulados', 'entregadas')
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

  IF @PANEL_MODE = 'anulados'
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
      VALUES (2), (3), (3.1), (5), (7), (8), (9), (9.1), (9.2), (10), (12);
    END
    ELSE IF @ROLE_CODE IN ('ANALISTA', 'ANALISTA_ORD')
    BEGIN
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (2), (3), (3.1), (5), (9.1), (9.2), (10), (12);
    END
    ELSE IF @ROLE_CODE IN ('ENC_MAQUILA', 'ENCARGADO_MAQUILA', 'ENC_BISEL', 'ENCARGADO_BISELADO')
    BEGIN
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (7), (8), (9);
    END

    IF @IS_ADMIN = 1 OR @ROLE_CODE IN ('JEF_TALLER', 'TALLER', 'ANALISTA', 'ANALISTA_ORD')
      SET @ALLOW_NULL_ESTSEGU = 1;
  END;

  WITH base AS (
    SELECT
      o.IORD,
      o.IDFOL,
      o.TIPO,
      o.OPV,
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
    LEFT JOIN dbo.DAT_LAB lab
      ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
    WHERE
      (@IORD IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''))) LIKE '%' + @IORD + '%')
      AND (@IDFOL IS NULL OR LTRIM(RTRIM(ISNULL(o.IDFOL, ''))) LIKE '%' + @IDFOL + '%')
      AND (
        @CLIENT IS NULL
        OR CAST(ISNULL(o.CLIEN, '') AS NVARCHAR(255)) LIKE '%' + @CLIENT + '%'
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
        OR CAST(ISNULL(o.CLIEN, '') AS NVARCHAR(255)) LIKE '%' + @SEARCH + '%'
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

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_regresar_incidencia_lote
  @IORDS NVARCHAR(MAX),
  @TIPOM INT,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF ISNULL(@TIPOM, 0) <= 0
    THROW 58320, 'Debe enviar un motivo valido en @TIPOM', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.DAT_ORD_TMOV
    WHERE TRY_CONVERT(INT, IDT) = @TIPOM
  )
    THROW 58321, 'El motivo de incidencia enviado no existe en DAT_ORD_TMOV', 1;

  DECLARE @ords TABLE (IORD NVARCHAR(255) NOT NULL PRIMARY KEY);
  INSERT INTO @ords (IORD)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(value, ''))))
  FROM STRING_SPLIT(ISNULL(@IORDS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (SELECT 1 FROM @ords)
    THROW 58322, 'Debe enviar al menos una ORD en @IORDS', 1;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @target TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY,
    IDFOL NVARCHAR(255) NULL,
    SUC NVARCHAR(10) NULL,
    ESTSEGU FLOAT NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))),
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU)
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  INNER JOIN @ords i
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = i.IORD
  WHERE
    (
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

  IF EXISTS (
    SELECT 1
    FROM @ords i
    LEFT JOIN @target t ON t.IORD = i.IORD
    WHERE t.IORD IS NULL
  )
  BEGIN
    DECLARE @missingIords NVARCHAR(2000) = (
      SELECT STRING_AGG(i.IORD, ', ')
      FROM @ords i
      LEFT JOIN @target t ON t.IORD = i.IORD
      WHERE t.IORD IS NULL
    );
    DECLARE @missingMsg NVARCHAR(2048) = LEFT(
      CONCAT('ORD no encontrada o sin acceso por sucursal: ', ISNULL(@missingIords, '')),
      2048
    );
    THROW 58323, @missingMsg, 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.ESTSEGU, -1) <> 9
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.ESTSEGU, -1) <> 9
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden registrar incidencias para ORDs en estatus 9: ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58324, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = 9,
      o.ESTATUS = 2,
      o.TIPOM = @TIPOM,
      o.FCNMOD = GETDATE()
    FROM dbo.PV_CTR_ORDS o
    INNER JOIN @target t
      ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    o.IORD,
    o.IDFOL,
    o.SUC,
    o.ESTATUS,
    o.ESTSEGU,
    o.TIPOM,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN @target t
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD
  ORDER BY o.IORD;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_regresar_tienda_lote
  @IORDS NVARCHAR(MAX),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ords TABLE (IORD NVARCHAR(255) NOT NULL PRIMARY KEY);
  INSERT INTO @ords (IORD)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(value, ''))))
  FROM STRING_SPLIT(ISNULL(@IORDS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (SELECT 1 FROM @ords)
    THROW 58330, 'Debe enviar al menos una ORD en @IORDS', 1;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @target TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY,
    IDFOL NVARCHAR(255) NULL,
    SUC NVARCHAR(10) NULL,
    ESTSEGU FLOAT NULL,
    TIPOM INT NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU, TIPOM)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))),
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU),
    TRY_CONVERT(INT, o.TIPOM)
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  INNER JOIN @ords i
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = i.IORD
  WHERE
    (
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

  IF EXISTS (
    SELECT 1
    FROM @ords i
    LEFT JOIN @target t ON t.IORD = i.IORD
    WHERE t.IORD IS NULL
  )
  BEGIN
    DECLARE @missingIords NVARCHAR(2000) = (
      SELECT STRING_AGG(i.IORD, ', ')
      FROM @ords i
      LEFT JOIN @target t ON t.IORD = i.IORD
      WHERE t.IORD IS NULL
    );
    DECLARE @missingMsg NVARCHAR(2048) = LEFT(
      CONCAT('ORD no encontrada o sin acceso por sucursal: ', ISNULL(@missingIords, '')),
      2048
    );
    THROW 58331, @missingMsg, 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.ESTSEGU, -1) <> 9
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.ESTSEGU, -1) <> 9
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden recibir en tienda ORDs en estatus 9: ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58332, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = CASE
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2
        ELSE 10
      END,
      o.ESTATUS = 2,
      o.FCNRT = GETDATE(),
      o.FCNMOD = GETDATE()
    FROM dbo.PV_CTR_ORDS o
    INNER JOIN @target t
      ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    o.IORD,
    o.IDFOL,
    o.SUC,
    o.ESTATUS,
    o.ESTSEGU,
    o.TIPOM,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN @target t
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD
  ORDER BY o.IORD;
END;
GO
