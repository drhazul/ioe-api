CREATE OR ALTER PROCEDURE dbo.sp_fact_sync_folio_vf
  @IDFOL NVARCHAR(255),
  @EVENTO NVARCHAR(40) = NULL,
  @FORCE BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @eventoNorm NVARCHAR(40) = UPPER(LTRIM(RTRIM(ISNULL(@EVENTO, 'MANUAL'))));

  DECLARE @sql NVARCHAR(MAX);

  DECLARE @folioReqfExpr NVARCHAR(64) = N'0';
  DECLARE @folioFechaExpr NVARCHAR(64) = N'GETDATE()';
  DECLARE @folioWhere NVARCHAR(128) = N'IDFOL = @pIDFOL';
  DECLARE @folioOrder NVARCHAR(200) = N'ORDER BY CASE WHEN IDFOL = @pIDFOL THEN 0 ELSE 1 END';

  DECLARE @idfolActual NVARCHAR(255) = '';
  DECLARE @suc NVARCHAR(255) = '';
  DECLARE @aut NVARCHAR(20) = '';
  DECLARE @clien FLOAT = NULL;
  DECLARE @clienFac FLOAT = NULL;
  DECLARE @facClienType SYSNAME = NULL;
  DECLARE @reqfRaw INT = 0;
  DECLARE @reqf INT = 0;
  DECLARE @syncEligible BIT = 0;
  DECLARE @folioFecha DATETIME = NULL;
  DECLARE @fechaProceso DATETIME = GETDATE();
  DECLARE @fcns NVARCHAR(20);

  DECLARE @ivaIntegrado INT = 1;
  DECLARE @remainingExpr NVARCHAR(128);
  DECLARE @ctddfExpr NVARCHAR(64);
  DECLARE @totalBase MONEY = 0;
  DECLARE @subtotal MONEY = 0;
  DECLARE @iva MONEY = 0;
  DECLARE @totalFinal MONEY = 0;
  DECLARE @epsilon MONEY = 0.0001;

  DECLARE @folFormTable SYSNAME = NULL;
  DECLARE @folFormObjId INT = NULL;
  DECLARE @formaHasAut BIT = 0;
  DECLARE @formaOrder NVARCHAR(256) = N'ORDER BY ABS(TRY_CONVERT(MONEY, IMPP)) DESC';
  DECLARE @formaPrincipal NVARCHAR(40) = '';
  DECLARE @formaAut NVARCHAR(255) = NULL;
  DECLARE @formaSat NVARCHAR(80) = NULL;
  DECLARE @formaMonto MONEY = 0;
  DECLARE @tieneFormaCredito BIT = 0;

  DECLARE @razonSocial NVARCHAR(255) = NULL;
  DECLARE @rfcReceptor NVARCHAR(40) = NULL;
  DECLARE @rfcEmisor NVARCHAR(40) = NULL;
  DECLARE @usoCfdi NVARCHAR(40) = NULL;

  DECLARE @headerExists BIT = 0;
  DECLARE @imptAnterior MONEY = NULL;
  DECLARE @estatusFinal NVARCHAR(40) = 'PENDIENTE';
  DECLARE @modFinal NVARCHAR(255) = '';
  DECLARE @tipoFact NVARCHAR(40) = 'INDIVIDUAL';
  DECLARE @metodoPago NVARCHAR(20) = 'PUE';

  DECLARE @setList NVARCHAR(MAX) = N'';
  DECLARE @insertCols NVARCHAR(MAX) = N'[IDFOL]';
  DECLARE @insertVals NVARCHAR(MAX) = N'@pIDFOL';

  DECLARE @detailCols NVARCHAR(MAX) = N'';
  DECLARE @detailSelect NVARCHAR(MAX) = N'';
  DECLARE @cantidadExpr NVARCHAR(256);
  DECLARE @valorUnitExpr NVARCHAR(256);
  DECLARE @importeExpr NVARCHAR(512);
  DECLARE @detailRows INT = 0;

  DECLARE @tramRows INT = 0;

  IF @idfolNorm = ''
    THROW 51040, 'IDFOL es requerido para sincronización de facturación', 1;

  IF OBJECT_ID('dbo.PV_CTR_FOL_ASVR') IS NULL
    THROW 51040, 'No existe dbo.PV_CTR_FOL_ASVR', 1;
  IF OBJECT_ID('dbo.FAC_SVR_SHAP') IS NULL
    THROW 51041, 'No existe dbo.FAC_SVR_SHAP', 1;
  IF OBJECT_ID('dbo.PV_TICKET_LOG') IS NULL
    THROW 51042, 'No existe dbo.PV_TICKET_LOG', 1;
  IF OBJECT_ID('dbo.FACT_TICKET_SHP') IS NULL
    THROW 51043, 'No existe dbo.FACT_TICKET_SHP', 1;
  IF OBJECT_ID('dbo.DAT_SUC') IS NULL
    THROW 51044, 'No existe dbo.DAT_SUC', 1;
  IF OBJECT_ID('dbo.DAT_ART') IS NULL
    THROW 51049, 'No existe dbo.DAT_ART', 1;

  IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'REQF') IS NOT NULL
    SET @folioReqfExpr = N'TRY_CONVERT(INT, REQF)';
  ELSE IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'RQFAC') IS NOT NULL
    SET @folioReqfExpr = N'TRY_CONVERT(INT, RQFAC)';

  IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'FCNM') IS NOT NULL
    SET @folioFechaExpr = N'TRY_CONVERT(DATETIME, FCNM)';
  ELSE IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'FCN') IS NOT NULL
    SET @folioFechaExpr = N'TRY_CONVERT(DATETIME, FCN)';

  IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'IDFOLINICIAL') IS NOT NULL
    SET @folioWhere = @folioWhere + N' OR IDFOLINICIAL = @pIDFOL';

  IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'FCN') IS NOT NULL
    SET @folioOrder = @folioOrder + N', FCN DESC';
  IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'FCNM') IS NOT NULL
    SET @folioOrder = @folioOrder + N', FCNM DESC';

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SET @sql = N'
      SELECT TOP 1
        @pIDFOL_OUT = LTRIM(RTRIM(ISNULL(IDFOL, ''''))),
        @pSUC = LTRIM(RTRIM(ISNULL(SUC, ''''))),
        @pAUT = UPPER(LTRIM(RTRIM(ISNULL(AUT, '''')))),
        @pCLIEN = TRY_CONVERT(FLOAT, CLIEN),
        @pREQF = ' + @folioReqfExpr + N',
        @pFCN = ' + @folioFechaExpr + N'
      FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
      WHERE ' + @folioWhere + N'
      ' + @folioOrder + N';';

    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pIDFOL_OUT NVARCHAR(255) OUTPUT, @pSUC NVARCHAR(255) OUTPUT, @pAUT NVARCHAR(20) OUTPUT, @pCLIEN FLOAT OUTPUT, @pREQF INT OUTPUT, @pFCN DATETIME OUTPUT',
      @pIDFOL = @idfolNorm,
      @pIDFOL_OUT = @idfolActual OUTPUT,
      @pSUC = @suc OUTPUT,
      @pAUT = @aut OUTPUT,
      @pCLIEN = @clien OUTPUT,
      @pREQF = @reqfRaw OUTPUT,
      @pFCN = @folioFecha OUTPUT;

    IF ISNULL(@idfolActual, '') = ''
      THROW 51045, 'No existe folio para sincronización de facturación', 1;

    IF @suc = ''
      THROW 51046, 'El folio no tiene SUC para sincronización de facturación', 1;

    SET @reqf = CASE WHEN ISNULL(@reqfRaw, 0) = 1 THEN 1 ELSE 0 END;
    SET @syncEligible = CASE WHEN @aut = 'VF' AND @reqf = 1 THEN 1 ELSE 0 END;

    IF @syncEligible = 0 AND @FORCE = 0
    BEGIN
      IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDFOL') IS NOT NULL
      BEGIN
        DELETE FROM dbo.FACT_TICKET_SHP
        WHERE IDFOL = @idfolActual;
      END;

      IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IDFOL') IS NOT NULL
      BEGIN
        DELETE FROM dbo.FAC_SVR_SHAP
        WHERE IDFOL = @idfolActual;
      END;

      IF @startedTran = 1 AND @@TRANCOUNT > 0
        COMMIT TRANSACTION;

      SELECT
        @idfolActual AS IDFOL,
        @aut AS AUT,
        @reqf AS REQF,
        CAST(0 AS BIT) AS SYNC_APPLIED,
        @eventoNorm AS EVENTO;
      RETURN;
    END;
    SET @clienFac = @clien;
    SET @fechaProceso = ISNULL(@folioFecha, GETDATE());
    SET @fcns = CONCAT(DAY(@fechaProceso), MONTH(@fechaProceso), YEAR(@fechaProceso));

    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'CLIEN') IS NOT NULL
    BEGIN
      SELECT TOP 1
        @facClienType = LOWER(TY.name)
      FROM sys.columns C
      INNER JOIN sys.types TY
        ON C.user_type_id = TY.user_type_id
      WHERE C.object_id = OBJECT_ID('dbo.FAC_SVR_SHAP')
        AND UPPER(C.name) = 'CLIEN';

      IF @clienFac IS NOT NULL
      BEGIN
        IF @facClienType = 'tinyint'
          AND (@clienFac <> FLOOR(@clienFac) OR @clienFac < 0 OR @clienFac > 255)
          SET @clienFac = NULL;
        IF @facClienType = 'smallint'
          AND (@clienFac <> FLOOR(@clienFac) OR @clienFac < -32768 OR @clienFac > 32767)
          SET @clienFac = NULL;
        IF @facClienType = 'int'
          AND (@clienFac <> FLOOR(@clienFac) OR @clienFac < -2147483648 OR @clienFac > 2147483647)
          SET @clienFac = NULL;
      END
    END;

    SELECT TOP 1
      @ivaIntegrado = TRY_CONVERT(INT, IVA_INTEGRADO)
    FROM dbo.DAT_SUC
    WHERE SUC = @suc;
    SET @ivaIntegrado = ISNULL(@ivaIntegrado, 1);

    SET @remainingExpr = CASE
      WHEN COL_LENGTH('dbo.PV_TICKET_LOG', 'CTDDF') IS NOT NULL
        THEN N'ISNULL(CTD, 0) - ISNULL(CTDDF, 0)'
      ELSE N'ISNULL(CTD, 0)'
    END;
    SET @ctddfExpr = CASE
      WHEN COL_LENGTH('dbo.PV_TICKET_LOG', 'CTDDF') IS NOT NULL
        THEN N'T.CTDDF'
      ELSE N'NULL'
    END;

    SET @sql = N'
      SELECT
        @pTOTAL_BASE = ROUND(SUM(CASE
          WHEN (' + @remainingExpr + N') > 0
            THEN (' + @remainingExpr + N') * ISNULL(PVTA, 0)
          ELSE 0
        END), 2)
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @pIDFOL;';

    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pTOTAL_BASE MONEY OUTPUT',
      @pIDFOL = @idfolActual,
      @pTOTAL_BASE = @totalBase OUTPUT;

    SET @totalBase = ISNULL(@totalBase, 0);
    IF @ivaIntegrado = -1
    BEGIN
      SET @totalFinal = ROUND(@totalBase, 2);
      SET @subtotal = ROUND(@totalFinal / 1.16, 2);
      SET @iva = ROUND(@totalFinal - @subtotal, 2);
    END
    ELSE
    BEGIN
      IF @reqf = 1
      BEGIN
        SET @subtotal = ROUND(@totalBase, 2);
        SET @iva = ROUND(@subtotal * 0.16, 2);
        SET @totalFinal = ROUND(@subtotal + @iva, 2);
      END
      ELSE
      BEGIN
        SET @totalFinal = ROUND(@totalBase, 2);
        SET @subtotal = ROUND(@totalFinal / 1.16, 2);
        SET @iva = ROUND(@totalFinal - @subtotal, 2);
      END
    END

    IF OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR') IS NOT NULL
      SET @folFormTable = 'dbo.PV_CTR_FOL_FORM_SVR';
    ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORM') IS NOT NULL
      SET @folFormTable = 'dbo.PV_CTR_FOL_FORM';

    IF @folFormTable IS NOT NULL
    BEGIN
      SET @folFormObjId = OBJECT_ID(@folFormTable);
      SET @formaHasAut = CASE
        WHEN EXISTS (
          SELECT 1
          FROM sys.columns
          WHERE object_id = @folFormObjId
            AND UPPER(name) = 'AUT'
        ) THEN 1 ELSE 0 END;

      IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = @folFormObjId
          AND UPPER(name) = 'FCN'
      )
        SET @formaOrder = @formaOrder + N', FCN DESC';
      IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = @folFormObjId
          AND UPPER(name) = 'IDF'
      )
        SET @formaOrder = @formaOrder + N', IDF DESC';

      SET @sql = N'
        SELECT TOP 1
          @pFORM = UPPER(LTRIM(RTRIM(ISNULL(FORM, '''')))),
          @pAUT = ' + CASE WHEN @formaHasAut = 1
            THEN N'NULLIF(LTRIM(RTRIM(ISNULL(AUT, ''''))), '''')'
            ELSE N'NULL'
          END + N',
          @pIMPP = ABS(TRY_CONVERT(MONEY, IMPP))
        FROM ' + @folFormTable + N'
        WHERE IDFOL = @pIDFOL
        ' + @formaOrder + N';';

      EXEC sys.sp_executesql
        @sql,
        N'@pIDFOL NVARCHAR(255), @pFORM NVARCHAR(40) OUTPUT, @pAUT NVARCHAR(255) OUTPUT, @pIMPP MONEY OUTPUT',
        @pIDFOL = @idfolActual,
        @pFORM = @formaPrincipal OUTPUT,
        @pAUT = @formaAut OUTPUT,
        @pIMPP = @formaMonto OUTPUT;

      SET @sql = N'
        SELECT
          @pHAS_CREDITO = CASE
            WHEN EXISTS (
              SELECT 1
              FROM ' + @folFormTable + N'
              WHERE IDFOL = @pIDFOL
                AND UPPER(LTRIM(RTRIM(ISNULL(FORM, '''')))) = ''CREDITO''
            )
            THEN 1 ELSE 0
          END;';

      EXEC sys.sp_executesql
        @sql,
        N'@pIDFOL NVARCHAR(255), @pHAS_CREDITO BIT OUTPUT',
        @pIDFOL = @idfolActual,
        @pHAS_CREDITO = @tieneFormaCredito OUTPUT;
    END;

    IF @formaPrincipal <> '' AND OBJECT_ID('dbo.DAT_FORM') IS NOT NULL
    BEGIN
      SELECT TOP 1
        @formaSat = NULLIF(LTRIM(RTRIM(ASPEL)), '')
      FROM dbo.DAT_FORM
      WHERE UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) = @formaPrincipal;
    END;
    IF ISNULL(@formaSat, '') = ''
      SET @formaSat = NULLIF(@formaPrincipal, '');

    IF TRY_CONVERT(INT, @formaSat) IS NOT NULL
      SET @formaSat = RIGHT('00' + CONVERT(VARCHAR(10), TRY_CONVERT(INT, @formaSat)), 2);

    SET @usoCfdi = UPPER(LTRIM(RTRIM(ISNULL(@usoCfdi, ''))));

    SET @tipoFact = CASE WHEN ISNULL(@tieneFormaCredito, 0) = 1 THEN 'CREDITO' ELSE 'INDIVIDUAL' END;

    IF OBJECT_ID('dbo.FACT_CLIENT_SHP') IS NOT NULL
      AND @clien IS NOT NULL
      AND @clien > 0
    BEGIN
      SELECT TOP 1
        @razonSocial = NULLIF(LTRIM(RTRIM(ISNULL(RazonSocialReceptor, ''))), ''),
        @rfcReceptor = NULLIF(LTRIM(RTRIM(ISNULL(RfcReceptor, ''))), ''),
        @rfcEmisor = NULLIF(LTRIM(RTRIM(ISNULL(RfcEmisor, ''))), ''),
        @usoCfdi = NULLIF(LTRIM(RTRIM(ISNULL(UsoCfdi, ''))), '')
      FROM dbo.FACT_CLIENT_SHP
      WHERE IDC = @clien;
    END;

    SELECT TOP 1
      @headerExists = 1,
      @imptAnterior = TRY_CONVERT(MONEY, IMPT)
    FROM dbo.FAC_SVR_SHAP WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE IDFOL = @idfolActual;

    SET @estatusFinal = CASE WHEN @totalFinal > @epsilon THEN 'PENDIENTE' ELSE 'VTA DEV' END;
    SET @modFinal = '';
    IF @headerExists = 1 AND @imptAnterior IS NOT NULL
    BEGIN
      IF ABS(@totalFinal) <= @epsilon
        SET @modFinal = CONCAT('DEV TOTAL ', CONVERT(VARCHAR(50), ROUND(@imptAnterior, 2)));
      ELSE IF @totalFinal + @epsilon < @imptAnterior
        SET @modFinal = CONCAT('DEV PARCIAL IMPT ANT ', CONVERT(VARCHAR(50), ROUND(@imptAnterior, 2)));
    END;

    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IDFOL') IS NULL
      THROW 51047, 'FAC_SVR_SHAP no contiene columna IDFOL', 1;

    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'SUC') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[SUC] = @pSUC';
      SET @insertCols += N', [SUC]';
      SET @insertVals += N', @pSUC';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'CLIEN') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[CLIEN] = @pCLIEN';
      SET @insertCols += N', [CLIEN]';
      SET @insertVals += N', @pCLIEN';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FCN') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[FCN] = @pFCN';
      SET @insertCols += N', [FCN]';
      SET @insertVals += N', @pFCN';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FCNS') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[FCNS] = @pFCNS';
      SET @insertCols += N', [FCNS]';
      SET @insertVals += N', @pFCNS';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FormaPago') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[FormaPago] = @pFORMA';
      SET @insertCols += N', [FormaPago]';
      SET @insertVals += N', @pFORMA';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'TarjetaUltimos4Digitos') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[TarjetaUltimos4Digitos] = @pNAUT';
      SET @insertCols += N', [TarjetaUltimos4Digitos]';
      SET @insertVals += N', @pNAUT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'FormaPagoSAT') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[FormaPagoSAT] = @pFORMASAT';
      SET @insertCols += N', [FormaPagoSAT]';
      SET @insertVals += N', @pFORMASAT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'TIPOVTA') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[TIPOVTA] = @pTIPOVTA';
      SET @insertCols += N', [TIPOVTA]';
      SET @insertVals += N', @pTIPOVTA';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'REQF') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[REQF] = @pREQF';
      SET @insertCols += N', [REQF]';
      SET @insertVals += N', @pREQF';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RazonSocialReceptor') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[RazonSocialReceptor] = @pRAZON';
      SET @insertCols += N', [RazonSocialReceptor]';
      SET @insertVals += N', @pRAZON';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RfcReceptor') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[RfcReceptor] = @pRFCR';
      SET @insertCols += N', [RfcReceptor]';
      SET @insertVals += N', @pRFCR';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'RfcEmisor') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[RfcEmisor] = @pRFCE';
      SET @insertCols += N', [RfcEmisor]';
      SET @insertVals += N', @pRFCE';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'UsoCfdi') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[UsoCfdi] = @pUSOCFDI';
      SET @insertCols += N', [UsoCfdi]';
      SET @insertVals += N', @pUSOCFDI';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'Tipofact') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[Tipofact] = @pTIPOFACT';
      SET @insertCols += N', [Tipofact]';
      SET @insertVals += N', @pTIPOFACT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'ESTATUS') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[ESTATUS] = @pESTATUS';
      SET @insertCols += N', [ESTATUS]';
      SET @insertVals += N', @pESTATUS';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IMPT') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[IMPT] = @pIMPT';
      SET @insertCols += N', [IMPT]';
      SET @insertVals += N', @pIMPT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'MetodoDePago') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[MetodoDePago] = @pMETODO';
      SET @insertCols += N', [MetodoDePago]';
      SET @insertVals += N', @pMETODO';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'Exportacion') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[Exportacion] = @pEXPORT';
      SET @insertCols += N', [Exportacion]';
      SET @insertVals += N', @pEXPORT';
    END;
    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'MOD') IS NOT NULL
    BEGIN
      SET @setList += CASE WHEN LEN(@setList) > 0 THEN N', ' ELSE N'' END + N'[MOD] = @pMOD';
      SET @insertCols += N', [MOD]';
      SET @insertVals += N', @pMOD';
    END;

    IF @headerExists = 1
    BEGIN
      IF LEN(@setList) > 0
      BEGIN
        SET @sql = N'
          UPDATE dbo.FAC_SVR_SHAP
          SET ' + @setList + N'
          WHERE IDFOL = @pIDFOL;';

        EXEC sys.sp_executesql
          @sql,
          N'@pIDFOL NVARCHAR(255), @pSUC NVARCHAR(255), @pCLIEN FLOAT, @pFCN DATETIME, @pFCNS NVARCHAR(20), @pFORMA NVARCHAR(80), @pFORMASAT NVARCHAR(2), @pNAUT NVARCHAR(255), @pTIPOVTA NVARCHAR(20), @pREQF INT, @pRAZON NVARCHAR(255), @pRFCR NVARCHAR(40), @pRFCE NVARCHAR(40), @pUSOCFDI NVARCHAR(40), @pTIPOFACT NVARCHAR(40), @pESTATUS NVARCHAR(40), @pIMPT MONEY, @pMETODO NVARCHAR(20), @pEXPORT NVARCHAR(5), @pMOD NVARCHAR(255)',
          @pIDFOL = @idfolActual,
          @pSUC = @suc,
          @pCLIEN = @clienFac,
          @pFCN = @fechaProceso,
          @pFCNS = @fcns,
          @pFORMA = @formaSat,
          @pFORMASAT = @formaSat,
          @pNAUT = @formaAut,
          @pTIPOVTA = 'VF',
          @pREQF = @reqf,
          @pRAZON = @razonSocial,
          @pRFCR = @rfcReceptor,
          @pRFCE = @rfcEmisor,
          @pUSOCFDI = @usoCfdi,
          @pTIPOFACT = @tipoFact,
          @pESTATUS = @estatusFinal,
          @pIMPT = @totalFinal,
          @pMETODO = @metodoPago,
          @pEXPORT = '01',
          @pMOD = @modFinal;
      END
    END
    ELSE
    BEGIN
      SET @sql = N'
        INSERT INTO dbo.FAC_SVR_SHAP (' + @insertCols + N')
        VALUES (' + @insertVals + N');';

      EXEC sys.sp_executesql
        @sql,
        N'@pIDFOL NVARCHAR(255), @pSUC NVARCHAR(255), @pCLIEN FLOAT, @pFCN DATETIME, @pFCNS NVARCHAR(20), @pFORMA NVARCHAR(80), @pFORMASAT NVARCHAR(2), @pNAUT NVARCHAR(255), @pTIPOVTA NVARCHAR(20), @pREQF INT, @pRAZON NVARCHAR(255), @pRFCR NVARCHAR(40), @pRFCE NVARCHAR(40), @pUSOCFDI NVARCHAR(40), @pTIPOFACT NVARCHAR(40), @pESTATUS NVARCHAR(40), @pIMPT MONEY, @pMETODO NVARCHAR(20), @pEXPORT NVARCHAR(5), @pMOD NVARCHAR(255)',
        @pIDFOL = @idfolActual,
        @pSUC = @suc,
        @pCLIEN = @clienFac,
        @pFCN = @fechaProceso,
        @pFCNS = @fcns,
        @pFORMA = @formaSat,
        @pFORMASAT = @formaSat,
        @pNAUT = @formaAut,
        @pTIPOVTA = 'VF',
        @pREQF = @reqf,
        @pRAZON = @razonSocial,
        @pRFCR = @rfcReceptor,
        @pRFCE = @rfcEmisor,
        @pUSOCFDI = @usoCfdi,
        @pTIPOFACT = @tipoFact,
        @pESTATUS = @estatusFinal,
        @pIMPT = @totalFinal,
        @pMETODO = @metodoPago,
        @pEXPORT = '01',
        @pMOD = @modFinal;
    END;

    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDFOL') IS NULL
      THROW 51048, 'FACT_TICKET_SHP no contiene columna IDFOL', 1;

    DELETE FROM dbo.FACT_TICKET_SHP
    WHERE IDFOL = @idfolActual;

    SET @cantidadExpr = N'(' + @remainingExpr + N')';
    SET @valorUnitExpr = N'CASE WHEN @pIVA = -1 THEN ROUND(ISNULL(T.PVTA, 0) / 1.16, 6) ELSE ROUND(ISNULL(T.PVTA, 0), 6) END';
    SET @importeExpr = N'ROUND((' + @cantidadExpr + N') * (' + @valorUnitExpr + N'), 2)';

    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDD') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[IDD]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'CAST(T.ID AS NVARCHAR(255))';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDFOL') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[IDFOL]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'@pIDFOL';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'UPC') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[UPC]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'T.UPC';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'NoIdentificacion') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[NoIdentificacion]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'T.ART';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'Descripcion') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[Descripcion]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'T.DES';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'Cantidad') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[Cantidad]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'' + @cantidadExpr;
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'ValorUnitario') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[ValorUnitario]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'' + @valorUnitExpr;
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'PVTAT') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[PVTAT]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'' + @importeExpr;
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'ORD') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[ORD]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'T.ORD';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDDEV') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[IDDEV]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'T.IDDEV';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'CTDD') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[CTDD]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'T.CTDD';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'CTDDF') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[CTDDF]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + @ctddfExpr;
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'ClaveProdServ') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[ClaveProdServ]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'A.CLAVESAT';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'Unidad') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[Unidad]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'A.UNIMEDSAT';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'ObjetoImp') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[ObjetoImp]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'''2''';
    END;
    IF COL_LENGTH('dbo.FACT_TICKET_SHP', 'IvaTasa') IS NOT NULL
    BEGIN
      SET @detailCols += CASE WHEN LEN(@detailCols) > 0 THEN N', ' ELSE N'' END + N'[IvaTasa]';
      SET @detailSelect += CASE WHEN LEN(@detailSelect) > 0 THEN N', ' ELSE N'' END + N'''.16''';
    END;

    IF LEN(@detailCols) > 0
    BEGIN
      SET @sql = N'
        INSERT INTO dbo.FACT_TICKET_SHP (' + @detailCols + N')
        SELECT ' + @detailSelect + N'
        FROM dbo.PV_TICKET_LOG T
        LEFT JOIN dbo.DAT_ART A
          ON A.ART = T.ART
         AND A.SUC = @pSUC
        WHERE T.IDFOL = @pIDFOL
          AND (' + @remainingExpr + N') > 0;
        SELECT @pROWS = @@ROWCOUNT;';

      EXEC sys.sp_executesql
        @sql,
        N'@pIDFOL NVARCHAR(255), @pSUC NVARCHAR(255), @pIVA INT, @pROWS INT OUTPUT',
        @pIDFOL = @idfolActual,
        @pSUC = @suc,
        @pIVA = @ivaIntegrado,
        @pROWS = @detailRows OUTPUT;
    END
    ELSE
    BEGIN
      SET @detailRows = 0;
    END;

    IF OBJECT_ID('dbo.CTROL_TRAMISIONES') IS NOT NULL
      AND COL_LENGTH('dbo.CTROL_TRAMISIONES', 'FNCT') IS NOT NULL
      AND COL_LENGTH('dbo.CTROL_TRAMISIONES', 'TIP_TRANS') IS NOT NULL
      AND COL_LENGTH('dbo.CTROL_TRAMISIONES', 'N_REG') IS NOT NULL
    BEGIN
      INSERT INTO dbo.CTROL_TRAMISIONES (FNCT, TIP_TRANS, N_REG)
      VALUES (@fechaProceso, 'FACT', @detailRows);
      SET @tramRows = 1;
    END;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolActual AS IDFOL,
      @aut AS AUT,
      @reqf AS REQF,
      ROUND(@subtotal, 2) AS SUBTOTAL,
      ROUND(@iva, 2) AS IVA,
      ROUND(@totalFinal, 2) AS IMPT,
      @estatusFinal AS ESTATUS,
      @detailRows AS DETAIL_ROWS,
      @tramRows AS TRAMISION_ROWS,
      CAST(1 AS BIT) AS SYNC_APPLIED,
      @eventoNorm AS EVENTO;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
