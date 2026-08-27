SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @objetivo table (NPED nvarchar(510) NOT NULL PRIMARY KEY);
INSERT @objetivo (NPED)
VALUES
  (N'450002387'), (N'450002388'), (N'450002389'), (N'450002390'),
  (N'450002395'), (N'450002396'), (N'450002397'), (N'450002398'),
  (N'450002400'), (N'450002401'), (N'450002402'), (N'450002403'),
  (N'450002404'), (N'450002405');

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @lock_result int;
  EXEC @lock_result = sys.sp_getapplock
    @Resource = N'DAT_REC_REGULARIZAR_CONTABILIZADO_20260824_450002387_450002405',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 15000;
  IF @lock_result < 0
    THROW 51000, 'No fue posible bloquear la regularizacion.', 1;

  IF (SELECT COUNT_BIG(1) FROM @objetivo) <> 14
    THROW 51000, 'La lista objetivo no contiene las 14 ordenes esperadas.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    LEFT JOIN dbo.REC_CAB_PED h WITH (UPDLOCK, HOLDLOCK) ON h.NPED = o.NPED
    WHERE h.NPED IS NULL
       OR UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, N'')))) <> N'RECIBIDO'
  )
    THROW 51000, 'Una o mas ordenes no existen o ya no estan en RECIBIDO.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    JOIN dbo.REC_CTRL_DOC_REC r WITH (UPDLOCK, HOLDLOCK) ON r.NPED = o.NPED
  )
    THROW 51000, 'Una o mas ordenes ya tienen una recepcion formal.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    LEFT JOIN dbo.REC_DET_PED d WITH (UPDLOCK, HOLDLOCK)
      ON d.NPED = o.NPED AND ISNULL(d.BLOQ, 0) <> -1
    GROUP BY o.NPED
    HAVING COUNT(d.IDPED) = 0
       OR SUM(ISNULL(d.CTDREC, 0)) <= 0
       OR SUM(CASE WHEN ISNULL(d.CTDREC, 0) < ISNULL(d.CTDPED, 0) THEN 1 ELSE 0 END) > 0
  )
    THROW 51000, 'Una o mas ordenes no tienen recepcion completa en el detalle.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    JOIN dbo.REC_DET_PED d ON d.NPED = o.NPED AND ISNULL(d.BLOQ, 0) <> -1
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(d.DREC, N''))), N'') IS NULL
  )
    THROW 51000, 'Una o mas ordenes no tienen documento legacy de referencia.', 1;

  DECLARE @base_doc bigint;
  SELECT @base_doc = ISNULL(MAX(NUMERO), 71000000)
  FROM (
    SELECT TRY_CONVERT(bigint, DOCREC) AS NUMERO FROM dbo.REC_CTRL_DOC_REC WITH (UPDLOCK, HOLDLOCK)
    UNION ALL
    SELECT TRY_CONVERT(bigint, DOC) FROM dbo.DAT_CTR_DOC WITH (UPDLOCK, HOLDLOCK)
    UNION ALL
    SELECT TRY_CONVERT(bigint, DOCP) FROM dbo.DAT_MB51 WITH (UPDLOCK, HOLDLOCK)
  ) documentos
  WHERE NUMERO IS NOT NULL;

  DECLARE @map table (
    NPED nvarchar(510) NOT NULL PRIMARY KEY,
    DOCREC nvarchar(510) NOT NULL UNIQUE,
    DREC_LEGACY nvarchar(510) NULL
  );

  INSERT @map (NPED, DOCREC, DREC_LEGACY)
  SELECT
    o.NPED,
    CONVERT(nvarchar(510), @base_doc + ROW_NUMBER() OVER (ORDER BY TRY_CONVERT(bigint, o.NPED), o.NPED)),
    legacy.DREC
  FROM @objetivo o
  OUTER APPLY (
    SELECT TOP (1) NULLIF(LTRIM(RTRIM(d.DREC)), N'') AS DREC
    FROM dbo.REC_DET_PED d
    WHERE d.NPED = o.NPED AND ISNULL(d.BLOQ, 0) <> -1
    ORDER BY d.POS, d.IDPED
  ) legacy;

  IF EXISTS (
    SELECT 1
    FROM @map m
    WHERE EXISTS (SELECT 1 FROM dbo.REC_CTRL_DOC_REC r WHERE r.DOCREC = m.DOCREC)
       OR EXISTS (SELECT 1 FROM dbo.DAT_CTR_DOC c WHERE c.DOC = m.DOCREC)
       OR EXISTS (SELECT 1 FROM dbo.DAT_MB51 b WHERE b.DOCP = m.DOCREC)
  )
    THROW 51000, 'Se detecto una colision al generar DOCREC.', 1;

  INSERT dbo.REC_CTRL_DOC_REC (
    DOCREC, NPED, FCNC, NART, IMPT, ESTATUS_REC, TIPO_RECEPCION,
    FCN_FISICA, USR_RECEPCION, FCN_AUTORIZA, USR_AUTORIZA,
    TIPO_DOC, FOLIO_DOC, OBSERVACIONES, ALMACEN
  )
  SELECT
    m.DOCREC,
    h.NPED,
    COALESCE(h.FCNC, h.FCNP, SYSDATETIME()),
    det.NART,
    det.IMPT,
    N'CONTABILIZADO',
    N'TOTAL',
    COALESCE(h.FCNC, h.FCNP, SYSDATETIME()),
    h.USR,
    COALESCE(h.FCNC, h.FCNP, SYSDATETIME()),
    h.USR,
    N'LEGACY',
    m.DREC_LEGACY,
    CONCAT(N'Regularizacion historica. Documento legacy: ', m.DREC_LEGACY, N'. Sin nueva afectacion de inventario.'),
    '002'
  FROM @map m
  JOIN dbo.REC_CAB_PED h ON h.NPED = m.NPED
  CROSS APPLY (
    SELECT
      COUNT_BIG(1) AS NART,
      CONVERT(money, SUM(ISNULL(d.CTO, 0) * ISNULL(d.CTDREC, 0))) AS IMPT
    FROM dbo.REC_DET_PED d
    WHERE d.NPED = m.NPED AND ISNULL(d.BLOQ, 0) <> -1
  ) det;

  INSERT dbo.REC_CTO_HIST (
    IDREC, POS, ART, FCN, CTD, CTDVTA, DOCREC, IDPED,
    CTD_SOL, CTD_ACEP, CALIDAD_ESTATUS, CALIDAD_JSON,
    CADUCIDAD, OBSERVACIONES
  )
  SELECT
    CONCAT(N'REC-', m.DOCREC, N'-', CONVERT(varchar(12), ROW_NUMBER() OVER (PARTITION BY m.DOCREC ORDER BY d.POS, d.IDPED))),
    d.POS,
    d.ART,
    COALESCE(h.FCNC, h.FCNP, SYSDATETIME()),
    d.CTDREC,
    ISNULL(d.CTO, 0) * ISNULL(d.CTDREC, 0),
    m.DOCREC,
    d.IDPED,
    d.CTDPED,
    d.CTDREC,
    N'APROBADO',
    NULL,
    NULL,
    CONCAT(N'Regularizacion desde DREC legacy ', m.DREC_LEGACY, N'.')
  FROM @map m
  JOIN dbo.REC_CAB_PED h ON h.NPED = m.NPED
  JOIN dbo.REC_DET_PED d ON d.NPED = m.NPED AND ISNULL(d.BLOQ, 0) <> -1;

  INSERT dbo.AUDIT_LOG (
    IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, FCNR
  )
  SELECT
    u.IDUSUARIO,
    N'REGULARIZAR_CONTABILIZADO_LEGACY',
    N'DAT_REC',
    N'REC_CTRL_DOC_REC',
    m.DOCREC,
    h.SUC,
    CONCAT(
      N'{"nped":"', STRING_ESCAPE(h.NPED, 'json'),
      N'","drecLegacy":"', STRING_ESCAPE(ISNULL(m.DREC_LEGACY, N''), 'json'),
      N'","afectaInventario":false}'
    ),
    SYSDATETIME()
  FROM @map m
  JOIN dbo.REC_CAB_PED h ON h.NPED = m.NPED
  OUTER APPLY (
    SELECT TOP (1) x.IDUSUARIO
    FROM dbo.USUARIO x
    WHERE UPPER(x.USERNAME) = UPPER(h.USR)
  ) u;

  COMMIT TRANSACTION;

  SELECT
    r.NPED,
    r.DOCREC,
    r.ESTATUS_REC,
    r.FOLIO_DOC AS DREC_LEGACY,
    COUNT_BIG(x.IDREC) AS LINEAS,
    CONVERT(decimal(18, 2), SUM(ISNULL(x.CTD_ACEP, 0))) AS CANTIDAD,
    (SELECT COUNT_BIG(1) FROM dbo.DAT_MB51 b WHERE b.DOCP = r.DOCREC) AS MOVIMIENTOS_NUEVOS
  FROM @map m
  JOIN dbo.REC_CTRL_DOC_REC r ON r.DOCREC = m.DOCREC
  LEFT JOIN dbo.REC_CTO_HIST x ON x.DOCREC = r.DOCREC
  GROUP BY r.NPED, r.DOCREC, r.ESTATUS_REC, r.FOLIO_DOC
  ORDER BY TRY_CONVERT(bigint, r.NPED), r.NPED;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
