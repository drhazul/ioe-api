SET NOCOUNT ON;

;WITH idx AS (
  SELECT
    i.object_id,
    i.index_id,
    i.name AS index_name,
    i.is_unique,
    i.type_desc,
    i.fill_factor
  FROM sys.indexes i
  WHERE i.object_id IN (OBJECT_ID('dbo.DAT_CTRL_CTAS'), OBJECT_ID('dbo.DAT_CAT_CTAS'))
    AND i.index_id > 0
    AND i.is_hypothetical = 0
),
key_cols AS (
  SELECT
    ic.object_id,
    ic.index_id,
    STRING_AGG(QUOTENAME(c.name), ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
  FROM sys.index_columns ic
  INNER JOIN sys.columns c
    ON c.object_id = ic.object_id
   AND c.column_id = ic.column_id
  WHERE ic.object_id IN (OBJECT_ID('dbo.DAT_CTRL_CTAS'), OBJECT_ID('dbo.DAT_CAT_CTAS'))
    AND ic.is_included_column = 0
  GROUP BY ic.object_id, ic.index_id
),
include_cols AS (
  SELECT
    ic.object_id,
    ic.index_id,
    STRING_AGG(QUOTENAME(c.name), ', ') WITHIN GROUP (ORDER BY ic.index_column_id) AS include_columns
  FROM sys.index_columns ic
  INNER JOIN sys.columns c
    ON c.object_id = ic.object_id
   AND c.column_id = ic.column_id
  WHERE ic.object_id IN (OBJECT_ID('dbo.DAT_CTRL_CTAS'), OBJECT_ID('dbo.DAT_CAT_CTAS'))
    AND ic.is_included_column = 1
  GROUP BY ic.object_id, ic.index_id
)
SELECT
  sch.name AS schema_name,
  tbl.name AS table_name,
  idx.index_name,
  idx.is_unique,
  idx.type_desc,
  idx.fill_factor,
  ISNULL(key_cols.key_columns, '') AS key_columns,
  ISNULL(include_cols.include_columns, '') AS include_columns
FROM idx
INNER JOIN sys.tables tbl
  ON tbl.object_id = idx.object_id
INNER JOIN sys.schemas sch
  ON sch.schema_id = tbl.schema_id
LEFT JOIN key_cols
  ON key_cols.object_id = idx.object_id
 AND key_cols.index_id = idx.index_id
LEFT JOIN include_cols
  ON include_cols.object_id = idx.object_id
 AND include_cols.index_id = idx.index_id
ORDER BY table_name, idx.index_name;
