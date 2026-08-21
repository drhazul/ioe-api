SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @lock_result int;
  EXEC @lock_result = sys.sp_getapplock
    @Resource = N'DAT_ORD_COMP_NORMALIZAR_CANCELACION_VALIDADA',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 15000;
  IF @lock_result < 0
    THROW 51000, 'No fue posible bloquear la normalizacion de cancelaciones.', 1;

  DECLARE @corregidas table (
    NPED nvarchar(510) NOT NULL,
    SUC nvarchar(510) NULL,
    ESTATUS_ANTERIOR nvarchar(100) NULL
  );

  UPDATE h
  SET h.ESTATUS = N'ANULADO'
  OUTPUT inserted.NPED, inserted.SUC, deleted.ESTATUS
    INTO @corregidas (NPED, SUC, ESTATUS_ANTERIOR)
  FROM dbo.REC_CAB_PED h
  WHERE UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, N'')))) = N'CANCELADA'
    AND EXISTS (
      SELECT 1
      FROM dbo.REC_CTRL_DOC_REC r
      WHERE r.NPED = h.NPED
        AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTATUS_REC, N'')))) = N'CANCELADO'
    );

  INSERT dbo.AUDIT_LOG (
    IDUSUARIO, ACTION, MODULO, ENTIDAD, ENTIDAD_ID, SUC, METADATA_JSON, FCNR
  )
  SELECT
    NULL,
    N'NORMALIZAR_CANCELACION_VALIDADA_ANULADO',
    N'DAT_ORD_COMP',
    N'REC_CAB_PED',
    c.NPED,
    c.SUC,
    CONCAT(
      N'{"estatusAnterior":"',
      STRING_ESCAPE(ISNULL(c.ESTATUS_ANTERIOR, N''), 'json'),
      N'","estatusNuevo":"ANULADO","origen":"recepcion_validada_cancelada"}'
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
