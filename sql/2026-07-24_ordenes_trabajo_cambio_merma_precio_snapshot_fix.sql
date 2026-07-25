/*
  Cambio material / merma:
  - Separa PVTA unitario de PVTAT total.
  - Persiste base económica propia por cada ORD derivada.
  - Recupera históricos derivados desde captura padre.
  - Permite que API selle diferencia fiscal calculada con DAT_SUC/folio.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.PV_ORD_CAMBIO_MERMA_PRECIO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PV_ORD_CAMBIO_MERMA_PRECIO
  (
    IORD NVARCHAR(255) NOT NULL,
    IORD_ORIGEN NVARCHAR(255) NULL,
    IDFOL NVARCHAR(255) NULL,
    SUC VARCHAR(10) NULL,
    ART NVARCHAR(255) NULL,
    CTD FLOAT NOT NULL,
    PVTA_UNITARIO DECIMAL(18, 4) NOT NULL,
    PVTAT_BASE DECIMAL(18, 4) NOT NULL,
    ORIGEN_PRECIO NVARCHAR(40) NOT NULL,
    TIPO_TRAN NVARCHAR(10) NULL,
    IVA_INTEGRADO INT NULL,
    REQF INT NULL,
    USER_ALT NVARCHAR(255) NULL,
    FCN_ALT DATETIME NOT NULL
      CONSTRAINT DF_PV_ORD_CYM_PRECIO_FCN_ALT DEFAULT (GETDATE()),
    USER_MOD NVARCHAR(255) NULL,
    FCN_MOD DATETIME NULL,
    CONSTRAINT PK_PV_ORD_CAMBIO_MERMA_PRECIO PRIMARY KEY (IORD)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.PV_ORD_CAMBIO_MERMA_PRECIO')
    AND name = 'IX_PV_ORD_CYM_PRECIO_ORIGEN'
)
BEGIN
  CREATE INDEX IX_PV_ORD_CYM_PRECIO_ORIGEN
    ON dbo.PV_ORD_CAMBIO_MERMA_PRECIO (IORD_ORIGEN, IDFOL);
END;

;WITH CapturaPadre AS
(
  SELECT
    n.IORD,
    t.IORD AS IORD_ORIGEN,
    n.IDFOL,
    n.SUC,
    n.ART,
    TRY_CONVERT(FLOAT, n.CTD) AS CTD,
    TRY_CONVERT(DECIMAL(18, 4), t.PVTA_NUEVO) AS PVTA_UNITARIO,
    TRY_CONVERT(INT, s.IVA_INTEGRADO) AS IVA_INTEGRADO,
    TRY_CONVERT(INT, f.REQF) AS REQF,
    CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(f.AUT, ''))))
        IN ('DCA', 'CA', 'DC', 'DG', 'CP', 'PS')
        THEN 'CA'
      ELSE 'VF'
    END AS TIPO_TRAN,
    ROW_NUMBER() OVER (
      PARTITION BY n.IORD
      ORDER BY ISNULL(t.FCN_MOD, t.FCN_ALT) DESC
    ) AS RN
  FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
  INNER JOIN dbo.PV_CTR_ORDS n
    ON n.IORD = t.NVA_IORD
  LEFT JOIN dbo.DAT_SUC s
    ON s.SUC = n.SUC
  OUTER APPLY
  (
    SELECT TOP 1 ff.AUT, ff.REQF
    FROM dbo.PV_CTR_FOL_ASVR ff
    WHERE ff.IDFOL = n.IDFOL
    ORDER BY ISNULL(ff.FCNM, ff.FCN) DESC
  ) f
  WHERE TRY_CONVERT(DECIMAL(18, 4), t.PVTA_NUEVO) IS NOT NULL
)
INSERT INTO dbo.PV_ORD_CAMBIO_MERMA_PRECIO
(
  IORD, IORD_ORIGEN, IDFOL, SUC, ART, CTD,
  PVTA_UNITARIO, PVTAT_BASE, ORIGEN_PRECIO,
  TIPO_TRAN, IVA_INTEGRADO, REQF,
  USER_ALT, FCN_ALT, USER_MOD, FCN_MOD
)
SELECT
  d.IORD,
  d.IORD_ORIGEN,
  d.IDFOL,
  d.SUC,
  d.ART,
  d.CTD,
  d.PVTA_UNITARIO,
  ROUND(d.PVTA_UNITARIO * d.CTD, 4),
  'CAPTURA_PADRE',
  d.TIPO_TRAN,
  d.IVA_INTEGRADO,
  d.REQF,
  'MIGRACION',
  GETDATE(),
  'MIGRACION',
  GETDATE()
FROM CapturaPadre d
WHERE d.RN = 1
  AND d.CTD > 0
  AND NOT EXISTS
  (
    SELECT 1
    FROM dbo.PV_ORD_CAMBIO_MERMA_PRECIO p
    WHERE p.IORD = d.IORD
  );

UPDATE t
SET
  t.PVTA_NUEVO = art.PVTA,
  t.USER_MOD = 'MIGRACION',
  t.FCN_MOD = GETDATE()
FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
INNER JOIN dbo.PV_CTR_ORDS o
  ON o.IORD = t.IORD
OUTER APPLY
(
  SELECT TOP 1 TRY_CONVERT(FLOAT, a.PVTA) AS PVTA
  FROM dbo.DAT_ART a
  WHERE a.SUC = o.SUC
    AND a.ART = ISNULL(t.ART_NUEVO, o.ART)
  ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC
) art
WHERE NOT EXISTS
(
  SELECT 1
  FROM dbo.PV_CTR_ORDS n
  WHERE n.IORD = t.NVA_IORD
)
  AND art.PVTA IS NOT NULL
  AND (
    TRY_CONVERT(FLOAT, t.PVTA_NUEVO) IS NULL
    OR ABS(TRY_CONVERT(FLOAT, t.PVTA_NUEVO) - art.PVTA) > 0.0001
  );

DECLARE @proc SYSNAME;
DECLARE @definition NVARCHAR(MAX);

DECLARE proc_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT name
FROM sys.procedures
WHERE name IN (
  'sp_ordenes_trabajo_cambio_material',
  'sp_ordenes_trabajo_merma'
);

OPEN proc_cursor;
FETCH NEXT FROM proc_cursor INTO @proc;

WHILE @@FETCH_STATUS = 0
BEGIN
  SET @definition = OBJECT_DEFINITION(OBJECT_ID(N'dbo.' + @proc));

  IF @definition IS NULL
    THROW 50001, 'No se pudo leer SP de cambio/merma.', 1;

  IF @definition NOT LIKE '%@DIFERENCIA_SELLADA%'
  BEGIN
    SET @definition = REPLACE(
      @definition,
      '@IORD_NUEVA NVARCHAR(255) = NULL,',
      '@IORD_NUEVA NVARCHAR(255) = NULL,' + CHAR(13) + CHAR(10) +
      '  @DIFERENCIA_SELLADA FLOAT = NULL,'
    );
  END;

  IF @definition LIKE '%SET @diffVenta = ROUND(@totalNuevo - @totalOrig, 2);%'
  BEGIN
    SET @definition = REPLACE(
      @definition,
      'SET @diffVenta = ROUND(@totalNuevo - @totalOrig, 2);',
      'SET @diffVenta = COALESCE(@DIFERENCIA_SELLADA, ROUND(@totalNuevo - @totalOrig, 2));'
    );
  END;

  SET @definition = REPLACE(
    @definition,
    'CREATE PROCEDURE',
    'ALTER PROCEDURE'
  );

  EXEC sys.sp_executesql @definition;

  FETCH NEXT FROM proc_cursor INTO @proc;
END;

CLOSE proc_cursor;
DEALLOCATE proc_cursor;

IF (
  SELECT COUNT(*)
  FROM sys.procedures
  WHERE name IN (
    'sp_ordenes_trabajo_cambio_material',
    'sp_ordenes_trabajo_merma'
  )
) <> 2
  THROW 50002, 'No existen ambos SPs de cambio/merma.', 1;

IF EXISTS
(
  SELECT 1
  FROM sys.procedures p
  WHERE p.name IN (
    'sp_ordenes_trabajo_cambio_material',
    'sp_ordenes_trabajo_merma'
  )
    AND OBJECT_DEFINITION(p.object_id) NOT LIKE '%@DIFERENCIA_SELLADA%'
)
  THROW 50003, 'No se agregó @DIFERENCIA_SELLADA a todos los SPs.', 1;

IF EXISTS
(
  SELECT 1
  FROM sys.procedures p
  WHERE p.name IN (
    'sp_ordenes_trabajo_cambio_material',
    'sp_ordenes_trabajo_merma'
  )
    AND OBJECT_DEFINITION(p.object_id)
      NOT LIKE '%COALESCE(@DIFERENCIA_SELLADA%'
)
  THROW 50004, 'Los SPs no usan la diferencia sellada.', 1;

SELECT
  COUNT(*) AS SNAPSHOTS_CREADOS
FROM dbo.PV_ORD_CAMBIO_MERMA_PRECIO;
