/*
  Verificacion del desacoplamiento. No conserva cambios de datos.
  No usa ni prueba flujos de otros modulos.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 5000;

IF DB_NAME() <> 'IOELOCAL'
  THROW 59384, 'Base no autorizada. Esta verificacion solo aplica a IOELOCAL.', 1;

IF OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva', 'TR') IS NULL
  THROW 59385, 'No existe dbo.trg_dat_art_dev_provd_reserva.', 1;

IF OBJECTPROPERTYEX(
     OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva'),
     'ExecIsTriggerDisabled'
   ) <> 1
  THROW 59386, 'El trigger DEV_PROVD continua habilitado.', 1;

IF EXISTS (
  SELECT 1
  FROM sys.triggers tr
  JOIN sys.sql_modules sm ON sm.object_id = tr.object_id
  WHERE tr.parent_id = OBJECT_ID('dbo.DAT_ART')
    AND tr.is_disabled = 0
    AND (
      sm.definition LIKE '%DEV_CTRL_PROVD%'
      OR sm.definition LIKE '%DEV_DOC_PROVD%'
      OR sm.definition LIKE '%inventario reservado para devolucion a proveedor%'
    )
)
  THROW 59387, 'Existe otro trigger habilitado sobre DAT_ART acoplado a DEV_PROVD.', 1;

DECLARE @SUC nvarchar(255), @ART nvarchar(255);

SELECT TOP (1)
  @SUC = CONVERT(nvarchar(255), SUC),
  @ART = CONVERT(nvarchar(255), ART)
FROM dbo.DAT_ART
WHERE STOCK IS NOT NULL
ORDER BY SUC, ART;

IF @SUC IS NULL OR @ART IS NULL
  THROW 59388, 'No existe un articulo utilizable para prueba transaccional.', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  UPDATE dbo.DAT_ART
  SET STOCK = STOCK
  WHERE SUC = @SUC
    AND ART = @ART;

  IF @@ROWCOUNT <> 1
    THROW 59389, 'La prueba transaccional no actualizo exactamente un articulo.', 1;

  ROLLBACK;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;

SELECT
  DB_NAME() AS BASE_DATOS,
  'dbo.trg_dat_art_dev_provd_reserva' AS TRIGGER_NAME,
  OBJECTPROPERTYEX(
    OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva'),
    'ExecIsTriggerDisabled'
  ) AS DESHABILITADO,
  @SUC AS SUC_PRUEBA,
  @ART AS ART_PRUEBA,
  'OK: UPDATE transaccional revertido; ningun dato persistido' AS RESULTADO,
  SYSDATETIME() AS FECHA_VERIFICACION;

