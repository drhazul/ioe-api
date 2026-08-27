SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @docrec nvarchar(510) = N'70000288133';
DECLARE @nped nvarchar(510) = N'450002479';
DECLARE @usr nvarchar(100) = N'udf01ja04';

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @lock_result int;
  EXEC @lock_result = sys.sp_getapplock
    @Resource = N'DAT_REC_REVERSAR_70000288133',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 15000;
  IF @lock_result < 0
    THROW 51000, 'No fue posible bloquear la recepcion.', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.REC_CTRL_DOC_REC r WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.REC_CAB_PED h WITH (UPDLOCK, HOLDLOCK) ON h.NPED = r.NPED
    WHERE r.DOCREC = @docrec
      AND r.NPED = @nped
      AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTATUS_REC, N'')))) = N'CONTABILIZADO'
      AND UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, N'')))) = N'PROCESADO'
  )
    THROW 51000, 'La recepcion u orden ya no tiene el estado esperado.', 1;

  IF (SELECT COUNT_BIG(1) FROM dbo.DAT_MB51 WHERE DOCP = @docrec) <> 129
    THROW 51000, 'La cantidad de movimientos MB51 ya no coincide con 129.', 1;

  IF ABS((SELECT SUM(ISNULL(CTDA, 0)) FROM dbo.DAT_MB51 WHERE DOCP = @docrec) - 184) > 0.000001
    THROW 51000, 'La cantidad contabilizada ya no coincide con 184.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.DAT_MB51 m
    LEFT JOIN dbo.REC_CTO_HIST x
      ON x.DOCREC = m.DOCP AND x.IDREC = m.IDPD
    WHERE m.DOCP = @docrec AND x.IDREC IS NULL
  )
    THROW 51000, 'Existen movimientos sin renglon historico relacionado.', 1;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT SUC, ART, SUM(ISNULL(CTDA, 0)) CTD
      FROM dbo.DAT_MB51
      WHERE DOCP = @docrec
      GROUP BY SUC, ART
    ) q
    LEFT JOIN dbo.DAT_ART a ON a.SUC = q.SUC AND a.ART = q.ART
    WHERE a.ART IS NULL
  )
    THROW 51000, 'Uno o mas articulos del movimiento no existen en DAT_ART.', 1;

  ;WITH qty AS (
    SELECT SUC, ART, SUM(ISNULL(CTDA, 0)) CTD
    FROM dbo.DAT_MB51
    WHERE DOCP = @docrec
    GROUP BY SUC, ART
  )
  UPDATE a
  SET a.STOCK = ISNULL(a.STOCK, 0) - q.CTD
  FROM dbo.DAT_ART a
  JOIN qty q ON q.SUC = a.SUC AND q.ART = a.ART;

  ;WITH qty AS (
    SELECT IDPED, SUM(ISNULL(CTD_ACEP, CTD)) CTD
    FROM dbo.REC_CTO_HIST
    WHERE DOCREC = @docrec AND IDPED IS NOT NULL
    GROUP BY IDPED
  )
  UPDATE d
  SET
    d.CTDREC = CASE
      WHEN ISNULL(d.CTDREC, 0) >= q.CTD THEN ISNULL(d.CTDREC, 0) - q.CTD
      ELSE 0
    END,
    d.RECI = 0,
    d.DREC = CASE WHEN d.DREC = @docrec THEN NULL ELSE d.DREC END
  FROM dbo.REC_DET_PED d
  JOIN qty q ON q.IDPED = d.IDPED;

  DELETE dbo.DAT_MB51 WHERE DOCP = @docrec;
  DELETE dbo.DAT_CTR_DOC WHERE DOC = @docrec;

  UPDATE dbo.REC_CTRL_DOC_REC
  SET
    ESTATUS_REC = N'CANCELADO',
    OBSERVACIONES = LEFT(
      CONCAT(
        ISNULL(OBSERVACIONES, N''),
        CASE WHEN NULLIF(OBSERVACIONES, N'') IS NULL THEN N'' ELSE CHAR(13) + CHAR(10) END,
        N'MOVIMIENTO REVERTIDO: se retiraron 129 movimientos y 184 unidades.'
      ),
      1000
    )
  WHERE DOCREC = @docrec;

  UPDATE dbo.REC_CAB_PED
  SET ESTATUS = N'PROCESADO', FCNR = NULL
  WHERE NPED = @nped;

  INSERT dbo.AUDIT_LOG (
    IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, FCNR
  )
  SELECT
    u.IDUSUARIO,
    N'REVERSAR_RECEPCION_CONTABILIZADA',
    N'DAT_REC',
    N'REC_CTRL_DOC_REC',
    @docrec,
    h.SUC,
    N'{"nped":"450002479","movimientosEliminados":129,"cantidadRevertida":184,"importeRevertido":29066,"estatusOrden":"PROCESADO","estatusRecepcion":"CANCELADO"}',
    SYSDATETIME()
  FROM dbo.REC_CAB_PED h
  OUTER APPLY (
    SELECT TOP (1) IDUSUARIO
    FROM dbo.USUARIO
    WHERE UPPER(USERNAME) = UPPER(@usr)
  ) u
  WHERE h.NPED = @nped;

  COMMIT TRANSACTION;

  SELECT
    h.NPED,
    h.ESTATUS,
    r.DOCREC,
    r.ESTATUS_REC,
    (SELECT COUNT_BIG(1) FROM dbo.DAT_MB51 WHERE DOCP = @docrec) MOVIMIENTOS,
    CAST(SUM(ISNULL(d.CTDPED, 0)) AS decimal(18, 2)) PEDIDO,
    CAST(SUM(ISNULL(d.CTDREC, 0)) AS decimal(18, 2)) RECIBIDO,
    CAST(SUM(CASE WHEN ISNULL(d.CTDPED, 0) > ISNULL(d.CTDREC, 0)
      THEN ISNULL(d.CTDPED, 0) - ISNULL(d.CTDREC, 0) ELSE 0 END) AS decimal(18, 2)) PENDIENTE
  FROM dbo.REC_CAB_PED h
  JOIN dbo.REC_CTRL_DOC_REC r ON r.NPED = h.NPED AND r.DOCREC = @docrec
  JOIN dbo.REC_DET_PED d ON d.NPED = h.NPED AND ISNULL(d.BLOQ, 0) <> -1
  WHERE h.NPED = @nped
  GROUP BY h.NPED, h.ESTATUS, r.DOCREC, r.ESTATUS_REC;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
