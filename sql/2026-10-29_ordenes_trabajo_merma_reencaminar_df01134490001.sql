/*
  Reparación puntual de la ORD de prueba que quedó en flujo 10 por la regla
  anterior de ORDs derivadas. Solo corrige este IORD, con sus relaciones
  verificadas, y deja auditoría explícita sin suplantar un usuario operativo.
  Destino: IOEDESARROLLO.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59020, 'Este ajuste puntual solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PV_CTR_ORDS o WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.PV_CTR_ORDS origen WITH (UPDLOCK, HOLDLOCK)
      ON origen.IORD = N'DF01134410037'
    INNER JOIN dbo.PV_ORD_CAMBIO_MERMA_TMP t WITH (UPDLOCK, HOLDLOCK)
      ON t.IORD = origen.IORD
     AND t.NVA_IORD = o.IORD
    WHERE o.IORD = N'DF01134490001'
      AND o.ESTSEGU = 10
      AND o.TIPOM = 2
      AND o.REEORD = origen.IORD
      AND origen.ESTSEGU = 4
  )
    THROW 59021, 'La ORD o sus relaciones ya no coinciden con el caso verificado; no se modificó ningún registro', 1;

  UPDATE dbo.PV_CTR_ORDS
  SET ESTSEGU = 9.2,
      ESTATUS = 2,
      FCNMOD = GETDATE()
  WHERE IORD = N'DF01134490001'
    AND ESTSEGU = 10
    AND TIPOM = 2
    AND REEORD = N'DF01134410037';

  IF @@ROWCOUNT <> 1
    THROW 59022, 'No se actualizó exactamente la ORD esperada', 1;

  INSERT INTO dbo.AUDIT_LOG
    (IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, IP, FCNR)
  VALUES
    (NULL, N'ORD_MERMA_REENCAMINAR_CICLO', N'ORDENES-TRABAJO', N'PV_CTR_ORDS',
     N'DF01134490001', N'DF01',
     N'{"fromFlow":10,"toFlow":9.2,"reason":"Corrección de flujo para permitir otro ciclo de merma sin entrega al cliente ni garantía intermedia","parentIord":"DF01134410037","approvedInSession":true}',
     NULL, SYSUTCDATETIME());

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT IORD, SUC, ESTSEGU, ESTATUS, TIPOM, MOTR, REEORD, CTD, CTD_C_M, FCNMOD
FROM dbo.PV_CTR_ORDS
WHERE IORD = N'DF01134490001';

SELECT IORD, ESTSEGU, FCNR, ORIGEN, ID
FROM dbo.PV_CTR_ORDS_FLUJO_HIST
WHERE IORD = N'DF01134490001'
ORDER BY FCNR, ID;
