/*
  Respaldo anterior al desacoplamiento en IOELOCAL.

  Captura viva:
    create_date: 2026-08-29 08:54:30.573
    modify_date: 2026-08-29 09:18:06.790
    SHA2_256: B9D075C96B547875EE5AFCC026EA24812AA8A56D48EBACFDB205412A00C10A2D

  Conteos previos:
    DEV_DOC_PROVD       0
    DEV_CTRL_PROVD      0
    DEV_EVIDENCIA_PROVD 0
    DEV_ENVIO_PROVD     0

  Hashes de SP dependientes conservados sin modificacion:
    sp_dev_provd_agregar_articulo  4B5FBB5A2CB64ABCD3CAB8D07811FC6BBF0E27EA74E2CB3A672F1AA7F6E6FC1F
    sp_dev_provd_autorizar         2331D871371EF94425175C345F042A74D8F1C41DC4C224866A1F3688231E4636
    sp_dev_provd_cancelar          9C778749FFA69A51326D5622F197D83736B8B62346F33E8CE9AA3CF752EC7D76
    sp_dev_provd_consolidar_envio  85B51DE0BF2EB7AEDF6D5E35E0FCF4BBAA30009FE14CFD32A29A9797ABC7ED51
    sp_dev_provd_crear             D4206ABDEA9523911CBB9924929BF11B1EA13B63B2F91831CA694E70E12B6285
    sp_dev_provd_recalcular        098B847DB52106193E562A6AED386B00EF6DB5EBBED782A24B0DF1CB886ED297
    sp_dev_provd_rechazar          B2ABD33DB453CCB1D7A04732DB3E48B244BE720716CE4071CE7C5E52EC72E20E
    sp_dev_provd_salida_fisica     6C421FCEDD072EAA2C9636DFDA1769E5C238BB2D5D5203017F567A3BE740CB57
    sp_dev_provd_solicitar         5F5F7655D568173BA4AC3C7BCCAECB5A4B0958282A06023FF34D6691CFD98F6C

  El script preflight asociado exporta definiciones completas de SP y
  estructura de tablas/indices/FK como resultsets auditables.

  IMPORTANTE:
    Este archivo es evidencia inerte. La definicion queda comentada para evitar
    que una inspeccion o ejecucion accidental habilite nuevamente el trigger.
    Para rollback operativo use exclusivamente:
    2026-08-29_dev_provd_trigger_desacoplamiento_rollback.sql
*/

/* DEFINICION RESPALDADA - NO EJECUTAR DIRECTAMENTE
CREATE TRIGGER dbo.trg_dat_art_dev_provd_reserva
ON dbo.DAT_ART
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT UPDATE(STOCK) RETURN;

  IF EXISTS(
    SELECT 1
    FROM inserted i
    CROSS APPLY(
      SELECT SUM(d.CTDA_BLOQ) RESERVADO
      FROM dbo.DEV_CTRL_PROVD d
      JOIN dbo.DEV_DOC_PROVD h ON h.DOC=d.DOC
      WHERE h.SUC=i.SUC AND h.ESTATUS='PENDIENTE'
        AND d.ART=i.ART AND d.ACTIVO=1 AND d.CTDA_BLOQ>0
    ) r
    WHERE ISNULL(i.STOCK,0)<ISNULL(r.RESERVADO,0)
  )
    THROW 59280,'La operacion intenta consumir inventario reservado para devolucion a proveedor.',1;
END;
GO

ENABLE TRIGGER dbo.trg_dat_art_dev_provd_reserva ON dbo.DAT_ART;
GO
FIN DE DEFINICION RESPALDADA */
