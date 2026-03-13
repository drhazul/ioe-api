/*
  Soporte de rendimiento para consulta de artículos visibles por sucursal
  en detalle de cotización:

  SELECT DAT_ART.*, DAT_ART.BLOQ
  FROM dbo.DAT_ART
  WHERE DAT_ART.SUC = @SUC
    AND (DAT_ART.BLOQ IS NULL OR DAT_ART.BLOQ <> -1);
*/

IF OBJECT_ID('dbo.DAT_ART', 'U') IS NULL
BEGIN
  RAISERROR('No existe dbo.DAT_ART.', 16, 1);
  RETURN;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.DAT_ART')
    AND name = 'IX_DAT_ART_SUC_BLOQ_DETALLE_COT'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_DAT_ART_SUC_BLOQ_DETALLE_COT
  ON dbo.DAT_ART (SUC, BLOQ)
  INCLUDE (
    ART,
    UPC,
    DES,
    STOCK,
    PVTA,
    TIPO,
    STOCK_MIN,
    CTOP,
    ESTATUS,
    DEPA,
    SUBD,
    CLAS,
    SCLA,
    SCLA2,
    SPH,
    CYL,
    ADIC
  );
END;
