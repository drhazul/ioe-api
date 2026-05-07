SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE IOELOCAL;
GO

DECLARE @IordOrig NVARCHAR(255) = 'DF10132580001';
DECLARE @IordWrong NVARCHAR(255) = 'DF10132730001';
DECLARE @IordReserved NVARCHAR(255) = 'DF10132740001';
DECLARE @Idfol NVARCHAR(255) = 'DF10-20260408-VF-0002';
DECLARE @Actor NVARCHAR(255) = 'udf01ad02';

DECLARE @Tipom INT;
DECLARE @Motr INT;
DECLARE @ArtNuevo NVARCHAR(255);
DECLARE @Motivo NVARCHAR(255);
DECLARE @Labor INT;
DECLARE @DocDif NVARCHAR(255);
DECLARE @CtdCM FLOAT;
DECLARE @PvtaNuevo FLOAT;
DECLARE @CreatedIord NVARCHAR(255);

IF NOT EXISTS (SELECT 1 FROM dbo.PV_CTR_ORDS WHERE IORD = @IordOrig)
  THROW 59100, 'No existe ORD origen esperada.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.PV_CTR_ORDS WHERE IORD = @IordWrong)
  THROW 59101, 'No existe ORD creada a revertir.', 1;

IF EXISTS (SELECT 1 FROM dbo.PV_CTR_ORDS WHERE IORD = @IordReserved)
  THROW 59102, 'La IORD reservada ya existe en PV_CTR_ORDS; no se puede reprocesar seguro.', 1;

IF NOT EXISTS (
  SELECT 1
  FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
  WHERE t.IORD = @IordOrig
    AND TRY_CONVERT(INT, t.TIPOM) = 1
)
  THROW 59103, 'No existe staging cambio-material para la ORD origen.', 1;

SELECT
  @Tipom = TRY_CONVERT(INT, t.TIPOM),
  @Motr = TRY_CONVERT(INT, t.MOTR),
  @ArtNuevo = LTRIM(RTRIM(ISNULL(t.ART_NUEVO, ''))),
  @Motivo = LTRIM(RTRIM(ISNULL(t.MOTIVO, ''))),
  @Labor = TRY_CONVERT(INT, t.LABOR),
  @DocDif = LTRIM(RTRIM(ISNULL(t.DOCDIF, ''))),
  @CtdCM = TRY_CONVERT(FLOAT, t.CTD_C_M),
  @PvtaNuevo = TRY_CONVERT(FLOAT, t.PVTA_NUEVO)
FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
WHERE t.IORD = @IordOrig
  AND TRY_CONVERT(INT, t.TIPOM) = 1;

IF ISNULL(@ArtNuevo, '') = ''
  THROW 59104, 'Staging sin ART_NUEVO para reproceso.', 1;

IF @Motr IS NULL OR @Motr <= 0
  THROW 59105, 'Staging sin MOTR válido para reproceso.', 1;

IF @CtdCM IS NULL OR (ABS(@CtdCM - 1) > 0.0001 AND ABS(@CtdCM - 0.5) > 0.0001)
  THROW 59106, 'Staging sin CTD_C_M válido para reproceso.', 1;

IF (
  SELECT COUNT(1)
  FROM dbo.DAT_MB51
  WHERE DOCP = @Idfol
    AND (
      TXT = CONCAT('Cambio - Reintegracion stock ORD', @IordOrig)
      OR TXT = CONCAT('Cambio - Descuento stock ORD', @IordWrong)
    )
) < 2
  THROW 59107, 'No se encontraron movimientos MB51 esperados para rollback seguro.', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @DocsCtasRollback TABLE (DOC NVARCHAR(255) PRIMARY KEY);
  INSERT INTO @DocsCtasRollback (DOC)
  SELECT DISTINCT LTRIM(RTRIM(ISNULL(c.NDOC, '')))
  FROM dbo.DAT_CTRL_CTAS c
  WHERE c.IDFOL = @Idfol
    AND c.RTXT = CONCAT('Diferencia cambio material ORD ', @IordOrig, ' -> ', @IordWrong)
    AND LTRIM(RTRIM(ISNULL(c.NDOC, ''))) <> '';

  DELETE FROM dbo.DAT_CTRL_CTAS
  WHERE IDFOL = @Idfol
    AND RTXT = CONCAT('Diferencia cambio material ORD ', @IordOrig, ' -> ', @IordWrong);

  DELETE dcd
  FROM dbo.DAT_CTR_DOC dcd
  INNER JOIN @DocsCtasRollback docs
    ON UPPER(LTRIM(RTRIM(ISNULL(dcd.DOC, '')))) = UPPER(docs.DOC)
  WHERE TRY_CONVERT(INT, dcd.CLSMOV) IN (801, 802);

  DELETE FROM dbo.DAT_MB51
  WHERE DOCP = @Idfol
    AND (
      TXT = CONCAT('Cambio - Reintegracion stock ORD', @IordOrig)
      OR TXT = CONCAT('Cambio - Descuento stock ORD', @IordWrong)
    );

  DELETE FROM dbo.PV_CTR_ORDS_DET
  WHERE IORD = @IordWrong;

  DELETE FROM dbo.PV_CTR_ORDS
  WHERE IORD = @IordWrong;

  UPDATE dbo.PV_CTR_ORDS
  SET
    REEORD = NULL,
    ESTSEGU = 9.1,
    ESTATUS = 2,
    selCtrlOrd = 14,
    USR_AUT_CYM = NULL,
    FCN_AUT_CYM = NULL,
    FCNMOD = GETDATE()
  WHERE IORD = @IordOrig;

  UPDATE dbo.PV_ORD_CAMBIO_MERMA_TMP
  SET
    NVA_IORD = @IordReserved,
    USER_MOD = 'sql-rollback-reprocess',
    FCN_MOD = GETDATE()
  WHERE IORD = @IordOrig
    AND TRY_CONVERT(INT, TIPOM) = 1;

  EXEC dbo.sp_ordenes_trabajo_cambio_material
    @IORD = @IordOrig,
    @ART_NUEVO = @ArtNuevo,
    @MOTIVO = @Motivo,
    @LABOR = @Labor,
    @DOCDIF = @DocDif,
    @MOTR = @Motr,
    @CTD_C_M = @CtdCM,
    @PVTA_NUEVO = @PvtaNuevo,
    @IORD_NUEVA = @IordReserved,
    @USER = @Actor,
    @IP = 'sqlcmd-rollback-reprocess',
    @IS_ADMIN = 1,
    @ALLOWED_SUCS = NULL,
    @SUC = NULL;

  IF NOT EXISTS (SELECT 1 FROM dbo.PV_CTR_ORDS WHERE IORD = @IordReserved)
    THROW 59108, 'No se creó la ORD reservada tras reproceso.', 1;

  SELECT @CreatedIord = REEORD
  FROM dbo.PV_CTR_ORDS
  WHERE IORD = @IordOrig;

  IF UPPER(LTRIM(RTRIM(ISNULL(@CreatedIord, '')))) <> UPPER(@IordReserved)
    THROW 59109, 'La ORD origen no quedó ligada a la IORD reservada esperada.', 1;

  UPDATE dbo.PV_CTR_ORDS
  SET
    USR_AUT_CYM = @Actor,
    FCN_AUT_CYM = GETDATE(),
    FCNMOD = GETDATE()
  WHERE IORD = @IordOrig;

  UPDATE dbo.PV_CTR_ORDS
  SET
    ASIGN = NULL,
    selCtrlOrd = NULL,
    FCNMOD = GETDATE()
  WHERE IORD = @IordReserved;

  UPDATE dbo.PV_ORD_CAMBIO_MERMA_TMP
  SET
    NVA_IORD = @IordReserved,
    USER_MOD = 'sql-rollback-reprocess-ok',
    FCN_MOD = GETDATE()
  WHERE IORD = @IordOrig
    AND TRY_CONVERT(INT, TIPOM) = 1;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT 'OK_REPROCESS' AS EVENTO, @IordOrig AS IORD_ORIG, @IordReserved AS IORD_NUEVA;
SELECT IORD, IDFOL, ESTATUS, ESTSEGU, TIPOM, MOTR, REEORD, CTD_C_M, USR_AUT_CYM, FCN_AUT_CYM, FCNMOD
FROM dbo.PV_CTR_ORDS
WHERE IORD IN (@IordOrig, @IordReserved)
ORDER BY IORD;

SELECT TOP 10 IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,SUC
FROM dbo.DAT_MB51
WHERE DOCP = @Idfol
  AND (TXT LIKE CONCAT('%', @IordOrig, '%') OR TXT LIKE CONCAT('%', @IordReserved, '%'))
ORDER BY FCNC DESC;

SELECT TOP 10 NDOC, CTA, CLIENT, FCND, CLSD, IDFOL, RTXT, IMPT, SUC
FROM dbo.DAT_CTRL_CTAS
WHERE IDFOL = @Idfol
  AND RTXT LIKE CONCAT('%', @IordOrig, '%')
ORDER BY FCND DESC;
GO
