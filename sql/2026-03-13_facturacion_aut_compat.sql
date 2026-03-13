/*
  Compatibilidad FAC_SVR_SHAP.AUT para módulo facturación.
  Contexto: algunos esquemas legacy solo tienen TIPOVTA y no AUT,
  lo que provoca errores "Invalid column name 'AUT'" en consultas antiguas.
*/

IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NULL
BEGIN
  RAISERROR('No existe tabla dbo.FAC_SVR_SHAP', 16, 1);
  RETURN;
END
GO

IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'AUT') IS NULL
BEGIN
  ALTER TABLE dbo.FAC_SVR_SHAP
    ADD AUT NVARCHAR(20) NULL;
END
GO

IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'TIPOVTA') IS NOT NULL
BEGIN
  UPDATE f
  SET AUT = UPPER(LTRIM(RTRIM(ISNULL(f.TIPOVTA, ''))))
  FROM dbo.FAC_SVR_SHAP f
  WHERE NULLIF(LTRIM(RTRIM(ISNULL(f.AUT, ''))), '') IS NULL
    AND NULLIF(LTRIM(RTRIM(ISNULL(f.TIPOVTA, ''))), '') IS NOT NULL;
END
GO

