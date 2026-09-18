/*
  Rollback puntual: vuelve a habilitar trigger respaldado.
  Usar solo si se decide restaurar expresamente reserva global anterior.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> 'IOELOCAL'
  THROW 59390, 'Base no autorizada. Este rollback solo puede ejecutarse en IOELOCAL.', 1;

IF OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva', 'TR') IS NULL
  THROW 59391, 'No existe trigger para habilitar. Use respaldo de definicion.', 1;

DECLARE @SHA256 varchar(64) = CONVERT(
  varchar(64),
  HASHBYTES(
    'SHA2_256',
    CONVERT(varbinary(max), OBJECT_DEFINITION(OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva')))
  ),
  2
);

IF @SHA256 <> 'B9D075C96B547875EE5AFCC026EA24812AA8A56D48EBACFDB205412A00C10A2D'
  THROW 59392, 'La definicion del trigger no coincide con respaldo. Rollback cancelado.', 1;

ENABLE TRIGGER dbo.trg_dat_art_dev_provd_reserva ON dbo.DAT_ART;

IF OBJECTPROPERTYEX(
     OBJECT_ID('dbo.trg_dat_art_dev_provd_reserva'),
     'ExecIsTriggerDisabled'
   ) <> 0
  THROW 59393, 'No fue posible habilitar el trigger.', 1;

SELECT
  DB_NAME() AS BASE_DATOS,
  'dbo.trg_dat_art_dev_provd_reserva' AS TRIGGER_NAME,
  0 AS DESHABILITADO,
  SYSDATETIME() AS FECHA_VERIFICACION;

