/* Índices para consulta de flujos históricos de ORDs.
   Complementan IX_PV_CTR_ORDS_FLUJO_HIST_IORD_ESTSEGU_FCNR:
   - buscar primero las ORDs que tuvieron el flujo elegido;
   - localizar rápidamente el siguiente evento por ORD y fecha.
*/
IF OBJECT_ID(N'dbo.PV_CTR_ORDS_FLUJO_HIST', N'U') IS NULL
  THROW 59401, 'No existe dbo.PV_CTR_ORDS_FLUJO_HIST. Ejecute primero la migración de historial de ORDs.', 1;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS_FLUJO_HIST')
    AND name = N'IX_PV_CTR_ORDS_FLUJO_HIST_ESTSEGU_IORD_FCNR'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_PV_CTR_ORDS_FLUJO_HIST_ESTSEGU_IORD_FCNR
    ON dbo.PV_CTR_ORDS_FLUJO_HIST (ESTSEGU, IORD, FCNR DESC, ID DESC);
END;
GO

/* Índice de acceso para el patrón de Consulta Estado: sucursal + fecha de
   solicitud. Solo se instala cuando FCNS es una columna fecha nativa.
*/
DECLARE @fcnsType INT;
DECLARE @fcnmType INT;
SELECT @fcnsType = c.system_type_id
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS') AND c.name = N'FCNS';
SELECT @fcnmType = c.system_type_id
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS') AND c.name = N'FCNM';

IF @fcnsType IN (40, 42, 58, 61)
  AND @fcnmType IN (40, 42, 58, 61)
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS')
      AND name = N'IX_PV_CTR_ORDS_SUC_FCNS_IORD_ESTADO'
  )
BEGIN
  CREATE NONCLUSTERED INDEX IX_PV_CTR_ORDS_SUC_FCNS_IORD_ESTADO
    ON dbo.PV_CTR_ORDS (SUC, FCNS DESC, IORD DESC)
    INCLUDE (FCNM, ESTATUS, ESTSEGU);
END;
GO

/* El SP legacy serializaba cada fila completa de PV_CTR_ORDS tres veces a
   JSON para resolver los nombres alternos TIPOM/TPOM, REEORD/REOORD y
   DOCDIF/DOCIF. Parsear una sola vez reduce CPU sin cambiar el contrato.
   El reemplazo es deliberadamente estricto: si el SP no coincide con la
   estructura conocida, aborta sin alterar su definición.
*/
DECLARE @panel NVARCHAR(MAX) = OBJECT_DEFINITION(
  OBJECT_ID(N'dbo.sp_ordenes_trabajo_panel')
);

IF @panel IS NULL
  THROW 59402, 'No existe dbo.sp_ordenes_trabajo_panel.', 1;

SET @panel = REPLACE(@panel, CHAR(13) + CHAR(10), CHAR(10));
DECLARE @nl NCHAR(1) = NCHAR(10);

IF CHARINDEX(N'compatx.TIPOM', @panel) = 0
BEGIN
  DECLARE @start INT = CHARINDEX(
    N'    OUTER APPLY (' + @nl +
    N'      SELECT TOP 1 TRY_CONVERT(INT, j.[value]) AS TIPOM',
    @panel
  );
  DECLARE @lastEnd INT = CHARINDEX(N'    ) docdifx' + @nl, @panel, @start);

  IF @start = 0 OR @lastEnd = 0
    THROW 59403, 'No se encontraron los tres bloques JSON esperados en sp_ordenes_trabajo_panel.', 1;

  SET @lastEnd += LEN(N'    ) docdifx');
  SET @panel = STUFF(
    @panel,
    @start,
    @lastEnd - @start,
    N'    OUTER APPLY (' + @nl +
    N'      SELECT' + @nl +
    N'        COALESCE(' + @nl +
    N'          MAX(CASE WHEN j.[key] = ''TIPOM'' THEN TRY_CONVERT(INT, j.[value]) END),' + @nl +
    N'          MAX(CASE WHEN j.[key] = ''TPOM'' THEN TRY_CONVERT(INT, j.[value]) END)' + @nl +
    N'        ) AS TIPOM,' + @nl +
    N'        COALESCE(' + @nl +
    N'          MAX(CASE WHEN j.[key] = ''REEORD'' THEN LTRIM(RTRIM(ISNULL(CAST(j.[value] AS NVARCHAR(255)), ''''))) END),' + @nl +
    N'          MAX(CASE WHEN j.[key] = ''REOORD'' THEN LTRIM(RTRIM(ISNULL(CAST(j.[value] AS NVARCHAR(255)), ''''))) END)' + @nl +
    N'        ) AS REEORD,' + @nl +
    N'        COALESCE(' + @nl +
    N'          MAX(CASE WHEN j.[key] = ''DOCDIF'' THEN LTRIM(RTRIM(ISNULL(CAST(j.[value] AS NVARCHAR(255)), ''''))) END),' + @nl +
    N'          MAX(CASE WHEN j.[key] = ''DOCIF'' THEN LTRIM(RTRIM(ISNULL(CAST(j.[value] AS NVARCHAR(255)), ''''))) END)' + @nl +
    N'        ) AS DOCDIF' + @nl +
    N'      FROM OPENJSON((SELECT o.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) j' + @nl +
    N'    ) compatx'
  );
  SET @panel = REPLACE(@panel, N'tipomx.TIPOM', N'compatx.TIPOM');
  SET @panel = REPLACE(@panel, N'reeordx.REEORD', N'compatx.REEORD');
  SET @panel = REPLACE(@panel, N'docdifx.DOCDIF', N'compatx.DOCDIF');
END;

/* Cuando Consulta Estado tiene un flujo elegido, el API lee el recorrido
   acotado a ese estado. Evitar que el SP vuelva a agregar el historial
   completo por cada ORD en el mismo request.
*/
DECLARE @historialAntes NVARCHAR(MAX) =
  N'        WHERE h.IORD = o.IORD' + @nl +
  N'        GROUP BY h.ESTSEGU';
DECLARE @historialDespues NVARCHAR(MAX) =
  N'        WHERE h.IORD = o.IORD' + @nl +
  N'          AND NOT (@PANEL_MODE = ''estado'' AND @ESTSEGU IS NOT NULL)' + @nl +
  N'        GROUP BY h.ESTSEGU';
IF CHARINDEX(N'hist.FLUJO_HISTORIAL', @panel) > 0
  AND CHARINDEX(N'AND NOT (@PANEL_MODE = ''estado'' AND @ESTSEGU IS NOT NULL)', @panel) = 0
BEGIN
  IF CHARINDEX(@historialAntes, @panel) = 0
    THROW 59405, 'No se encontró el agregado del historial esperado en sp_ordenes_trabajo_panel.', 1;
  SET @panel = REPLACE(@panel, @historialAntes, @historialDespues);
END;

/* Para columnas fecha nativas, comparar rangos sin convertir la columna.
   Esto mantiene el significado de los filtros inclusivos por día y permite
   buscar por índice. Si el esquema usa texto, se conserva el SQL original.
*/
DECLARE @sucCollation SYSNAME;
SELECT @fcnsType = c.system_type_id
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS') AND c.name = N'FCNS';
SELECT @fcnmType = c.system_type_id
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS') AND c.name = N'FCNM';
SELECT @sucCollation = c.collation_name
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS') AND c.name = N'SUC';

DECLARE @sucAntes NVARCHAR(MAX) =
  N'      AND (' + @nl +
  N'        @SUC IS NULL' + @nl +
  N'        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '''')))) = UPPER(@SUC)' + @nl +
  N'      )';
DECLARE @sucDespues NVARCHAR(MAX) =
  N'      AND (@SUC IS NULL OR o.SUC = UPPER(@SUC))';
IF @sucCollation LIKE N'%[_]CI[_]%'
BEGIN
  IF CHARINDEX(@sucAntes, @panel) > 0
    SET @panel = REPLACE(@panel, @sucAntes, @sucDespues);
END;

IF @fcnsType IN (40, 42, 58, 61) AND @fcnmType IN (40, 42, 58, 61)
BEGIN
  DECLARE @fechasAntes NVARCHAR(MAX) =
    N'      AND (@FECINI IS NULL OR TRY_CONVERT(DATE, o.FCNS) >= TRY_CONVERT(DATE, @FECINI))' + @nl +
    N'      AND (@FECFIN IS NULL OR TRY_CONVERT(DATE, ISNULL(o.FCNM, o.FCNS)) <= TRY_CONVERT(DATE, @FECFIN))';
  DECLARE @fechasDespues NVARCHAR(MAX) =
    N'      AND (@FECINI IS NULL OR o.FCNS >= TRY_CONVERT(DATE, @FECINI))' + @nl +
    N'      AND (' + @nl +
    N'        @FECFIN IS NULL' + @nl +
    N'        OR o.FCNM < DATEADD(DAY, 1, TRY_CONVERT(DATE, @FECFIN))' + @nl +
    N'        OR (o.FCNM IS NULL AND o.FCNS < DATEADD(DAY, 1, TRY_CONVERT(DATE, @FECFIN)))' + @nl +
    N'      )';
  IF CHARINDEX(@fechasAntes, @panel) > 0
    SET @panel = REPLACE(@panel, @fechasAntes, @fechasDespues);

  DECLARE @ordenAntes NVARCHAR(MAX) =
    N'      ROW_NUMBER() OVER (' + @nl +
    N'        ORDER BY ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) DESC, o.IORD DESC' + @nl +
    N'      ) AS RN,';
  DECLARE @ordenDespues NVARCHAR(MAX) =
    N'      ROW_NUMBER() OVER (' + @nl +
    N'        ORDER BY CASE WHEN @FECINI IS NOT NULL THEN o.FCNS ELSE ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) END DESC, o.IORD DESC' + @nl +
    N'      ) AS RN,';
  IF CHARINDEX(@ordenAntes, @panel) > 0
    SET @panel = REPLACE(@panel, @ordenAntes, @ordenDespues);
END;

DECLARE @createPos INT = CHARINDEX(N'CREATE', UPPER(@panel));
IF UPPER(SUBSTRING(@panel, @createPos, LEN(N'CREATE OR ALTER'))) <> N'CREATE OR ALTER'
  SET @panel = STUFF(@panel, @createPos, LEN(N'CREATE'), N'CREATE OR ALTER');

EXEC sys.sp_executesql @panel;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.PV_CTR_ORDS_FLUJO_HIST')
    AND name = N'IX_PV_CTR_ORDS_FLUJO_HIST_IORD_FCNR_ID'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_PV_CTR_ORDS_FLUJO_HIST_IORD_FCNR_ID
    ON dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, FCNR, ID)
    INCLUDE (ESTSEGU);
END;
GO
