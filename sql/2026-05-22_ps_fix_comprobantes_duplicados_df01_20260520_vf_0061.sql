/*
  Fix incidente PS: comprobantes duplicados por IMPD mal persistido.
  Caso reportado: DF01-20260520-VF-0061.

  Objetivo:
  1) Recalcular IMPD por forma como (IMPP - IMPC) en tablas de formas.
  2) Re-sincronizar resumen de entrega OPV del día para reflejar importes corregidos.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @folioRef NVARCHAR(255) = N'DF01-20260520-VF-0061';
DECLARE @idfolActual NVARCHAR(255) = NULL;
DECLARE @idfolInicial NVARCHAR(255) = NULL;
DECLARE @suc NVARCHAR(20) = NULL;
DECLARE @opv NVARCHAR(255) = NULL;
DECLARE @fcn DATE = NULL;

SELECT TOP 1
  @idfolActual = LTRIM(RTRIM(ISNULL(a.IDFOL, ''))),
  @idfolInicial = ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(a.IDFOLINICIAL, ''))), ''), LTRIM(RTRIM(ISNULL(a.IDFOL, '')))),
  @suc = LTRIM(RTRIM(ISNULL(a.SUC, ''))),
  @opv = UPPER(LTRIM(RTRIM(ISNULL(CASE
    WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
    ELSE a.OPV
  END, '')))),
  @fcn = CONVERT(DATE, a.FCNM)
FROM dbo.PV_CTR_FOL_ASVR a
WHERE a.IDFOL = @folioRef
   OR a.IDFOLINICIAL = @folioRef
ORDER BY CASE WHEN a.IDFOL = @folioRef THEN 0 ELSE 1 END, a.FCNM DESC, a.FCN DESC;

IF ISNULL(@idfolActual, '') = ''
BEGIN
  THROW 58201, 'No se encontró folio PS para el caso reportado (DF01-20260520-VF-0061).', 1;
END;

BEGIN TRANSACTION;

BEGIN TRY
  IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
  BEGIN
    UPDATE f
    SET f.IMPD = ROUND(
      ISNULL(TRY_CONVERT(DECIMAL(18,4), f.IMPP), 0)
      - ISNULL(TRY_CONVERT(DECIMAL(18,4), f.IMPC), 0),
      4
    )
    FROM dbo.PV_CTR_FOL_FORM f
    WHERE f.IDFOL IN (@idfolActual, @idfolInicial);
  END;

  IF OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR', 'U') IS NOT NULL
  BEGIN
    UPDATE f
    SET f.IMPD = ROUND(
      ISNULL(TRY_CONVERT(DECIMAL(18,4), f.IMPP), 0)
      - ISNULL(TRY_CONVERT(DECIMAL(18,4), f.IMPC), 0),
      4
    )
    FROM dbo.PV_CTR_FOL_FORM_SVR f
    WHERE f.IDFOL IN (@idfolActual, @idfolInicial);
  END;

  IF ISNULL(@suc, '') <> '' AND ISNULL(@opv, '') <> '' AND @fcn IS NOT NULL
     AND OBJECT_ID('dbo.sp_cg_sync_entrega_opv_abierta', 'P') IS NOT NULL
  BEGIN
    EXEC dbo.sp_cg_sync_entrega_opv_abierta
      @SUC = @suc,
      @FCN = @fcn,
      @OPV = @opv,
      @TIPO_CORTE = 'GLOBAL';
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;

/* Evidencia rápida */
SELECT
  a.IDFOL,
  a.IDFOLINICIAL,
  a.SUC,
  a.OPV,
  a.OPVM,
  a.ESTA,
  a.AUT,
  a.ORIGEN_AUT
FROM dbo.PV_CTR_FOL_ASVR a
WHERE a.IDFOL IN (@idfolActual, @idfolInicial)
   OR a.IDFOLINICIAL IN (@idfolActual, @idfolInicial);

IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
BEGIN
  SELECT
    'PV_CTR_FOL_FORM' AS TABLA,
    f.IDFOL,
    f.FORM,
    f.IMPP,
    f.IMPC,
    f.IMPD,
    f.AUT
  FROM dbo.PV_CTR_FOL_FORM f
  WHERE f.IDFOL IN (@idfolActual, @idfolInicial)
  ORDER BY f.IDFOL, f.FCN, f.IDF;
END;

IF OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR', 'U') IS NOT NULL
BEGIN
  SELECT
    'PV_CTR_FOL_FORM_SVR' AS TABLA,
    f.IDFOL,
    f.FORM,
    f.IMPP,
    f.IMPC,
    f.IMPD,
    f.AUT
  FROM dbo.PV_CTR_FOL_FORM_SVR f
  WHERE f.IDFOL IN (@idfolActual, @idfolInicial)
  ORDER BY f.IDFOL, f.FCN, f.IDF;
END;
