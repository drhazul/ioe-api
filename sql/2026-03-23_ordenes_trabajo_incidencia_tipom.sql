/*
  2026-03-23
  ORDs: motivo catalogado para "Regresar por incidencia"
  - Crea/siembra dbo.DAT_ORD_TMOV
  - sp_ordenes_trabajo_panel expone ASIGNADO con label de PV_OPV (NOMB + APELM + APELP)
  - sp_ordenes_trabajo_regresar_incidencia_lote exige @TIPOM y lo persiste en PV_CTR_ORDS.TIPOM
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.DAT_ORD_TMOV', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DAT_ORD_TMOV (
    IDT INT NOT NULL PRIMARY KEY,
    TIPOM NVARCHAR(150) NOT NULL
  );
END;
GO

MERGE dbo.DAT_ORD_TMOV AS target
USING (
  SELECT 1 AS IDT, N'CAMBIO DE ARTICULO' AS TIPOM
  UNION ALL
  SELECT 2 AS IDT, N'MERMA DE ART Y CAMBIO' AS TIPOM
) AS src
ON target.IDT = src.IDT
WHEN MATCHED THEN
  UPDATE SET TIPOM = src.TIPOM
WHEN NOT MATCHED THEN
  INSERT (IDT, TIPOM) VALUES (src.IDT, src.TIPOM);
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
      VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (10), (12);
      SET @ALLOW_NULL_ESTSEGU = 1;
    END
    ELSE IF @ROLE_CODE IN ('ANALISTA', 'ANALISTA_ORD')
    BEGIN
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (2), (3), (3.1), (6), (9.1), (9.2), (10), (12);
      SET @ALLOW_NULL_ESTSEGU = 1;
    END
    ELSE IF @ROLE_CODE IN ('ENC_MAQUILA', 'ENCARGADO_MAQUILA', 'ENC_BISEL', 'ENCARGADO_BISELADO')
      INSERT INTO @allowedStatus (ESTSEGU)
      VALUES (5), (7), (8), (9);
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
      COALESCE(assignx.ASIGN_LABEL, LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) AS ASIGN,
      LTRIM(RTRIM(ISNULL(o.ASIGN, ''))) AS ASIGN_ID,
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
      SELECT TOP 1
        LTRIM(RTRIM(
          CONCAT(
            ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(p.NOMB, ''))), ''), ''),
            CASE WHEN LTRIM(RTRIM(ISNULL(p.NOMB, ''))) <> '' AND LTRIM(RTRIM(ISNULL(p.APELM, ''))) <> '' THEN ' ' ELSE '' END,
            ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(p.APELM, ''))), ''), ''),
            CASE WHEN
              (LTRIM(RTRIM(ISNULL(p.NOMB, ''))) <> '' OR LTRIM(RTRIM(ISNULL(p.APELM, ''))) <> '')
              AND LTRIM(RTRIM(ISNULL(p.APELP, ''))) <> ''
              THEN ' '
              ELSE ''
            END,
            ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(p.APELP, ''))), ''), '')
          )
        )) AS ASIGN_LABEL
      FROM dbo.PV_OPV p
      WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(p.IDOPV AS NVARCHAR(100)), '')))) =
            UPPER(LTRIM(RTRIM(ISNULL(CAST(o.ASIGN AS NVARCHAR(100)), ''))))
        AND (
          UPPER(LTRIM(RTRIM(ISNULL(p.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
          OR LTRIM(RTRIM(ISNULL(p.SUC, ''))) = ''
        )
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(p.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
            THEN 0
          ELSE 1
        END
    ) assignx
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
    WHERE
      (@IORD IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''))) LIKE '%' + @IORD + '%')
      AND (@IDFOL IS NULL OR LTRIM(RTRIM(ISNULL(o.IDFOL, ''))) LIKE '%' + @IDFOL + '%')
      AND (@CLIENT IS NULL OR CAST(ISNULL(o.CLIEN, '') AS NVARCHAR(255)) LIKE '%' + @CLIENT + '%')
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
      AND (
        @ASIGN IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) LIKE '%' + UPPER(@ASIGN) + '%'
        OR UPPER(ISNULL(assignx.ASIGN_LABEL, '')) LIKE '%' + UPPER(@ASIGN) + '%'
      )
      AND (@TIPOM IS NULL OR CAST(ISNULL(tipomx.TIPOM, '') AS NVARCHAR(255)) = @TIPOM)
      AND (@MOTR IS NULL OR CAST(ISNULL(o.MOTR, '') AS NVARCHAR(255)) = @MOTR)
      AND (@SUC IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@SUC))
      AND (@FECINI IS NULL OR TRY_CONVERT(DATE, o.FCNS) >= TRY_CONVERT(DATE, @FECINI))
      AND (@FECFIN IS NULL OR TRY_CONVERT(DATE, ISNULL(o.FCNM, o.FCNS)) <= TRY_CONVERT(DATE, @FECFIN))
      AND (
        @SEARCH IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.ART, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR UPPER(LTRIM(RTRIM(ISNULL(o.DESCART, '')))) LIKE '%' + UPPER(@SEARCH) + '%'
        OR CAST(ISNULL(o.CLIEN, '') AS NVARCHAR(255)) LIKE '%' + @SEARCH + '%'
      )
      AND (
        @IS_ADMIN = 1
        OR NOT EXISTS (SELECT 1 FROM @allowed)
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (SELECT SUC FROM @allowed)
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
    THROW 58320, 'Debe enviar un motivo válido en @TIPOM', 1;

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
  INNER JOIN @ords i
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = i.IORD
  WHERE
    (@SUC IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@SUC))
    AND (
      @IS_ADMIN = 1
      OR NOT EXISTS (SELECT 1 FROM @allowed)
      OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (SELECT SUC FROM @allowed)
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
      CONCAT('Solo se pueden regresar por incidencia ORDs en estatus 9 (TRABAJO TERMINADO): ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58324, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = 9.1,
      o.ESTATUS = 2,
      o.TIPOM = @TIPOM,
      o.FCNTE = GETDATE(),
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
