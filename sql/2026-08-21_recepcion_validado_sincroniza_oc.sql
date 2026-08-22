SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @lock_result int;
  EXEC @lock_result = sys.sp_getapplock
    @Resource = N'DAT_REC_VALIDADO_SINCRONIZA_OC',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 15000;
  IF @lock_result < 0
    THROW 51000, 'No fue posible bloquear la sincronizacion de validados.', 1;

  IF EXISTS (SELECT 1 FROM dbo.ESTATUS_SUG WHERE [DESC] = N'VALIDADO')
    UPDATE dbo.ESTATUS_SUG
    SET ORDEN = 42, ACTIVO = 1
    WHERE [DESC] = N'VALIDADO';
  ELSE
    INSERT dbo.ESTATUS_SUG ([DESC], ORDEN, ACTIVO)
    VALUES (N'VALIDADO', 42, 1);

  DECLARE @corregidas table (
    NPED nvarchar(510) NOT NULL,
    SUC nvarchar(510) NULL,
    ESTATUS_ANTERIOR nvarchar(100) NULL
  );

  ;WITH ultimas AS (
    SELECT
      r.NPED,
      r.ESTATUS_REC,
      ROW_NUMBER() OVER (
        PARTITION BY r.NPED
        ORDER BY COALESCE(r.FCN_AUTORIZA, r.FCN_FISICA, r.FCNC) DESC, r.DOCREC DESC
      ) AS RN
    FROM dbo.REC_CTRL_DOC_REC r
  )
  UPDATE h
  SET h.ESTATUS = N'VALIDADO'
  OUTPUT inserted.NPED, inserted.SUC, deleted.ESTATUS
    INTO @corregidas (NPED, SUC, ESTATUS_ANTERIOR)
  FROM dbo.REC_CAB_PED h
  JOIN ultimas u ON u.NPED = h.NPED AND u.RN = 1
  WHERE UPPER(LTRIM(RTRIM(ISNULL(u.ESTATUS_REC, N'')))) = N'VALIDADO'
    AND UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, N'')))) IN (N'PROCESADO', N'PARCIAL');

  INSERT dbo.AUDIT_LOG (
    IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, FCNR
  )
  SELECT
    NULL,
    N'SINCRONIZAR_VALIDADO_OC',
    N'DAT_REC',
    N'REC_CAB_PED',
    c.NPED,
    c.SUC,
    CONCAT(
      N'{"estatusAnterior":"',
      STRING_ESCAPE(ISNULL(c.ESTATUS_ANTERIOR, N''), 'json'),
      N'","estatusNuevo":"VALIDADO"}'
    ),
    SYSDATETIME()
  FROM @corregidas c;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO

CREATE OR ALTER PROCEDURE dbo.sp_rec_recepcion_solicitar
  @DOCREC nvarchar(510),
  @USR nvarchar(100),
  @MOTIVO nvarchar(1000) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;

  DECLARE @lock int;
  DECLARE @lock_resource nvarchar(255) = CONCAT('DAT_REC_DOC_', @DOCREC);
  EXEC @lock = sys.sp_getapplock
    @Resource = @lock_resource,
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 15000;
  IF @lock < 0 THROW 51000, 'No fue posible bloquear la recepcion.', 1;

  DECLARE
    @ESTATUS nvarchar(30),
    @NPED nvarchar(510),
    @SUC nvarchar(510),
    @TIPO nvarchar(20);

  SELECT
    @ESTATUS = r.ESTATUS_REC,
    @NPED = r.NPED,
    @TIPO = r.TIPO_RECEPCION,
    @SUC = h.SUC
  FROM dbo.REC_CTRL_DOC_REC r WITH (UPDLOCK, HOLDLOCK)
  JOIN dbo.REC_CAB_PED h WITH (UPDLOCK, HOLDLOCK) ON h.NPED = r.NPED
  WHERE r.DOCREC = @DOCREC;

  IF @ESTATUS IS NULL THROW 51000, 'La recepcion no existe.', 1;

  IF @ESTATUS = 'VALIDADO'
  BEGIN
    UPDATE dbo.REC_CAB_PED
    SET ESTATUS = 'VALIDADO'
    WHERE NPED = @NPED
      AND UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, '')))) NOT IN ('CANCELADA', 'ANULADO');
    COMMIT;
    SELECT @DOCREC DOCREC, @ESTATUS ESTATUS_REC;
    RETURN;
  END;

  IF @ESTATUS <> 'RECEPCION_FISICA'
    THROW 51000, 'La recepcion no se puede validar en su estado actual.', 1;
  IF @TIPO <> 'RECHAZO' AND NOT EXISTS (
    SELECT 1
    FROM dbo.REC_CTO_HIST
    WHERE DOCREC = @DOCREC AND ISNULL(CTD_ACEP, CTD) > 0
  )
    THROW 51000, 'No hay cantidades aceptadas.', 1;
  IF EXISTS (
    SELECT 1
    FROM dbo.REC_CTO_HIST
    WHERE DOCREC = @DOCREC AND CALIDAD_ESTATUS = 'PENDIENTE'
  )
    THROW 51000, 'Existen validaciones de calidad pendientes.', 1;

  UPDATE dbo.REC_CTRL_DOC_REC
  SET ESTATUS_REC = 'VALIDADO'
  WHERE DOCREC = @DOCREC;

  UPDATE dbo.REC_CAB_PED
  SET ESTATUS = 'VALIDADO'
  WHERE NPED = @NPED;

  INSERT dbo.AUDIT_LOG (
    IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, FCNR
  )
  SELECT
    IDUSUARIO,
    'VALIDAR_RECEPCION',
    'DAT_REC',
    'REC_CTRL_DOC_REC',
    @DOCREC,
    @SUC,
    NULL,
    SYSDATETIME()
  FROM dbo.USUARIO
  WHERE UPPER(USERNAME) = UPPER(@USR);

  COMMIT;
  SELECT @DOCREC DOCREC, 'VALIDADO' ESTATUS_REC;
END;
GO
