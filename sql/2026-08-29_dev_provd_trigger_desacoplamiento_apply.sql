/*
  Desacoplamiento reversible del trigger global de reserva DEV_PROVD.

  Alcance autorizado:
    - Base local IOELOCAL.
    - No elimina trigger.
    - No modifica SP, tablas ni datos.
    - No cambia otros modulos.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> 'IOELOCAL'
  THROW 59380, 'Base no autorizada. Este script solo puede ejecutarse en IOELOCAL.', 1;

IF OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva', 'TR') IS NULL
  THROW 59381, 'No existe dbo.trg_dat_art_dev_provd_reserva.', 1;

DECLARE @SHA256 varchar(64) = CONVERT(
  varchar(64),
  HASHBYTES(
    'SHA2_256',
    CONVERT(varbinary(max), OBJECT_DEFINITION(OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva')))
  ),
  2
);

IF @SHA256 <> 'B9D075C96B547875EE5AFCC026EA24812AA8A56D48EBACFDB205412A00C10A2D'
  THROW 59382, 'La definicion del trigger cambio despues del preflight. No se aplico el desacoplamiento.', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECTPROPERTYEX(
       OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva'),
       'ExecIsTriggerDisabled'
     ) = 0
    DISABLE TRIGGER dbo.trg_dat_art_dev_provd_reserva ON dbo.DAT_ART;

  IF OBJECTPROPERTYEX(
       OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva'),
       'ExecIsTriggerDisabled'
     ) <> 1
    THROW 59383, 'No fue posible deshabilitar el trigger.', 1;

  COMMIT;
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
  SYSDATETIME() AS FECHA_VERIFICACION;

