/*
  Corrección PS: IMPD se guardó como total del ticket en cada comprobante.
  Caso: DF01-20260723-VF-0022.

  Causa raíz:
  sp_ps_pago_finalize desplegado asignaba @total a IMPD dentro del cursor de
  formas. Con dos cheques, cada fila recibía $2,905.80 en lugar de su importe
  aplicado; Caja General sumaba ambas filas y generaba una diferencia falsa.

  Este script:
  1) actualiza la SP desplegada para calcular IMPD = IMPP - IMPC por forma;
  2) corrige el folio reportado en tablas de formas disponibles;
  3) reconstruye la entrega OPV del día para DF01/5094.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @definition NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ps_pago_finalize', N'P'));

IF @definition IS NULL
  THROW 58200, 'No existe dbo.sp_ps_pago_finalize para actualizar.', 1;

IF CHARINDEX(N'@pIMPD = @impd', @definition) = 0
BEGIN
  IF CHARINDEX(N'@pIMPD = @total', @definition) = 0
    THROW 58201, 'No se reconoce la asignación de IMPD en dbo.sp_ps_pago_finalize; revisión manual requerida.', 1;

  SET @definition = REPLACE(
    @definition,
    N'DECLARE @impc DECIMAL(18, 4);',
    N'DECLARE @impc DECIMAL(18, 4); DECLARE @impd DECIMAL(18, 4);'
  );
  SET @definition = REPLACE(
    @definition,
    N'SET @execIdf = CONVERT(NVARCHAR(255), NEWID());',
    N'SET @impd = ROUND(@formaImpp - @impc, 4); SET @execIdf = CONVERT(NVARCHAR(255), NEWID());'
  );
  SET @definition = REPLACE(
    @definition,
    N'@pIMPD = @total',
    N'@pIMPD = @impd'
  );
  SET @definition = REPLACE(
    @definition,
    N'CREATE PROCEDURE',
    N'ALTER PROCEDURE'
  );
  SET @definition = REPLACE(
    @definition,
    N'CREATE   PROCEDURE',
    N'ALTER PROCEDURE'
  );

  EXEC sys.sp_executesql @definition;
END;
GO

DECLARE @folioRef NVARCHAR(255) = N'DF01-20260723-VF-0022';
DECLARE @idfolActual NVARCHAR(255);
DECLARE @idfolInicial NVARCHAR(255);
DECLARE @suc NVARCHAR(25);
DECLARE @opv NVARCHAR(255);
DECLARE @fcn DATE;

SELECT TOP (1)
  @idfolActual = LTRIM(RTRIM(ISNULL(a.IDFOL, ''))),
  @idfolInicial = ISNULL(
    NULLIF(LTRIM(RTRIM(ISNULL(a.IDFOLINICIAL, ''))), ''),
    LTRIM(RTRIM(ISNULL(a.IDFOL, '')))
  ),
  @suc = LTRIM(RTRIM(ISNULL(a.SUC, ''))),
  @opv = UPPER(LTRIM(RTRIM(ISNULL(
    CASE
      WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
      ELSE a.OPV
    END,
    ''
  )))),
  @fcn = CONVERT(DATE, a.FCNM)
FROM dbo.PV_CTR_FOL_ASVR a
WHERE a.IDFOL = @folioRef
   OR a.IDFOLINICIAL = @folioRef
ORDER BY CASE WHEN a.IDFOL = @folioRef THEN 0 ELSE 1 END, a.FCNM DESC, a.FCN DESC;

IF ISNULL(@idfolActual, '') = ''
  THROW 58202, 'No se encontró el folio PS reportado.', 1;

IF ISNULL(@suc, '') = '' OR ISNULL(@opv, '') = '' OR @fcn IS NULL
  THROW 58203, 'El folio PS no tiene contexto SUC/OPV/FCNM para resincronizar entrega.', 1;

BEGIN TRANSACTION;

BEGIN TRY
  IF OBJECT_ID(N'dbo.PV_CTR_FOL_FORM', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.PV_CTR_FOL_FORM', N'IMPD') IS NOT NULL
  BEGIN
    UPDATE f
    SET IMPD = ROUND(
      ISNULL(TRY_CONVERT(DECIMAL(18, 4), f.IMPP), 0)
      - ISNULL(TRY_CONVERT(DECIMAL(18, 4), f.IMPC), 0),
      4
    )
    FROM dbo.PV_CTR_FOL_FORM f
    WHERE f.IDFOL IN (@idfolActual, @idfolInicial);
  END;

  IF OBJECT_ID(N'dbo.PV_CTR_FOL_FORM_SVR', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.PV_CTR_FOL_FORM_SVR', N'IMPD') IS NOT NULL
  BEGIN
    UPDATE f
    SET IMPD = ROUND(
      ISNULL(TRY_CONVERT(DECIMAL(18, 4), f.IMPP), 0)
      - ISNULL(TRY_CONVERT(DECIMAL(18, 4), f.IMPC), 0),
      4
    )
    FROM dbo.PV_CTR_FOL_FORM_SVR f
    WHERE f.IDFOL IN (@idfolActual, @idfolInicial);
  END;

  IF OBJECT_ID(N'dbo.sp_cg_sync_entrega_opv_abierta', N'P') IS NULL
    THROW 58204, 'No existe dbo.sp_cg_sync_entrega_opv_abierta para resincronizar entrega.', 1;

  EXEC dbo.sp_cg_sync_entrega_opv_abierta
    @SUC = @suc,
    @FCN = @fcn,
    @OPV = @opv,
    @TIPO_CORTE = 'GLOBAL';

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO

SELECT
  a.IDFOL,
  a.IDFOLINICIAL,
  a.SUC,
  a.OPV,
  a.OPVM,
  a.ESTA,
  a.AUT,
  a.ORIGEN_AUT,
  a.IMPT,
  a.IMPP
FROM dbo.PV_CTR_FOL_ASVR a
WHERE a.IDFOL = N'DF01-20260723-VF-0022'
   OR a.IDFOLINICIAL = N'DF01-20260723-VF-0022';

IF OBJECT_ID(N'dbo.PV_CTR_FOL_FORM', N'U') IS NOT NULL
BEGIN
  SELECT
    N'PV_CTR_FOL_FORM' AS TABLA,
    f.IDF,
    f.IDFOL,
    f.FORM,
    f.IMPP,
    f.IMPC,
    f.IMPD,
    f.AUT
  FROM dbo.PV_CTR_FOL_FORM f
  WHERE f.IDFOL = N'DF01-20260723-VF-0022';
END;

EXEC dbo.sp_cg_resumen_formas_pago_opv
  @SUC = N'DF01',
  @FCN = '2026-07-23',
  @OPV = N'5094',
  @TIPO_CORTE = 'GLOBAL';
