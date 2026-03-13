/*
  Fix formatos de facturación para Facturify:
  - Agrega FAC_SVR_SHAP.Exportacion con default '01'
  - Normaliza FormaPago (01, 02, ...)
  - Normaliza RegimenFiscalReceptor entero en FACT_CLIENT_SHP
  - Recompila sp_fact_sync_folio_vf para insertar/actualizar formato correcto
*/

IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'Exportacion') IS NULL
BEGIN
  ALTER TABLE dbo.FAC_SVR_SHAP ADD Exportacion NVARCHAR(5) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.FAC_SVR_SHAP') AND c.name = 'Exportacion'
)
BEGIN
  ALTER TABLE dbo.FAC_SVR_SHAP ADD CONSTRAINT DF_FAC_SVR_SHAP_Exportacion DEFAULT ('01') FOR Exportacion;
END
GO

UPDATE dbo.FAC_SVR_SHAP
SET Exportacion = ISNULL(NULLIF(LTRIM(RTRIM(Exportacion)), ''), '01')
WHERE ISNULL(NULLIF(LTRIM(RTRIM(Exportacion)), ''), '') = '';
GO

UPDATE dbo.FAC_SVR_SHAP
SET FormaPago = RIGHT('00' + CONVERT(VARCHAR(10), TRY_CONVERT(INT, FormaPago)), 2)
WHERE TRY_CONVERT(INT, FormaPago) IS NOT NULL
  AND LEN(LTRIM(RTRIM(FormaPago))) < 2;
GO

IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FormaPagoSAT') IS NULL
BEGIN
  ALTER TABLE dbo.FAC_SVR_SHAP ADD FormaPagoSAT NVARCHAR(2) NULL;
END
GO

UPDATE dbo.FAC_SVR_SHAP
SET FormaPagoSAT = RIGHT('00' + CONVERT(VARCHAR(10), TRY_CONVERT(INT, FormaPago)), 2)
WHERE TRY_CONVERT(INT, FormaPago) IS NOT NULL;
GO

IF COL_LENGTH('dbo.FACT_CLIENT_SHP', 'RegimenFiscalReceptorSAT') IS NULL
BEGIN
  ALTER TABLE dbo.FACT_CLIENT_SHP ADD RegimenFiscalReceptorSAT NVARCHAR(4) NULL;
END
GO

UPDATE dbo.FACT_CLIENT_SHP
SET RegimenFiscalReceptorSAT = RIGHT('0000' + CONVERT(VARCHAR(10), TRY_CONVERT(INT, REGIMENFISCALRECEPTOR)), 3)
WHERE TRY_CONVERT(INT, REGIMENFISCALRECEPTOR) IS NOT NULL;
GO
