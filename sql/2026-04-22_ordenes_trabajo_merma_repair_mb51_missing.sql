USE IOELOCAL;
SET NOCOUNT ON;
SET XACT_ABORT ON;

------------------------------------------------------------
-- VARIABLES A MODIFICAR
------------------------------------------------------------
DECLARE @IordOrig  VARCHAR(20) = 'DF10132460001';
DECLARE @IordNueva VARCHAR(20) = 'DF10132580001';
DECLARE @UserExec  NVARCHAR(255) = 'admin';

------------------------------------------------------------
-- VARIABLES INTERNAS
------------------------------------------------------------
DECLARE @IdFolOrig NVARCHAR(255);
DECLARE @Suc NVARCHAR(10);
DECLARE @ArtOrig NVARCHAR(255);
DECLARE @ArtNuevo NVARCHAR(255);
DECLARE @CtdCM FLOAT;
DECLARE @Motr INT;
DECLARE @QtyAbs FLOAT;
DECLARE @QtyNeg FLOAT;
DECLARE @Txt456 NVARCHAR(255);
DECLARE @Txt455 NVARCHAR(255);
DECLARE @Txt457 NVARCHAR(255);

SELECT TOP 1
    @IdFolOrig = o.IDFOL,
    @Suc = o.SUC,
    @ArtOrig = o.ART,
    @CtdCM = TRY_CONVERT(FLOAT, o.CTD_C_M),
    @Motr = TRY_CONVERT(INT, o.MOTR)
FROM dbo.PV_CTR_ORDS o
WHERE o.IORD = @IordOrig;

SELECT TOP 1
    @ArtNuevo = t.ART_NUEVO,
    @CtdCM = COALESCE(TRY_CONVERT(FLOAT, t.CTD_C_M), @CtdCM),
    @Motr = COALESCE(TRY_CONVERT(INT, t.MOTR), @Motr)
FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
WHERE t.IORD = @IordOrig;

IF LTRIM(RTRIM(ISNULL(@IdFolOrig, ''))) = ''
    THROW 58110, 'No se encontro IDFOL de la ORD original para reparar MB51', 1;

IF LTRIM(RTRIM(ISNULL(@Suc, ''))) = ''
    THROW 58111, 'No se encontro SUC de la ORD original para reparar MB51', 1;

IF LTRIM(RTRIM(ISNULL(@ArtOrig, ''))) = ''
    THROW 58112, 'No se encontro ART original para reparar MB51', 1;

IF LTRIM(RTRIM(ISNULL(@ArtNuevo, ''))) = ''
    SET @ArtNuevo = @ArtOrig;

IF ISNULL(@CtdCM, 0) <= 0
    THROW 58113, 'No se encontro CTD_C_M valida para reparar MB51', 1;

SET @QtyAbs = ABS(@CtdCM);
SET @QtyNeg = -ABS(@CtdCM);
SET @Txt456 = CONCAT('Merma - Reintegracion stock ORD', @IordOrig);
SET @Txt455 = CONCAT('Merma por uso ', ISNULL(CONVERT(VARCHAR(10), @Motr), ''), ', ORD: ', @IordOrig);
SET @Txt457 = CONCAT('Merma - Descuento stock ORD', @IordNueva);

BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.DAT_MB51
        WHERE DOCP = @IdFolOrig
          AND TRY_CONVERT(INT, CLSM) = 456
          AND ART = @ArtOrig
          AND ABS(ISNULL(CTDA, 0) - @QtyAbs) < 0.0001
    )
    BEGIN
        EXEC dbo.sp_ordenes_trabajo_registrar_mb51
            @SUC = @Suc,
            @ART = @ArtOrig,
            @CTDA = @QtyAbs,
            @TXT = @Txt456,
            @DOCP = @IdFolOrig,
            @USR = @UserExec,
            @CLSM = '456';
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.DAT_MB51
        WHERE DOCP = @IdFolOrig
          AND TRY_CONVERT(INT, CLSM) = 455
          AND ART = @ArtOrig
          AND ABS(ISNULL(CTDA, 0) - @QtyNeg) < 0.0001
    )
    BEGIN
        EXEC dbo.sp_ordenes_trabajo_registrar_mb51
            @SUC = @Suc,
            @ART = @ArtOrig,
            @CTDA = @QtyNeg,
            @TXT = @Txt455,
            @DOCP = @IdFolOrig,
            @USR = @UserExec,
            @CLSM = '455';
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.DAT_MB51
        WHERE DOCP = @IdFolOrig
          AND TRY_CONVERT(INT, CLSM) = 457
          AND ART = @ArtNuevo
          AND ABS(ISNULL(CTDA, 0) - @QtyNeg) < 0.0001
    )
    BEGIN
        EXEC dbo.sp_ordenes_trabajo_registrar_mb51
            @SUC = @Suc,
            @ART = @ArtNuevo,
            @CTDA = @QtyNeg,
            @TXT = @Txt457,
            @DOCP = @IdFolOrig,
            @USR = @UserExec,
            @CLSM = '457';
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT
    @IordOrig AS IORD_ORIG,
    @IordNueva AS IORD_NUEVA,
    @IdFolOrig AS IDFOL_ORIG,
    @ArtOrig AS ART_ORIG,
    @ArtNuevo AS ART_NUEVO,
    @CtdCM AS CTD_C_M,
    @Motr AS MOTR;
