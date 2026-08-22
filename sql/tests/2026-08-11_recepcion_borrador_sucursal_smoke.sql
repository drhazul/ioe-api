SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;
BEGIN TRY
  DECLARE @NPED nvarchar(100)=(
    SELECT TOP 1 CONVERT(nvarchar(100),NPED)
    FROM dbo.REC_CAB_PED
    WHERE UPPER(LTRIM(RTRIM(ISNULL(ESTATUS,'')))) IN ('PROCESADO','PARCIAL')
    ORDER BY NPED DESC
  );
  IF @NPED IS NULL THROW 52000,'Sin orden disponible para probar borrador.',1;

  EXEC dbo.sp_rec_recepcion_borrador_guardar
    @NPED=@NPED,
    @USR='CODEX_SMOKE',
    @TIPO_RECEPCION='PARCIAL',
    @TIPO_DOC='PENDIENTE',
    @ITEMS_JSON=N'[{
      "idped":"CODEX_SMOKE",
      "art":"CODEX_SMOKE",
      "cantidadRecibida":0,
      "cantidadAceptada":0,
      "estatus":"APROBADO"
    }]';

  IF NOT EXISTS(
    SELECT 1 FROM dbo.REC_BORRADOR_REC WHERE NPED=@NPED AND USR='CODEX_SMOKE'
  ) THROW 52000,'No se guardó la cabecera del borrador.',1;
  IF NOT EXISTS(
    SELECT 1 FROM dbo.REC_BORRADOR_REC_DET
    WHERE NPED=@NPED AND IDPED='CODEX_SMOKE' AND ESTATUS='APROBADO'
  ) THROW 52000,'No se guardó el detalle del borrador.',1;

  EXEC dbo.sp_rec_recepcion_borrador_eliminar @NPED=@NPED;
  IF EXISTS(SELECT 1 FROM dbo.REC_BORRADOR_REC WHERE NPED=@NPED)
    THROW 52000,'No se eliminó el borrador.',1;

  SELECT @NPED NPED,'OK' RESULTADO;
  ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
