/*
  Corrección puntual del registro de prueba en IOEDESARROLLO.
  La ORD derivada DF01134510003 ya había sido recibida en tienda con la regla
  incorrecta y quedó en 9.2; se reencamina a 10. No altera otras órdenes.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59060, 'Este ajuste puntual solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PV_CTR_ORDS nueva WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.PV_CTR_ORDS origen WITH (UPDLOCK, HOLDLOCK)
      ON origen.IORD = N'DF01134340008'
     AND origen.REEORD = nueva.IORD
     AND origen.ESTSEGU = 4
    WHERE nueva.IORD = N'DF01134510003'
      AND nueva.ESTSEGU = 9.2
      AND nueva.TIPOM = 2
      AND nueva.REEORD = origen.IORD
  )
    THROW 59061, 'La ORD o su relación ya no coincide con el caso de prueba; no se modificó ningún registro', 1;

  UPDATE dbo.PV_CTR_ORDS
  SET ESTSEGU = 10,
      ESTATUS = 2,
      FCNMOD = GETDATE()
  WHERE IORD = N'DF01134510003'
    AND ESTSEGU = 9.2
    AND TIPOM = 2
    AND REEORD = N'DF01134340008';

  IF @@ROWCOUNT <> 1
    THROW 59062, 'No se actualizó exactamente la ORD de prueba esperada', 1;

  INSERT INTO dbo.AUDIT_LOG
    (IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, IP, FCNR)
  VALUES
    (NULL, N'ORD_DERIVADA_REENCAMINAR_FLUJO10', N'ORDENES-TRABAJO', N'PV_CTR_ORDS',
     N'DF01134510003', N'DF01',
     N'{"fromFlow":9.2,"toFlow":10,"reason":"Corrección del flujo incorrecto de recepción en tienda para ORD derivada","parentIord":"DF01134340008"}',
     NULL, SYSUTCDATETIME());

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT IORD, ESTSEGU, ESTATUS, TIPOM, MOTR, REEORD, FCNMOD
FROM dbo.PV_CTR_ORDS
WHERE IORD = N'DF01134510003';

SELECT IORD, ESTSEGU, FCNR, ORIGEN, ID
FROM dbo.PV_CTR_ORDS_FLUJO_HIST
WHERE IORD = N'DF01134510003'
ORDER BY FCNR, ID;
