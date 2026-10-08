/*
  Preflight solo lectura: desacoplamiento de devoluciones a proveedor.
  Objetivo: inventariar estado, definiciones y dependencias antes de tocar
  dbo.trg_dat_art_dev_provd_reserva.

  Compatible con SQL Server 2014 / nivel de compatibilidad 120.
*/
SET NOCOUNT ON;

SELECT
  DB_NAME() AS BASE_DATOS,
  @@SERVERNAME AS SERVIDOR,
  SYSDATETIME() AS FECHA_SERVIDOR;

SELECT
  s.name AS ESQUEMA,
  o.name AS OBJETO,
  o.type_desc AS TIPO,
  o.create_date AS FECHA_CREACION,
  o.modify_date AS FECHA_MODIFICACION,
  CASE
    WHEN o.type = 'TR' THEN OBJECTPROPERTYEX(o.object_id, 'ExecIsTriggerDisabled')
    ELSE NULL
  END AS TRIGGER_DESHABILITADO,
  LEN(m.definition) AS LONGITUD_DEFINICION,
  CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), m.definition)), 2) AS SHA256,
  m.definition AS DEFINICION
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.name = 'trg_dat_art_dev_provd_reserva'
   OR o.name LIKE 'sp_dev_provd_%'
ORDER BY o.type_desc, o.name;

SELECT
  t.name AS TABLA,
  c.column_id AS ORDEN,
  c.name AS COLUMNA,
  ty.name AS TIPO,
  c.max_length AS LONGITUD_BYTES,
  c.precision AS PRECISION,
  c.scale AS ESCALA,
  c.is_nullable AS ACEPTA_NULL,
  c.is_identity AS IDENTITY_COLUMN,
  dc.definition AS VALOR_DEFAULT
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
WHERE t.name LIKE 'DEV%PROVD'
   OR t.name = 'DEV_ENVIO_DOC'
ORDER BY t.name, c.column_id;

SELECT
  OBJECT_SCHEMA_NAME(fk.parent_object_id) AS ESQUEMA,
  OBJECT_NAME(fk.parent_object_id) AS TABLA,
  fk.name AS FK,
  COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS COLUMNA,
  OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS ESQUEMA_REFERENCIADO,
  OBJECT_NAME(fk.referenced_object_id) AS TABLA_REFERENCIADA,
  COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS COLUMNA_REFERENCIADA
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
WHERE OBJECT_NAME(fk.parent_object_id) LIKE 'DEV%PROVD'
   OR OBJECT_NAME(fk.parent_object_id) = 'DEV_ENVIO_DOC'
ORDER BY TABLA, FK;

SELECT
  t.name AS TABLA,
  i.name AS INDICE,
  i.is_primary_key AS ES_PK,
  i.is_unique AS ES_UNICO,
  c.name AS COLUMNA,
  ic.key_ordinal AS ORDEN_LLAVE,
  ic.is_included_column AS COLUMNA_INCLUIDA
FROM sys.tables t
JOIN sys.indexes i ON i.object_id = t.object_id
JOIN sys.index_columns ic
  ON ic.object_id = i.object_id
 AND ic.index_id = i.index_id
JOIN sys.columns c
  ON c.object_id = ic.object_id
 AND c.column_id = ic.column_id
WHERE t.name LIKE 'DEV%PROVD'
   OR t.name = 'DEV_ENVIO_DOC'
ORDER BY t.name, i.index_id, ic.key_ordinal, ic.index_column_id;

SELECT
  OBJECT_SCHEMA_NAME(d.referencing_id) AS ESQUEMA,
  OBJECT_NAME(d.referencing_id) AS OBJETO,
  d.referenced_schema_name AS ESQUEMA_REFERENCIADO,
  d.referenced_entity_name AS OBJETO_REFERENCIADO
FROM sys.sql_expression_dependencies d
WHERE d.referencing_id = OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva')
ORDER BY d.referenced_entity_name;

SELECT 'DEV_DOC_PROVD' AS TABLA, COUNT_BIG(*) AS REGISTROS FROM dbo.DEV_DOC_PROVD
UNION ALL SELECT 'DEV_CTRL_PROVD', COUNT_BIG(*) FROM dbo.DEV_CTRL_PROVD
UNION ALL SELECT 'DEV_EVIDENCIA_PROVD', COUNT_BIG(*) FROM dbo.DEV_EVIDENCIA_PROVD
UNION ALL SELECT 'DEV_ENVIO_PROVD', COUNT_BIG(*) FROM dbo.DEV_ENVIO_PROVD
UNION ALL SELECT 'DEV_ENVIO_DOC', COUNT_BIG(*) FROM dbo.DEV_ENVIO_DOC;

SELECT CMOV, TXTM, MODULO, RELACION, TIPO, BLOQ
FROM dbo.DAT_CMOV
WHERE CMOV IN (101, 102)
ORDER BY CMOV;
