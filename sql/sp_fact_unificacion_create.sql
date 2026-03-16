SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_fact_unificacion_create
  @IDFOLS_JSON NVARCHAR(MAX),
  @USUARIO NVARCHAR(120) = NULL,
  @COMENTARIO NVARCHAR(500) = NULL,
  @SUC NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idFolsJson NVARCHAR(MAX) = LTRIM(RTRIM(ISNULL(@IDFOLS_JSON, '')));
  DECLARE @usuarioNorm NVARCHAR(120) = LTRIM(RTRIM(ISNULL(@USUARIO, '')));
  DECLARE @comentarioNorm NVARCHAR(500) = NULLIF(LTRIM(RTRIM(ISNULL(@COMENTARIO, ''))), '');
  DECLARE @sucNorm NVARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));

  IF @idFolsJson = ''
    SET @idFolsJson = '[]';

  IF ISJSON(@idFolsJson) <> 1
    THROW 51120, 'El payload idFols debe ser JSON válido', 1;

  IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NULL
    THROW 51120, 'No existe tabla FAC_SVR_SHAP', 1;
  IF OBJECT_ID('dbo.FAC_CTRL_GRUP_MASV', 'U') IS NULL
    THROW 51120, 'No existe tabla FAC_CTRL_GRUP_MASV. Ejecute sql/fact_unificacion_schema.sql', 1;
  IF OBJECT_ID('dbo.sp_fact_unificacion_preview', 'P') IS NULL
    THROW 51120, 'No existe dbo.sp_fact_unificacion_preview. Ejecute sql/sp_fact_unificacion_preview.sql', 1;

  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IDFOL') IS NULL
    THROW 51120, 'FAC_SVR_SHAP no contiene IDFOL', 1;
  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'ESTATUS') IS NULL
    THROW 51120, 'FAC_SVR_SHAP no contiene ESTATUS', 1;
  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IMPT') IS NULL
    THROW 51120, 'FAC_SVR_SHAP no contiene IMPT', 1;
  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'GRUPMASI') IS NULL
    THROW 51120, 'FAC_SVR_SHAP no contiene GRUPMASI. Ejecute sql/fact_unificacion_schema.sql', 1;

  DECLARE @preview TABLE (
    VALIDO BIT,
    MENSAJE NVARCHAR(400),
    CANTIDAD INT,
    TOTAL DECIMAL(18, 2),
    CLIEN NVARCHAR(255),
    FORMAPAGO NVARCHAR(120),
    TIPOVTA NVARCHAR(120),
    USOCFDI NVARCHAR(120),
    RFCEMISOR NVARCHAR(120),
    METODODEPAGO NVARCHAR(120),
    RFCRECEPTOR NVARCHAR(120),
    RAZONSOCIALRECEPTOR NVARCHAR(255),
    TIPOFACT NVARCHAR(120),
    SUC NVARCHAR(40),
    REQF INT,
    FCNS NVARCHAR(40),
    BLOQUEOS_JSON NVARCHAR(MAX),
    IDFOLS_JSON NVARCHAR(MAX)
  );

  INSERT INTO @preview
  EXEC dbo.sp_fact_unificacion_preview
    @IDFOLS_JSON = @idFolsJson,
    @SUC = @sucNorm;

  DECLARE @isValid BIT = ISNULL((SELECT TOP 1 VALIDO FROM @preview), 0);
  DECLARE @previewMsg NVARCHAR(400) = ISNULL((SELECT TOP 1 MENSAJE FROM @preview), N'Selección inválida');
  DECLARE @cantidad INT = ISNULL((SELECT TOP 1 CANTIDAD FROM @preview), 0);
  DECLARE @total DECIMAL(18, 2) = ISNULL((SELECT TOP 1 TOTAL FROM @preview), 0);
  DECLARE @clien NVARCHAR(255) = ISNULL((SELECT TOP 1 CLIEN FROM @preview), '');
  DECLARE @formaPago NVARCHAR(120) = ISNULL((SELECT TOP 1 FORMAPAGO FROM @preview), '');
  DECLARE @tipoVta NVARCHAR(120) = ISNULL((SELECT TOP 1 TIPOVTA FROM @preview), '');
  DECLARE @usoCfdi NVARCHAR(120) = ISNULL((SELECT TOP 1 USOCFDI FROM @preview), '');
  DECLARE @rfcEmisor NVARCHAR(120) = ISNULL((SELECT TOP 1 RFCEMISOR FROM @preview), '');
  DECLARE @metodoPago NVARCHAR(120) = ISNULL((SELECT TOP 1 METODODEPAGO FROM @preview), '');
  DECLARE @rfcReceptor NVARCHAR(120) = ISNULL((SELECT TOP 1 RFCRECEPTOR FROM @preview), '');
  DECLARE @razonSocial NVARCHAR(255) = ISNULL((SELECT TOP 1 RAZONSOCIALRECEPTOR FROM @preview), '');
  DECLARE @tipoFact NVARCHAR(120) = ISNULL((SELECT TOP 1 TIPOFACT FROM @preview), 'INDIVIDUAL');
  DECLARE @sucSel NVARCHAR(40) = ISNULL((SELECT TOP 1 SUC FROM @preview), '');
  DECLARE @reqf INT = ISNULL((SELECT TOP 1 REQF FROM @preview), 0);
  DECLARE @fcns NVARCHAR(40) = ISNULL((SELECT TOP 1 FCNS FROM @preview), '');
  DECLARE @idFolsNormalizedJson NVARCHAR(MAX) = ISNULL((SELECT TOP 1 IDFOLS_JSON FROM @preview), N'[]');

  IF @isValid <> 1
    THROW 51121, @previewMsg, 1;

  IF @cantidad < 2
    THROW 51121, 'Se requieren al menos 2 tickets para unificación', 1;

  IF OBJECT_ID('tempdb..#SEL_IDS') IS NOT NULL
    DROP TABLE #SEL_IDS;
  CREATE TABLE #SEL_IDS (
    IDFOL NVARCHAR(255) NOT NULL PRIMARY KEY
  );

  INSERT INTO #SEL_IDS (IDFOL)
  SELECT DISTINCT UPPER(LTRIM(RTRIM([value])))
  FROM OPENJSON(@idFolsNormalizedJson)
  WHERE LTRIM(RTRIM(ISNULL([value], ''))) <> '';

  IF (SELECT COUNT(1) FROM #SEL_IDS) <> @cantidad
    THROW 51122, 'No fue posible normalizar la selección de folios', 1;

  DECLARE @grupoId NVARCHAR(255) = '';
  DECLARE @idFolUnificado NVARCHAR(255) = '';
  DECLARE @yyyymmdd CHAR(8) = CONVERT(CHAR(8), GETDATE(), 112);
  DECLARE @prefix NVARCHAR(255);
  DECLARE @nextConsec INT;
  DECLARE @lockResult INT = -1;

  DECLARE @sucForGroup NVARCHAR(40) = UPPER(LTRIM(RTRIM(ISNULL(@sucSel, @sucNorm))));
  SET @sucForGroup = REPLACE(REPLACE(REPLACE(@sucForGroup, ' ', ''), '-', ''), '_', '');
  IF @sucForGroup = '' SET @sucForGroup = 'SUC';

  SET @prefix = CONCAT('U', @sucForGroup, @yyyymmdd);

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    EXEC @lockResult = sp_getapplock
      @Resource = 'FACT_UNIFICACION_MASIVA',
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 15000;

    IF ISNULL(@lockResult, -1) < 0
      THROW 51123, 'No fue posible adquirir lock para unificación', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.FAC_SVR_SHAP WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, '')))) = 'EXCEL GEN'
    )
      THROW 51124, 'Existe facturación en proceso (ESTATUS = EXCEL GEN)', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.FAC_CTRL_GRUP_MASV WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, '')))) = 'PROCESANDO'
    )
      THROW 51125, 'Existe otro grupo de unificación en estatus PROCESANDO', 1;

    SELECT
      @nextConsec = ISNULL(MAX(TRY_CONVERT(INT, RIGHT(GRUPMAS, 4))), 0) + 1
    FROM dbo.FAC_CTRL_GRUP_MASV WITH (UPDLOCK, HOLDLOCK)
    WHERE GRUPMAS LIKE (@prefix + '%');

    IF @nextConsec IS NULL SET @nextConsec = 1;
    IF @nextConsec < 1 SET @nextConsec = 1;

    SET @grupoId = CONCAT(@prefix, RIGHT('0000' + CONVERT(VARCHAR(10), @nextConsec), 4));

    WHILE EXISTS (SELECT 1 FROM dbo.FAC_CTRL_GRUP_MASV WHERE GRUPMAS = @grupoId)
       OR EXISTS (
         SELECT 1
         FROM dbo.FAC_SVR_SHAP
         WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@grupoId)
       )
    BEGIN
      SET @nextConsec = @nextConsec + 1;
      IF @nextConsec > 9999
        THROW 51126, 'No hay consecutivos disponibles para GRUPMAS', 1;
      SET @grupoId = CONCAT(@prefix, RIGHT('0000' + CONVERT(VARCHAR(10), @nextConsec), 4));
    END;

    INSERT INTO dbo.FAC_CTRL_GRUP_MASV (GRUPMAS, FCNCREA, NFAC, ESTATUS)
    VALUES (@grupoId, GETDATE(), @cantidad, 'PROCESANDO');

    UPDATE F
    SET
      ESTATUS = 'UNIFICADO',
      GRUPMASI = @grupoId
    FROM dbo.FAC_SVR_SHAP F WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    INNER JOIN #SEL_IDS S
      ON UPPER(LTRIM(RTRIM(ISNULL(F.IDFOL, '')))) = S.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(F.ESTATUS, '')))) = 'PENDIENTE';

    IF @@ROWCOUNT <> @cantidad
      THROW 51127, 'Uno o más tickets ya no están elegibles para unificación', 1;

    SET @idFolUnificado = @grupoId;

    IF OBJECT_ID('dbo.FACT_TICKET_SHP', 'U') IS NOT NULL
       AND COL_LENGTH('dbo.FACT_TICKET_SHP', 'FACUNI') IS NOT NULL
       AND COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDFOL') IS NOT NULL
    BEGIN
      UPDATE T
      SET
        FACUNI = UPPER(LTRIM(RTRIM(ISNULL(T.IDFOL, '')))),
        IDFOL = @idFolUnificado
      FROM dbo.FACT_TICKET_SHP T
      INNER JOIN #SEL_IDS S
        ON UPPER(LTRIM(RTRIM(ISNULL(T.IDFOL, '')))) = S.IDFOL;
    END;

    DECLARE @insertCols NVARCHAR(MAX) = N'[IDFOL]';
    DECLARE @insertVals NVARCHAR(MAX) = N'@pIDFOL';
    DECLARE @sqlInsert NVARCHAR(MAX);

    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'CLIEN') IS NOT NULL
    BEGIN
      SET @insertCols += N', [CLIEN]';
      SET @insertVals += N', TRY_CONVERT(FLOAT, @pCLIEN)';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FCN') IS NOT NULL
    BEGIN
      SET @insertCols += N', [FCN]';
      SET @insertVals += N', GETDATE()';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IMPT') IS NOT NULL
    BEGIN
      SET @insertCols += N', [IMPT]';
      SET @insertVals += N', @pIMPT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'TIPOVTA') IS NOT NULL
    BEGIN
      SET @insertCols += N', [TIPOVTA]';
      SET @insertVals += N', @pTIPOVTA';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'REQF') IS NOT NULL
    BEGIN
      SET @insertCols += N', [REQF]';
      SET @insertVals += N', @pREQF';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RQFAC') IS NOT NULL
    BEGIN
      SET @insertCols += N', [RQFAC]';
      SET @insertVals += N', @pREQF';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FCNS') IS NOT NULL
    BEGIN
      SET @insertCols += N', [FCNS]';
      SET @insertVals += N', @pFCNS';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FormaPago') IS NOT NULL
    BEGIN
      SET @insertCols += N', [FormaPago]';
      SET @insertVals += N', @pFORMA';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'Tipofact') IS NOT NULL
    BEGIN
      SET @insertCols += N', [Tipofact]';
      SET @insertVals += N', @pTIPOFACT';
    END;
    ELSE IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'TIPOFACT') IS NOT NULL
    BEGIN
      SET @insertCols += N', [TIPOFACT]';
      SET @insertVals += N', @pTIPOFACT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'ESTATUS') IS NOT NULL
    BEGIN
      SET @insertCols += N', [ESTATUS]';
      SET @insertVals += N', ''PENDIENTE''';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'GRUPMASI') IS NOT NULL
    BEGIN
      SET @insertCols += N', [GRUPMASI]';
      SET @insertVals += N', @pGRUPO';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RfcEmisor') IS NOT NULL
    BEGIN
      SET @insertCols += N', [RfcEmisor]';
      SET @insertVals += N', @pRFCEMI';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'UsoCfdi') IS NOT NULL
    BEGIN
      SET @insertCols += N', [UsoCfdi]';
      SET @insertVals += N', @pUSOCFDI';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'MetodoDePago') IS NOT NULL
    BEGIN
      SET @insertCols += N', [MetodoDePago]';
      SET @insertVals += N', @pMETODO';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RfcReceptor') IS NOT NULL
    BEGIN
      SET @insertCols += N', [RfcReceptor]';
      SET @insertVals += N', @pRFCREC';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RazonSocialReceptor') IS NOT NULL
    BEGIN
      SET @insertCols += N', [RazonSocialReceptor]';
      SET @insertVals += N', @pRAZON';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'SUC') IS NOT NULL
    BEGIN
      SET @insertCols += N', [SUC]';
      SET @insertVals += N', @pSUC';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'AUT') IS NOT NULL
    BEGIN
      SET @insertCols += N', [AUT]';
      SET @insertVals += N', @pTIPOVTA';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'COM') IS NOT NULL
    BEGIN
      SET @insertCols += N', [COM]';
      SET @insertVals += N', @pCOM';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'MOD') IS NOT NULL
    BEGIN
      SET @insertCols += N', [MOD]';
      SET @insertVals += N', @pMOD';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FCNR') IS NOT NULL
    BEGIN
      SET @insertCols += N', [FCNR]';
      SET @insertVals += N', GETDATE()';
    END;

    DECLARE @comRegistro NVARCHAR(500) = NULL;
    IF @comentarioNorm IS NOT NULL
      SET @comRegistro = LEFT(CONCAT('UNIFICACION ', @usuarioNorm, ': ', @comentarioNorm), 500);
    ELSE
      SET @comRegistro = LEFT(CONCAT('UNIFICACION ', @usuarioNorm), 500);

    SET @sqlInsert = N'
      INSERT INTO dbo.FAC_SVR_SHAP (' + @insertCols + N')
      VALUES (' + @insertVals + N');';

    DECLARE @tipoVtaInsert NVARCHAR(120) = CASE
      WHEN @tipoVta = '' THEN 'VF'
      ELSE @tipoVta
    END;
    DECLARE @reqfInsert INT = CASE
      WHEN ISNULL(@reqf, 0) = 1 THEN 1
      ELSE 0
    END;
    DECLARE @fcnsInsert NVARCHAR(40) = CASE
      WHEN @fcns = '' THEN CONVERT(NVARCHAR(40), GETDATE(), 112)
      ELSE @fcns
    END;
    DECLARE @tipoFactInsert NVARCHAR(120) = CASE
      WHEN @tipoFact = '' THEN 'INDIVIDUAL'
      ELSE @tipoFact
    END;

    EXEC sys.sp_executesql
      @sqlInsert,
      N'@pIDFOL NVARCHAR(255),
        @pCLIEN NVARCHAR(255),
        @pIMPT DECIMAL(18,2),
        @pTIPOVTA NVARCHAR(120),
        @pREQF INT,
        @pFCNS NVARCHAR(40),
        @pFORMA NVARCHAR(120),
        @pTIPOFACT NVARCHAR(120),
        @pGRUPO NVARCHAR(255),
        @pRFCEMI NVARCHAR(120),
        @pUSOCFDI NVARCHAR(120),
        @pMETODO NVARCHAR(120),
        @pRFCREC NVARCHAR(120),
        @pRAZON NVARCHAR(255),
        @pSUC NVARCHAR(40),
        @pCOM NVARCHAR(500),
        @pMOD NVARCHAR(255)',
      @pIDFOL = @idFolUnificado,
      @pCLIEN = @clien,
      @pIMPT = @total,
      @pTIPOVTA = @tipoVtaInsert,
      @pREQF = @reqfInsert,
      @pFCNS = @fcnsInsert,
      @pFORMA = @formaPago,
      @pTIPOFACT = @tipoFactInsert,
      @pGRUPO = @grupoId,
      @pRFCEMI = @rfcEmisor,
      @pUSOCFDI = @usoCfdi,
      @pMETODO = @metodoPago,
      @pRFCREC = @rfcReceptor,
      @pRAZON = @razonSocial,
      @pSUC = @sucSel,
      @pCOM = @comRegistro,
      @pMOD = N'UNIFICACION';

    UPDATE dbo.FAC_CTRL_GRUP_MASV
    SET ESTATUS = 'UNIFICADO'
    WHERE GRUPMAS = @grupoId;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    DECLARE @ticketsJson NVARCHAR(MAX) = N'[]';
    SELECT @ticketsJson = N'[' + STUFF((
      SELECT N',"' + STRING_ESCAPE(IDFOL, 'json') + N'"'
      FROM #SEL_IDS
      ORDER BY IDFOL
      FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)'), 1, 1, N'') + N']';

    SELECT
      @grupoId AS GRUPO_ID,
      @idFolUnificado AS IDFOL_UNIFICADO,
      @total AS TOTAL,
      @cantidad AS TICKETS_ORIGEN,
      @ticketsJson AS TICKETS_ORIGEN_JSON,
      'UNIFICADO' AS ESTATUS_FINAL;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
