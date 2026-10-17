/*
  Consulta Estado de ORDs:
  - registra cada cambio de ESTSEGU, sin depender del punto que actualiza la ORD;
  - agrega SIN FLUJO al filtro del panel estado;
  - en panel estado, un flujo especifico busca en todo el historial;
  - expone el flujo actual y el historial ordenado para la grilla.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.PV_CTR_ORDS_FLUJO_HIST', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PV_CTR_ORDS_FLUJO_HIST (
    ID bigint IDENTITY(1, 1) NOT NULL
      CONSTRAINT PK_PV_CTR_ORDS_FLUJO_HIST PRIMARY KEY,
    IORD nvarchar(255) NOT NULL,
    ESTSEGU float NULL,
    FCNR datetime2(0) NOT NULL
      CONSTRAINT DF_PV_CTR_ORDS_FLUJO_HIST_FCNR DEFAULT SYSDATETIME(),
    ORIGEN nvarchar(40) NOT NULL
      CONSTRAINT DF_PV_CTR_ORDS_FLUJO_HIST_ORIGEN DEFAULT N'PV_CTR_ORDS'
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.PV_CTR_ORDS_FLUJO_HIST')
    AND name = 'IX_PV_CTR_ORDS_FLUJO_HIST_IORD_ESTSEGU_FCNR'
)
BEGIN
  CREATE INDEX IX_PV_CTR_ORDS_FLUJO_HIST_IORD_ESTSEGU_FCNR
    ON dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, ESTSEGU, FCNR, ID);
END;
GO

/* Recupera las transiciones que ya fueron auditadas por la API. */
IF OBJECT_ID('dbo.AUDIT_LOG', 'U') IS NOT NULL
BEGIN
  INSERT dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, ESTSEGU, FCNR, ORIGEN)
  SELECT
    LTRIM(RTRIM(j.IORD)),
    j.ESTSEGU,
    TRY_CONVERT(datetime2(0), a.FCNR),
    N'AUDIT_LOG'
  FROM dbo.AUDIT_LOG a
  CROSS APPLY OPENJSON(JSON_QUERY(a.METADATA_JSON, '$.result'))
    WITH (
      IORD nvarchar(255) '$.IORD',
      ESTSEGU float '$.ESTSEGU'
    ) j
  WHERE a.MODULO = N'ordenes-trabajo'
    AND a.ENTIDAD = N'PV_CTR_ORDS'
    AND ISJSON(a.METADATA_JSON) = 1
    AND NULLIF(LTRIM(RTRIM(j.IORD)), N'') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
      WHERE h.IORD = LTRIM(RTRIM(j.IORD))
        AND h.FCNR = TRY_CONVERT(datetime2(0), a.FCNR)
        AND (
          h.ESTSEGU = j.ESTSEGU
          OR (h.ESTSEGU IS NULL AND j.ESTSEGU IS NULL)
        )
    );

  INSERT dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, ESTSEGU, FCNR, ORIGEN)
  SELECT
    LTRIM(RTRIM(JSON_VALUE(a.METADATA_JSON, '$.result.IORD'))),
    TRY_CONVERT(float, JSON_VALUE(a.METADATA_JSON, '$.result.ESTSEGU')),
    TRY_CONVERT(datetime2(0), a.FCNR),
    N'AUDIT_LOG'
  FROM dbo.AUDIT_LOG a
  WHERE a.MODULO = N'ordenes-trabajo'
    AND a.ENTIDAD = N'PV_CTR_ORDS'
    AND ISJSON(a.METADATA_JSON) = 1
    AND NULLIF(
      LTRIM(RTRIM(JSON_VALUE(a.METADATA_JSON, '$.result.IORD'))),
      N''
    ) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
      WHERE h.IORD = LTRIM(RTRIM(JSON_VALUE(a.METADATA_JSON, '$.result.IORD')))
        AND h.FCNR = TRY_CONVERT(datetime2(0), a.FCNR)
        AND (
          h.ESTSEGU = TRY_CONVERT(float, JSON_VALUE(a.METADATA_JSON, '$.result.ESTSEGU'))
          OR (
            h.ESTSEGU IS NULL
            AND JSON_VALUE(a.METADATA_JSON, '$.result.ESTSEGU') IS NULL
          )
        )
    );
END;
GO

/* Toda ORD queda al menos con una fotografia de su flujo actual. */
INSERT dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, ESTSEGU, FCNR, ORIGEN)
SELECT
  LTRIM(RTRIM(o.IORD)),
  TRY_CONVERT(float, o.ESTSEGU),
  COALESCE(
    TRY_CONVERT(datetime2(0), o.FCNMOD),
    TRY_CONVERT(datetime2(0), o.FCNS),
    TRY_CONVERT(datetime2(0), o.FCNM),
    SYSDATETIME()
  ),
  N'SEED_CURRENT'
FROM dbo.PV_CTR_ORDS o
WHERE NULLIF(LTRIM(RTRIM(ISNULL(o.IORD, N''))), N'') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
    WHERE h.IORD = LTRIM(RTRIM(o.IORD))
      AND (
        h.ESTSEGU = TRY_CONVERT(float, o.ESTSEGU)
        OR (h.ESTSEGU IS NULL AND TRY_CONVERT(float, o.ESTSEGU) IS NULL)
      )
  );
GO

EXEC(N'
CREATE OR ALTER TRIGGER dbo.tr_PV_CTR_ORDS_flujo_hist
ON dbo.PV_CTR_ORDS
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  INSERT dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, ESTSEGU, FCNR, ORIGEN)
  SELECT
    LTRIM(RTRIM(i.IORD)),
    TRY_CONVERT(float, i.ESTSEGU),
    SYSDATETIME(),
    N''TRIGGER''
  FROM inserted i
  LEFT JOIN deleted d
    ON d.IORD = i.IORD
  WHERE NULLIF(LTRIM(RTRIM(ISNULL(i.IORD, N''''))), N'''') IS NOT NULL
    AND (
      d.IORD IS NULL
      OR TRY_CONVERT(float, d.ESTSEGU) <> TRY_CONVERT(float, i.ESTSEGU)
      OR (d.ESTSEGU IS NULL AND i.ESTSEGU IS NOT NULL)
      OR (d.ESTSEGU IS NOT NULL AND i.ESTSEGU IS NULL)
    );
END;
');
GO

DECLARE @panel nvarchar(max) = OBJECT_DEFINITION(
  OBJECT_ID('dbo.sp_ordenes_trabajo_panel')
);

IF @panel IS NULL
  THROW 59201, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

DECLARE @estadoAntes nvarchar(max) = N'      WHERE TRY_CONVERT(FLOAT, ESTA) IS NOT NULL;
  END
  ELSE IF @PANEL_MODE = ''anulados''';
DECLARE @estadoDespues nvarchar(max) = N'      WHERE TRY_CONVERT(FLOAT, ESTA) IS NOT NULL;
    SET @ALLOW_NULL_ESTSEGU = 1;
  END
  ELSE IF @PANEL_MODE = ''anulados''';

IF CHARINDEX(@estadoAntes, @panel) = 0
  THROW 59202, 'No se encontro bloque estado en sp_ordenes_trabajo_panel', 1;
SET @panel = REPLACE(@panel, @estadoAntes, @estadoDespues);

DECLARE @selectAntes nvarchar(max) = N'      e.TIPO AS ESTSEGU_DESC,
      ROW_NUMBER() OVER (';
DECLARE @selectDespues nvarchar(max) = N'      e.TIPO AS ESTSEGU_DESC,
      hist.FLUJO_HISTORIAL,
      ROW_NUMBER() OVER (';

IF CHARINDEX(@selectAntes, @panel) = 0
  THROW 59203, 'No se encontro select de flujo en sp_ordenes_trabajo_panel', 1;
SET @panel = REPLACE(@panel, @selectAntes, @selectDespues);

DECLARE @joinAntes nvarchar(max) = N'    LEFT JOIN dbo.DAT_EST_ORD e
      ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)';
DECLARE @joinDespues nvarchar(max) = N'    OUTER APPLY (
      SELECT STRING_AGG(
        CAST(
          CONCAT(
            CASE
              WHEN hx.ESTSEGU IS NULL THEN N''SIN FLUJO''
              ELSE CONVERT(nvarchar(30), hx.ESTSEGU)
            END,
            CASE
              WHEN NULLIF(LTRIM(RTRIM(ISNULL(ex.TIPO, N''''))), N'''') IS NULL
                THEN N''''
              ELSE N'' '' + LTRIM(RTRIM(ex.TIPO))
            END
          ) AS nvarchar(max)
        ),
        N'' -> ''
      ) WITHIN GROUP (ORDER BY hx.PRIMERA_FCNR, hx.ORDEN) AS FLUJO_HISTORIAL
      FROM (
        SELECT
          h.ESTSEGU,
          MIN(h.FCNR) AS PRIMERA_FCNR,
          MIN(h.ID) AS ORDEN
        FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
        WHERE h.IORD = o.IORD
        GROUP BY h.ESTSEGU
      ) hx
      LEFT JOIN dbo.DAT_EST_ORD ex
        ON TRY_CONVERT(float, ex.ESTA) = hx.ESTSEGU
    ) hist
    LEFT JOIN dbo.DAT_EST_ORD e
      ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)';

IF CHARINDEX(@joinAntes, @panel) = 0
  THROW 59204, 'No se encontro join de flujo en sp_ordenes_trabajo_panel', 1;
SET @panel = REPLACE(@panel, @joinAntes, @joinDespues);

DECLARE @filtroAntes nvarchar(max) = N'      AND (
        @ESTSEGU IS NULL
        OR (
          UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) = ''NULL''
          AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
        )
        OR CAST(ISNULL(o.ESTSEGU, '''') AS NVARCHAR(255)) = @ESTSEGU
      )';
DECLARE @filtroDespues nvarchar(max) = N'      AND (
        @ESTSEGU IS NULL
        OR (
          @PANEL_MODE = ''estado''
          AND EXISTS (
            SELECT 1
            FROM dbo.PV_CTR_ORDS_FLUJO_HIST fh
            WHERE fh.IORD = o.IORD
              AND (
                (
                  UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) = ''NULL''
                  AND fh.ESTSEGU IS NULL
                )
                OR (
                  UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) <> ''NULL''
                  AND fh.ESTSEGU = TRY_CONVERT(float, @ESTSEGU)
                )
              )
          )
        )
        OR (
          @PANEL_MODE <> ''estado''
          AND (
            (
              UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) = ''NULL''
              AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
            )
            OR CAST(ISNULL(o.ESTSEGU, '''') AS NVARCHAR(255)) = @ESTSEGU
          )
        )
      )';

IF CHARINDEX(@filtroAntes, @panel) = 0
  THROW 59205, 'No se encontro filtro ESTSEGU en sp_ordenes_trabajo_panel', 1;
SET @panel = REPLACE(@panel, @filtroAntes, @filtroDespues);

DECLARE @createPos int = CHARINDEX('CREATE', UPPER(@panel));
IF UPPER(SUBSTRING(@panel, @createPos, LEN('CREATE OR ALTER'))) <> 'CREATE OR ALTER'
BEGIN
  SET @panel = STUFF(
    @panel,
    @createPos,
    LEN('CREATE'),
    'CREATE OR ALTER'
  );
END;
EXEC sp_executesql @panel;
GO

