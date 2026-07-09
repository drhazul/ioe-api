/*
  2026-05-23_pv_promociones_linea_indexes.sql
  Objetivo:
    - Optimizar búsqueda de promociones por renglón (cotizaciones).
    - Reducir costo de lookup base de artículo para cálculo de PVTA/PVTAT.
  Alcance:
    - Solo índices no destructivos.
*/
SET NOCOUNT ON;

BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID('dbo.PROMO_REGLA_CRITERIO', 'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE object_id = OBJECT_ID('dbo.PROMO_REGLA_CRITERIO')
         AND name = 'IX_PROMO_REGLA_CRITERIO_MATCH_LINE'
     )
  BEGIN
    CREATE NONCLUSTERED INDEX IX_PROMO_REGLA_CRITERIO_MATCH_LINE
      ON dbo.PROMO_REGLA_CRITERIO (
        ID_PROM,
        EST,
        SUC,
        CLIENTE,
        DEPA,
        SUBD,
        CLAS,
        SCLA,
        SCLA2,
        GUIA,
        ART,
        UPC
      );
  END;

  IF OBJECT_ID('dbo.PROMO_CAB', 'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE object_id = OBJECT_ID('dbo.PROMO_CAB')
         AND name = 'IX_PROMO_CAB_EVAL_LINE'
     )
  BEGIN
    CREATE NONCLUSTERED INDEX IX_PROMO_CAB_EVAL_LINE
      ON dbo.PROMO_CAB (EST, PRIORIDAD, FCN_INI, FCN_TER, ID_PROM)
      INCLUDE (SUC, ACUMULABLE);
  END;

  IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE object_id = OBJECT_ID('dbo.DAT_ART')
         AND name = 'IX_DAT_ART_SUC_ART_PROMO_LOOKUP'
     )
  BEGIN
    CREATE NONCLUSTERED INDEX IX_DAT_ART_SUC_ART_PROMO_LOOKUP
      ON dbo.DAT_ART (SUC, ART)
      INCLUDE (UPC, PVTA, DEPA, SUBD, CLAS, SCLA, SCLA2);
  END;

  IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE object_id = OBJECT_ID('dbo.DAT_ART')
         AND name = 'IX_DAT_ART_SUC_UPC_PROMO_LOOKUP'
     )
  BEGIN
    CREATE NONCLUSTERED INDEX IX_DAT_ART_SUC_UPC_PROMO_LOOKUP
      ON dbo.DAT_ART (SUC, UPC)
      INCLUDE (ART, PVTA, DEPA, SUBD, CLAS, SCLA, SCLA2);
  END;

  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;
END CATCH;
GO
