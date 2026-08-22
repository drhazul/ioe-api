SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @objetivo table (NPED nvarchar(510) NOT NULL PRIMARY KEY);
INSERT @objetivo (NPED)
VALUES
  ('450002380'), ('450002379'), ('450002378'), ('450002377'),
  ('450002376'), ('450002375'), ('450002374'), ('450002373'),
  ('450002372'), ('450002371'), ('450002370'), ('450002369'),
  ('450002368'), ('450002367'), ('450002366'), ('450002365'),
  ('450002364'), ('450002362'), ('450002361'), ('450002358'),
  ('450002357'), ('450002354'), ('450002353'), ('450002352'),
  ('450002351'), ('450002349'), ('450002348'), ('450002347'),
  ('450002345'), ('450002344'), ('450002343'), ('450002341'),
  ('450002337'), ('450002336'), ('450002335'), ('450002334'),
  ('450002333'), ('450002332'), ('450002331'), ('450002328'),
  ('450002325'), ('450002324'), ('450002323'), ('450002321'),
  ('450002320'), ('450002319'), ('450002315');

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @lock_result int;
  EXEC @lock_result = sys.sp_getapplock
    @Resource = N'DAT_REC_REABRIR_RECIBIDO_SIN_MOVIMIENTO_20260821',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 15000;
  IF @lock_result < 0
    THROW 51000, 'No fue posible bloquear la correccion de ordenes.', 1;

  IF (SELECT COUNT_BIG(1) FROM @objetivo) <> 47
    THROW 51000, 'La lista objetivo no contiene las 47 ordenes esperadas.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    LEFT JOIN dbo.REC_CAB_PED h WITH (UPDLOCK, HOLDLOCK) ON h.NPED = o.NPED
    WHERE h.NPED IS NULL
       OR UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, N'')))) <> N'RECIBIDO'
  )
    THROW 51000, 'Una o mas ordenes ya no estan en RECIBIDO.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    JOIN dbo.REC_CTRL_DOC_REC r WITH (UPDLOCK, HOLDLOCK) ON r.NPED = o.NPED
  )
    THROW 51000, 'Una o mas ordenes ya tienen una recepcion formal.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    JOIN dbo.DAT_MB51 m WITH (UPDLOCK, HOLDLOCK)
      ON LTRIM(RTRIM(ISNULL(m.TXT, N''))) = o.NPED
     AND UPPER(LTRIM(RTRIM(ISNULL(m.CLSM, N'')))) = N'101'
  )
    THROW 51000, 'Una o mas ordenes ya tienen movimiento 101.', 1;

  IF EXISTS (
    SELECT 1
    FROM @objetivo o
    LEFT JOIN dbo.REC_DET_PED d WITH (UPDLOCK, HOLDLOCK)
      ON d.NPED = o.NPED AND ISNULL(d.BLOQ, 0) <> -1
    GROUP BY o.NPED
    HAVING COUNT(d.IDPED) = 0
  )
    THROW 51000, 'Una o mas ordenes no tienen detalle activo.', 1;

  INSERT dbo.AUDIT_LOG (
    IDUSUARIO,
    ACTION,
    MODULO,
    ENTIDAD,
    ENTIDAD_ID,
    SUC,
    METADATA_JSON,
    FCNR
  )
  SELECT
    NULL,
    N'REABRIR_SIN_MOVIMIENTO',
    N'DAT_REC',
    N'REC_CAB_PED',
    h.NPED,
    h.SUC,
    CONCAT(
      N'{"estatusAnterior":"',
      STRING_ESCAPE(ISNULL(h.ESTATUS, N''), 'json'),
      N'","estatusNuevo":"PROCESADO","motivo":"Sin recepcion formal ni movimiento 101"}'
    ),
    SYSDATETIME()
  FROM @objetivo o
  JOIN dbo.REC_CAB_PED h ON h.NPED = o.NPED;

  UPDATE d
  SET
    d.CTDREC = 0,
    d.RECI = 0,
    d.DREC = NULL
  FROM dbo.REC_DET_PED d
  JOIN @objetivo o ON o.NPED = d.NPED
  WHERE ISNULL(d.BLOQ, 0) <> -1;

  UPDATE h
  SET
    h.ESTATUS = N'PROCESADO',
    h.FCNR = NULL
  FROM dbo.REC_CAB_PED h
  JOIN @objetivo o ON o.NPED = h.NPED;

  COMMIT TRANSACTION;

  SELECT
    h.NPED,
    h.SUC,
    h.ESTATUS,
    COUNT_BIG(d.IDPED) AS LINEAS,
    CAST(SUM(ISNULL(d.CTDPED, 0)) AS decimal(18, 2)) AS SOLICITADO,
    CAST(SUM(ISNULL(d.CTDREC, 0)) AS decimal(18, 2)) AS RECIBIDO,
    SUM(CASE WHEN d.DREC IS NOT NULL THEN 1 ELSE 0 END) AS CON_DREC
  FROM @objetivo o
  JOIN dbo.REC_CAB_PED h ON h.NPED = o.NPED
  JOIN dbo.REC_DET_PED d ON d.NPED = h.NPED AND ISNULL(d.BLOQ, 0) <> -1
  GROUP BY h.NPED, h.SUC, h.ESTATUS
  ORDER BY TRY_CONVERT(bigint, h.NPED) DESC;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
