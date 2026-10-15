/*
Inventario de valores posteriores al reloj local en IOELOCAL.
Solo SELECT y tablas temporales de sesion; no modifica tablas ni objetos permanentes.
NOLOCK evita bloquear escrituras, pero el conteo es preliminar y requiere revalidacion
consistente antes de cualquier correccion. Excluye columnas tipo time y fechas guardadas como texto.
*/
SET NOCOUNT ON;

IF DB_NAME() <> N'IOELOCAL'
BEGIN
  ;THROW 51000, 'Este inventario solo admite IOELOCAL.', 1;
END;

DECLARE @UtcNow datetime2(7) = SYSUTCDATETIME();
DECLARE @MexicoOffset datetimeoffset(7) =
  @UtcNow AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)';
DECLARE @MexicoLocal datetime2(7) = CONVERT(datetime2(7), @MexicoOffset);
DECLARE @TodayMexico date = CONVERT(date, @MexicoLocal);

SELECT
  @@SERVERNAME AS server_name,
  DB_NAME() AS database_name,
  CONVERT(varchar(33), SYSDATETIMEOFFSET(), 127) AS sql_clock_with_offset,
  CONVERT(varchar(33), @UtcNow, 126) AS scan_utc,
  CONVERT(varchar(33), @MexicoOffset, 127) AS scan_mexico_offset,
  CONVERT(varchar(33), @MexicoLocal, 126) AS scan_mexico_local,
  (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE database_id = DB_ID()) AS read_committed_snapshot,
  (SELECT snapshot_isolation_state_desc FROM sys.databases WHERE database_id = DB_ID()) AS snapshot_isolation;

CREATE TABLE #DateFutureInventory
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  type_name sysname NOT NULL,
  rows_after_mexico bigint NOT NULL,
  rows_after_utc bigint NULL,
  min_future varchar(40) NULL,
  max_future varchar(40) NULL
);

DECLARE @SchemaName sysname;
DECLARE @TableName sysname;
DECLARE @Aggregates nvarchar(max);
DECLARE @Unpivot nvarchar(max);
DECLARE @Sql nvarchar(max);

DECLARE date_tables CURSOR LOCAL FAST_FORWARD FOR
SELECT s.name, t.name
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE t.is_ms_shipped = 0
  AND EXISTS
  (
    SELECT 1
    FROM sys.columns AS c
    WHERE c.object_id = t.object_id
      AND c.system_type_id IN (40, 42, 43, 58, 61)
  )
ORDER BY s.name, t.name;

OPEN date_tables;
FETCH NEXT FROM date_tables INTO @SchemaName, @TableName;

WHILE @@FETCH_STATUS = 0
BEGIN
  ;WITH date_columns AS
  (
    SELECT
      c.column_id,
      c.name AS column_name,
      ty.name AS type_name,
      ROW_NUMBER() OVER (ORDER BY c.column_id) - 1 AS seq
    FROM sys.tables AS t
    JOIN sys.schemas AS s ON s.schema_id = t.schema_id
    JOIN sys.columns AS c ON c.object_id = t.object_id
    JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
    WHERE s.name = @SchemaName
      AND t.name = @TableName
      AND c.system_type_id IN (40, 42, 43, 58, 61)
  )
  SELECT
    @Aggregates = STRING_AGG
    (
      CONVERT(nvarchar(max),
        N'COALESCE(SUM(CONVERT(bigint, CASE WHEN ' + local_predicate + N' THEN 1 ELSE 0 END)),0) AS ' + QUOTENAME(N'f' + CONVERT(nvarchar(10), seq)) + N',' +
        utc_aggregate + N',' +
        N'MIN(CASE WHEN ' + local_predicate + N' THEN CONVERT(varchar(40), ' + qcol + N', ' + style_code + N') END) AS ' + QUOTENAME(N'lo' + CONVERT(nvarchar(10), seq)) + N',' +
        N'MAX(CASE WHEN ' + local_predicate + N' THEN CONVERT(varchar(40), ' + qcol + N', ' + style_code + N') END) AS ' + QUOTENAME(N'hi' + CONVERT(nvarchar(10), seq))
      ),
      N','
    ) WITHIN GROUP (ORDER BY column_id),
    @Unpivot = STRING_AGG
    (
      CONVERT(nvarchar(max),
        N'(N''' + REPLACE(column_name, N'''', N'''''') + N''', N''' + REPLACE(type_name, N'''', N'''''') +
        N''', a.' + QUOTENAME(N'f' + CONVERT(nvarchar(10), seq)) +
        N', a.' + QUOTENAME(N'u' + CONVERT(nvarchar(10), seq)) +
        N', a.' + QUOTENAME(N'lo' + CONVERT(nvarchar(10), seq)) +
        N', a.' + QUOTENAME(N'hi' + CONVERT(nvarchar(10), seq)) + N')'
      ),
      N','
    ) WITHIN GROUP (ORDER BY column_id)
  FROM
  (
    SELECT
      dc.*,
      N't.' + QUOTENAME(dc.column_name) AS qcol,
      CASE
        WHEN dc.type_name = N'date' THEN N't.' + QUOTENAME(dc.column_name) + N' > @TodayMexico'
        WHEN dc.type_name = N'datetimeoffset' THEN N't.' + QUOTENAME(dc.column_name) + N' > @MexicoOffset'
        ELSE N't.' + QUOTENAME(dc.column_name) + N' > @MexicoLocal'
      END AS local_predicate,
      CASE
        WHEN dc.type_name = N'date' THEN N'CAST(NULL AS bigint)'
        WHEN dc.type_name = N'datetimeoffset' THEN N't.' + QUOTENAME(dc.column_name) + N' > (@UtcNow AT TIME ZONE N''UTC'')'
        ELSE N't.' + QUOTENAME(dc.column_name) + N' > @UtcNow'
      END AS utc_predicate,
      CASE
        WHEN dc.type_name = N'date' THEN N'CAST(NULL AS bigint) AS ' + QUOTENAME(N'u' + CONVERT(nvarchar(10), dc.seq))
        ELSE N'COALESCE(SUM(CONVERT(bigint, CASE WHEN ' +
          CASE
            WHEN dc.type_name = N'datetimeoffset' THEN N't.' + QUOTENAME(dc.column_name) + N' > (@UtcNow AT TIME ZONE N''UTC'')'
            ELSE N't.' + QUOTENAME(dc.column_name) + N' > @UtcNow'
          END +
          N' THEN 1 ELSE 0 END)),0) AS ' + QUOTENAME(N'u' + CONVERT(nvarchar(10), dc.seq))
      END AS utc_aggregate,
      CASE
        WHEN dc.type_name = N'date' THEN N'23'
        WHEN dc.type_name = N'datetimeoffset' THEN N'127'
        ELSE N'126'
      END AS style_code
    FROM date_columns AS dc
  ) AS expressions;

  SET @Sql =
    N'INSERT INTO #DateFutureInventory
      (schema_name, table_name, column_name, type_name, rows_after_mexico, rows_after_utc, min_future, max_future)
      SELECT @SchemaName, @TableName, v.column_name, v.type_name, v.rows_after_mexico, v.rows_after_utc, v.min_future, v.max_future
      FROM
      (
        SELECT ' + @Aggregates + N'
        FROM ' + QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName) + N' AS t WITH (NOLOCK)
      ) AS a
      CROSS APPLY (VALUES ' + @Unpivot + N') AS v
        (column_name, type_name, rows_after_mexico, rows_after_utc, min_future, max_future)
      WHERE v.rows_after_mexico > 0;';

  EXEC sys.sp_executesql
    @Sql,
    N'@SchemaName sysname, @TableName sysname, @UtcNow datetime2(7), @MexicoLocal datetime2(7), @MexicoOffset datetimeoffset(7), @TodayMexico date',
    @SchemaName = @SchemaName,
    @TableName = @TableName,
    @UtcNow = @UtcNow,
    @MexicoLocal = @MexicoLocal,
    @MexicoOffset = @MexicoOffset,
    @TodayMexico = @TodayMexico;

  FETCH NEXT FROM date_tables INTO @SchemaName, @TableName;
END;

CLOSE date_tables;
DEALLOCATE date_tables;

SELECT
  schema_name,
  table_name,
  column_name,
  type_name,
  rows_after_mexico,
  rows_after_utc,
  min_future,
  max_future
FROM #DateFutureInventory
ORDER BY schema_name, table_name, column_name;
