/*
  Corrección puntual en IOEDESARROLLO: el origen DF01134340188 nunca llegó al
  flujo 11, por lo que su ORD derivada de merma debe quedar en flujo 9.2.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59080, 'Este ajuste puntual solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PV_CTR_ORDS nueva WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.PV_CTR_ORDS origen WITH (UPDLOCK, HOLDLOCK)
      ON origen.IORD = N'DF01134340188'
     AND origen.REEORD = nueva.IORD
     AND origen.ESTSEGU = 4
    WHERE nueva.IORD = N'DF01134510006'
      AND nueva.ESTSEGU = 10
      AND TRY_CONVERT(INT, nueva.TIPOM) = 2
      AND nueva.REEORD = origen.IORD
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.PV_CTR_ORDS_FLUJO_HIST h WITH (UPDLOCK, HOLDLOCK)
        WHERE UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) =
              UPPER(LTRIM(RTRIM(ISNULL(origen.IORD, ''))))
          AND TRY_CONVERT(FLOAT, h.ESTSEGU) = 11
      )
  )
    THROW 59081, 'La ORD, relación o historial ya no coincide con el caso verificado; no se modificó ningún registro', 1;

  UPDATE dbo.PV_CTR_ORDS
  SET ESTSEGU = 9.2,
      ESTATUS = 2,
      FCNMOD = GETDATE()
  WHERE IORD = N'DF01134510006'
    AND ESTSEGU = 10
    AND TRY_CONVERT(INT, TIPOM) = 2
    AND REEORD = N'DF01134340188';

  IF @@ROWCOUNT <> 1
    THROW 59082, 'No se actualizó exactamente la ORD de prueba esperada', 1;

  INSERT INTO dbo.AUDIT_LOG
    (IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, IP, FCNR)
  VALUES
    (NULL, N'ORD_MERMA_REENCAMINAR_SIN_ENTREGA', N'ORDENES-TRABAJO', N'PV_CTR_ORDS',
     N'DF01134510006', N'DF01',
     N'{"fromFlow":10,"toFlow":9.2,"reason":"ORD derivada de merma cuyo origen no registra entrega al cliente (flujo 11)","parentIord":"DF01134340188"}',
     NULL, SYSUTCDATETIME());

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT IORD, ESTSEGU, ESTATUS, TIPOM, MOTR, REEORD, FCNMOD
FROM dbo.PV_CTR_ORDS
WHERE IORD = N'DF01134510006';

SELECT IORD, ESTSEGU, FCNR, ORIGEN, ID
FROM dbo.PV_CTR_ORDS_FLUJO_HIST
WHERE IORD = N'DF01134510006'
ORDER BY FCNR, ID;
