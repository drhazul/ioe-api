/*
  2026-04-01_facturacion_validar_idfols.sql

  Objetivo:
  - Validar un listado de IDFOL (p. ej. cargado desde Excel) contra FAC_SVR_SHAP.
  - Regresar el estatus y la sucursal; marcar como OK solo cuando ESTATUS='PENDIENTE'.
  - Permite aplicar un filtro opcional por sucursal (no-admin).
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NULL
  THROW 50001, 'No existe dbo.FAC_SVR_SHAP', 1;
IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IDFOL') IS NULL
  THROW 50002, 'dbo.FAC_SVR_SHAP no contiene IDFOL', 1;
IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'ESTATUS') IS NULL
  THROW 50003, 'dbo.FAC_SVR_SHAP no contiene ESTATUS', 1;
IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'SUC') IS NULL
  THROW 50004, 'dbo.FAC_SVR_SHAP no contiene SUC', 1;

GO

CREATE OR ALTER PROCEDURE dbo.sp_fact_validar_idfols
  @IDFOLS_JSON NVARCHAR(MAX),
  @SUC NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @IdFols TABLE (
    ORD INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    IDFOL NVARCHAR(255) NOT NULL
  );

  INSERT INTO @IdFols (IDFOL)
  SELECT DISTINCT UPPER(LTRIM(RTRIM([value])))
  FROM OPENJSON(@IDFOLS_JSON)
  WHERE TRY_CONVERT(NVARCHAR(255), [value]) IS NOT NULL
    AND LTRIM(RTRIM(CONVERT(NVARCHAR(255), [value]))) <> '';

  SELECT
    i.IDFOL,
    ISNULL(f.SUC, '') AS SUC,
    ISNULL(f.ESTATUS, '') AS ESTATUS,
    CASE
      WHEN f.IDFOL IS NULL THEN 'NO_ENCONTRADO'
      WHEN @SUC IS NOT NULL AND @SUC <> '' AND @SUC <> '000'
           AND UPPER(LTRIM(RTRIM(ISNULL(f.SUC, '')))) <> UPPER(LTRIM(RTRIM(@SUC)))
        THEN 'SUC_NO_AUTORIZADA'
      WHEN UPPER(LTRIM(RTRIM(ISNULL(f.ESTATUS, '')))) <> 'PENDIENTE'
        THEN 'ESTATUS_NO_PENDIENTE'
      ELSE 'OK'
    END AS RESULT
  FROM @IdFols i
  LEFT JOIN dbo.FAC_SVR_SHAP f
    ON UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) = i.IDFOL
  ORDER BY i.ORD;
END;

GO

/*
-- Ejemplo rápido:
DECLARE @json NVARCHAR(MAX) = '["DF01-20260401-VF-0001","DF01-20260401-VF-0002"]';
EXEC dbo.sp_fact_validar_idfols @IDFOLS_JSON=@json, @SUC='G01';
*/
