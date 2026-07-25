/*
  Reparacion puntual:
  DF01-20260721-CA-0027 debe reflejar venta $620, efectivo recibido $1,000,
  cambio $380. El cierre historico dejo dos formas y reportaba IMPD=$1,000.

  Script idempotente y con validaciones para no modificar otro folio.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @idfol NVARCHAR(255) = N'DF01-20260721-CA-0027';
DECLARE @expectedTotal MONEY = 620;
DECLARE @received MONEY = 1000;
DECLARE @change MONEY = 380;

IF OBJECT_ID(N'dbo.PV_CTR_FOL_ASVR', N'U') IS NULL
  THROW 57201, 'No existe dbo.PV_CTR_FOL_ASVR.', 1;

IF OBJECT_ID(N'dbo.PV_CTR_FOL_FORM', N'U') IS NULL
  THROW 57202, 'No existe dbo.PV_CTR_FOL_FORM.', 1;

IF NOT EXISTS (
  SELECT 1
  FROM dbo.PV_CTR_FOL_ASVR
  WHERE IDFOL = @idfol
    AND TRY_CONVERT(MONEY, IMPT) = @expectedTotal
    AND UPPER(LTRIM(RTRIM(ISNULL(AUT, '')))) = 'CA'
)
  THROW 57203, 'Cabecera del folio no coincide con importe/aut esperados.', 1;

IF (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_FORM WHERE IDFOL = @idfol) = 1
   AND EXISTS (
     SELECT 1
     FROM dbo.PV_CTR_FOL_FORM
     WHERE IDFOL = @idfol
       AND UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) = 'EFECTIVO'
       AND TRY_CONVERT(MONEY, IMPP) = @received
       AND TRY_CONVERT(MONEY, IMPC) = @change
       AND TRY_CONVERT(MONEY, IMPD) = @expectedTotal
   )
BEGIN
  SELECT IDF, IDFOL, FORM, IMPP, IMPC, IMPD
  FROM dbo.PV_CTR_FOL_FORM
  WHERE IDFOL = @idfol;
  RETURN;
END;

DECLARE @keepId NVARCHAR(255);
DECLARE @dropId NVARCHAR(255);

SELECT @keepId = CONVERT(NVARCHAR(255), IDF)
FROM dbo.PV_CTR_FOL_FORM
WHERE IDFOL = @idfol
  AND UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) = 'EFECTIVO'
  AND TRY_CONVERT(MONEY, IMPP) = @received
  AND TRY_CONVERT(MONEY, IMPC) = 0
  AND TRY_CONVERT(MONEY, IMPD) = @received;

SELECT @dropId = CONVERT(NVARCHAR(255), IDF)
FROM dbo.PV_CTR_FOL_FORM
WHERE IDFOL = @idfol
  AND UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) = 'EFECTIVO'
  AND TRY_CONVERT(MONEY, IMPP) = 100
  AND TRY_CONVERT(MONEY, IMPC) = 480
  AND TRY_CONVERT(MONEY, IMPD) = 0;

IF @keepId IS NULL OR @dropId IS NULL
  THROW 57204, 'No se encontraron exactamente las filas historicas esperadas.', 1;

BEGIN TRANSACTION;

UPDATE dbo.PV_CTR_FOL_FORM
SET
  IMPP = @received,
  IMPC = @change,
  IMPD = @expectedTotal
WHERE IDF = @keepId
  AND IDFOL = @idfol;

DELETE FROM dbo.PV_CTR_FOL_FORM
WHERE IDF = @dropId
  AND IDFOL = @idfol;

IF (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_FORM WHERE IDFOL = @idfol) <> 1
  THROW 57205, 'La reparacion no dejo una unica forma para el folio.', 1;

IF EXISTS (
  SELECT 1
  FROM dbo.PV_CTR_FOL_FORM
  WHERE IDFOL = @idfol
    AND (TRY_CONVERT(MONEY, IMPP) <> @received
      OR TRY_CONVERT(MONEY, IMPC) <> @change
      OR TRY_CONVERT(MONEY, IMPD) <> @expectedTotal)
)
  THROW 57206, 'La forma reparada no tiene importes esperados.', 1;

COMMIT TRANSACTION;

SELECT
  IDF,
  IDFOL,
  FORM,
  IMPP,
  IMPC,
  IMPD
FROM dbo.PV_CTR_FOL_FORM
WHERE IDFOL = @idfol;
