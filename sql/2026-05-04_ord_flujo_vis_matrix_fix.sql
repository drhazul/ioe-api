SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRAN;

  ;WITH seed_base AS (
    SELECT * FROM (VALUES
      -- Operativo: ADMIN / JEF_TALLER
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 2),   CONVERT(BIT, 0),  20),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 3),   CONVERT(BIT, 0),  30),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 3.1), CONVERT(BIT, 0),  31),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 5),   CONVERT(BIT, 0),  50),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 6),   CONVERT(BIT, 0),  60),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 7),   CONVERT(BIT, 0),  70),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 8),   CONVERT(BIT, 0),  80),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 9),   CONVERT(BIT, 0),  90),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 10),  CONVERT(BIT, 0), 100),
      ('DAT_JAO_ORD', 'operativo', 'ADMIN',        CONVERT(FLOAT, 12),  CONVERT(BIT, 0), 120),

      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 2),   CONVERT(BIT, 0),  20),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 3),   CONVERT(BIT, 0),  30),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 3.1), CONVERT(BIT, 0),  31),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 5),   CONVERT(BIT, 0),  50),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 6),   CONVERT(BIT, 0),  60),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 7),   CONVERT(BIT, 0),  70),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 8),   CONVERT(BIT, 0),  80),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 9),   CONVERT(BIT, 0),  90),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 10),  CONVERT(BIT, 0), 100),
      ('DAT_JAO_ORD', 'operativo', 'JEF_TALLER',   CONVERT(FLOAT, 12),  CONVERT(BIT, 0), 120),

      -- Operativo: ANALISTA_ORD (9 solo externo)
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 2),   CONVERT(BIT, 0),  20),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 3),   CONVERT(BIT, 0),  30),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 3.1), CONVERT(BIT, 0),  31),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 5),   CONVERT(BIT, 0),  50),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 6),   CONVERT(BIT, 0),  60),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 7),   CONVERT(BIT, 0),  70),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 8),   CONVERT(BIT, 0),  80),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 9),   CONVERT(BIT, 1),  90),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 10),  CONVERT(BIT, 0), 100),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_ORD', CONVERT(FLOAT, 12),  CONVERT(BIT, 0), 120),

      -- Operativo: ENCARGADOS
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 5),   CONVERT(BIT, 0),  50),
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 7),   CONVERT(BIT, 0),  70),
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 8),   CONVERT(BIT, 0),  80),
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 9),   CONVERT(BIT, 0),  90),
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'ENC_MAQUILA',  CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),

      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 5),   CONVERT(BIT, 0),  50),
      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 7),   CONVERT(BIT, 0),  70),
      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 8),   CONVERT(BIT, 0),  80),
      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 9),   CONVERT(BIT, 0),  90),
      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'ENC_BISEL',    CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),

      -- Operativo: Inventarios
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_INV', CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_INV', CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'ANALISTA_INV', CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),
      ('DAT_JAO_ORD', 'operativo', 'INVJEF',       CONVERT(FLOAT, 9.1), CONVERT(BIT, 0),  91),
      ('DAT_JAO_ORD', 'operativo', 'INVJEF',       CONVERT(FLOAT, 9.2), CONVERT(BIT, 0),  92),
      ('DAT_JAO_ORD', 'operativo', 'INVJEF',       CONVERT(FLOAT, 9.3), CONVERT(BIT, 0),  93),

      -- Paneles de consulta legacy
      ('DAT_JAO_ORD', 'anulados',   'ADMIN',       CONVERT(FLOAT, 4),   CONVERT(BIT, 0),  40),
      ('DAT_JAO_ORD', 'anulados',   'JEF_TALLER',  CONVERT(FLOAT, 4),   CONVERT(BIT, 0),  40),
      ('DAT_JAO_ORD', 'entregadas', 'ADMIN',       CONVERT(FLOAT, 11),  CONVERT(BIT, 0), 110),
      ('DAT_JAO_ORD', 'entregadas', 'JEF_TALLER',  CONVERT(FLOAT, 11),  CONVERT(BIT, 0), 110)
    ) s(MODULO, PANEL_MODE, ROLE_CODE, ESTA, SOLO_EXTERNO, ORDEN)
  ),
  seed_estado AS (
    SELECT
      CONVERT(NVARCHAR(50), 'DAT_JAO_ORD') AS MODULO,
      CONVERT(NVARCHAR(20), 'estado') AS PANEL_MODE,
      role_code.ROLE_CODE,
      TRY_CONVERT(FLOAT, e.ESTA) AS ESTA,
      CONVERT(BIT, 0) AS SOLO_EXTERNO,
      TRY_CONVERT(INT, ROUND(TRY_CONVERT(FLOAT, e.ESTA) * 10, 0)) + 1000 AS ORDEN
    FROM dbo.DAT_EST_ORD e
    CROSS APPLY (VALUES ('ADMIN'), ('JEF_TALLER'), ('ANALISTA_ORD')) role_code(ROLE_CODE)
    WHERE TRY_CONVERT(FLOAT, e.ESTA) IS NOT NULL
  ),
  seed AS (
    SELECT * FROM seed_base
    UNION ALL
    SELECT * FROM seed_estado
  )
  MERGE dbo.DAT_JAO_ORD_FLUJO_VIS AS tgt
  USING seed AS src
    ON UPPER(LTRIM(RTRIM(ISNULL(tgt.MODULO, '')))) = UPPER(src.MODULO)
   AND UPPER(LTRIM(RTRIM(ISNULL(tgt.PANEL_MODE, '')))) = UPPER(src.PANEL_MODE)
   AND UPPER(LTRIM(RTRIM(ISNULL(tgt.ROLE_CODE, '')))) = UPPER(src.ROLE_CODE)
   AND ROUND(CONVERT(DECIMAL(10,3), TRY_CONVERT(FLOAT, tgt.ESTA)), 3) =
       ROUND(CONVERT(DECIMAL(10,3), TRY_CONVERT(FLOAT, src.ESTA)), 3)
  WHEN MATCHED THEN
    UPDATE SET
      tgt.SOLO_EXTERNO = src.SOLO_EXTERNO,
      tgt.ACTIVO = 1,
      tgt.ORDEN = src.ORDEN,
      tgt.FCMOD = GETDATE()
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (MODULO, PANEL_MODE, ROLE_CODE, ESTA, SOLO_EXTERNO, ACTIVO, ORDEN, FCREG)
    VALUES (src.MODULO, src.PANEL_MODE, src.ROLE_CODE, src.ESTA, src.SOLO_EXTERNO, 1, src.ORDEN, GETDATE())
  WHEN NOT MATCHED BY SOURCE
    AND UPPER(LTRIM(RTRIM(ISNULL(tgt.MODULO, '')))) = 'DAT_JAO_ORD'
    AND LOWER(LTRIM(RTRIM(ISNULL(tgt.PANEL_MODE, '')))) IN ('operativo', 'estado', 'anulados', 'entregadas')
  THEN
    UPDATE SET
      tgt.ACTIVO = 0,
      tgt.FCMOD = GETDATE();

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRAN;
  THROW;
END CATCH;
