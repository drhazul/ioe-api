/*
  CFDI_PAC — quien timbro cada folio.

  Por que: Facturify sigue vivo y sus CFDI solo se pueden cancelar con ellos
  mientras siga contratado. El corte no es una fecha: es folio por folio. Con
  esta columna cada factura sabe a quien preguntarle para cancelar o consultar.

  Valores: 'FACTURIFY' o 'QUADRUM'. NULL = lo de siempre (Facturify), para no
  tocar los 6044 folios ya timbrados.
*/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'CFDI_PAC') IS NULL
BEGIN
  ALTER TABLE dbo.FAC_SVR_SHAP ADD CFDI_PAC NVARCHAR(20) NULL;
END;
GO

-- Para reportes del tipo "cuantos timbro cada PAC".
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.FAC_SVR_SHAP')
    AND name = 'IX_FAC_SVR_SHAP_CFDI_PAC'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_FAC_SVR_SHAP_CFDI_PAC
    ON dbo.FAC_SVR_SHAP (CFDI_PAC)
    INCLUDE (IDFOL, CFDI_UUID, CFDI_STATUS);
END;
GO
