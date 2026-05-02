USE IOELOCAL;
SET NOCOUNT ON;

------------------------------------------------------------
-- VARIABLES A MODIFICAR
------------------------------------------------------------
DECLARE @IordOrig  VARCHAR(20) = 'DF10132460001';
DECLARE @IordNueva VARCHAR(20) = 'DF10132580001';
DECLARE @TopRows   INT = 20;

------------------------------------------------------------
-- VARIABLES INTERNAS
------------------------------------------------------------
DECLARE @IdFolOrig NVARCHAR(255) = NULL;
DECLARE @Tipom INT = NULL;
DECLARE @CtrlMovCol SYSNAME =
    CASE
        WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CMOV') IS NOT NULL THEN 'CMOV'
        WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CLSD') IS NOT NULL THEN 'CLSD'
        ELSE NULL
    END;

SELECT TOP 1
    @IdFolOrig = IDFOL,
    @Tipom = TRY_CONVERT(INT, TIPOM)
FROM dbo.PV_CTR_ORDS
WHERE IORD = @IordOrig;

IF OBJECT_ID('tempdb..#DocpsMb51') IS NOT NULL DROP TABLE #DocpsMb51;
CREATE TABLE #DocpsMb51 (
    DOCP NVARCHAR(255) NOT NULL PRIMARY KEY
);

INSERT INTO #DocpsMb51 (DOCP)
SELECT DISTINCT LTRIM(RTRIM(v.DOCP))
FROM (VALUES (@IdFolOrig), (@IordOrig), (@IordNueva)) v(DOCP)
WHERE LTRIM(RTRIM(ISNULL(v.DOCP, ''))) <> '';

IF OBJECT_ID('tempdb..#NdocsCtrl') IS NOT NULL DROP TABLE #NdocsCtrl;
CREATE TABLE #NdocsCtrl (
    NDOC NVARCHAR(255) NOT NULL PRIMARY KEY
);

PRINT '============================================================';
PRINT 'VALIDACION CAMBIO MATERIAL / MERMA';
PRINT 'IORD ORIGINAL : ' + ISNULL(@IordOrig, '(NULL)');
PRINT 'IORD NUEVA    : ' + ISNULL(@IordNueva, '(NULL)');
PRINT 'IDFOL ORIGEN  : ' + ISNULL(@IdFolOrig, '(NULL)');
PRINT 'TIPOM         : ' + ISNULL(CONVERT(VARCHAR(10), @Tipom), '(NULL)');
PRINT '============================================================';

PRINT '1) PV_CTR_ORDS';
SELECT
    IORD,
    IDFOL,
    ESTSEGU,
    REEORD,
    CTD,
    CTD_C_M,
    selCtrlOrd,
    USR_AUT_CYM,
    FCN_AUT_CYM,
    ART,
    LABOR,
    CLIEN,
    NCLIENTE,
    SUC,
    TIPOM
FROM dbo.PV_CTR_ORDS
WHERE IORD IN (@IordOrig, @IordNueva)
ORDER BY IORD;

PRINT '2) PV_CTR_ORDS_DET';
SELECT
    IORDP,
    IORD,
    ART,
    JOB,
    ESF,
    CIL,
    EJE
FROM dbo.PV_CTR_ORDS_DET
WHERE IORD = @IordNueva
ORDER BY IORDP;

PRINT '3) PV_ORD_CAMBIO_MERMA_TMP';
SELECT
    IORD,
    NVA_IORD,
    TIPOM,
    ART_NUEVO,
    LABOR,
    CTD_C_M,
    MOTR,
    PVTA_NUEVO,
    DIFERENCIA_ECONOMICA,
    CREAR_NUEVA_ORD,
    USER_MOD,
    FCN_ALT,
    FCN_MOD
FROM dbo.PV_ORD_CAMBIO_MERMA_TMP
WHERE IORD = @IordOrig;

PRINT '4) DAT_MB51';
SELECT TOP (@TopRows)
    m.IDPD,
    m.DOCP,
    m.ART,
    m.CTDA,
    m.CTOT,
    m.CLSM,
    c.TXTM AS TXT_MOV,
    m.TXT,
    m.SUC,
    m.FCND,
    m.FCNC
FROM dbo.DAT_MB51 m
LEFT JOIN dbo.DAT_CMOV c
    ON c.CMOV = TRY_CONVERT(INT, m.CLSM)
WHERE EXISTS (
    SELECT 1
    FROM #DocpsMb51 d
    WHERE d.DOCP = m.DOCP
)
ORDER BY m.FCNC DESC, m.IDPD DESC;

PRINT '5) DAT_MB51 CTOT';
SELECT TOP (@TopRows)
    m.IDPD,
    m.DOCP,
    m.SUC,
    m.ART,
    m.CTDA,
    a.CTOP,
    m.CTOT,
    ROUND(ISNULL(m.CTDA, 0) * ISNULL(a.CTOP, 0), 2) AS CTOT_ESPERADO,
    ROUND(ISNULL(m.CTOT, 0) - ROUND(ISNULL(m.CTDA, 0) * ISNULL(a.CTOP, 0), 2), 2) AS DIF_CTOT,
    m.CLSM,
    c.TXTM AS TXT_MOV,
    m.TXT
FROM dbo.DAT_MB51 m
LEFT JOIN dbo.DAT_ART a
    ON a.ART = m.ART
   AND a.SUC = m.SUC
LEFT JOIN dbo.DAT_CMOV c
    ON c.CMOV = TRY_CONVERT(INT, m.CLSM)
WHERE EXISTS (
    SELECT 1
    FROM #DocpsMb51 d
    WHERE d.DOCP = m.DOCP
)
ORDER BY m.FCNC DESC, m.IDPD DESC;

PRINT '6) DAT_CTRL_CTAS';
IF @CtrlMovCol IS NOT NULL
BEGIN
    DECLARE @SqlCtrl NVARCHAR(MAX) = N'
        SELECT TOP (@TopRows)
            NDOC,
            CTA,
            CLIENT,
            IMPT,
            RTXT,
            SUC,
            FCND,
            CAST(' + QUOTENAME(@CtrlMovCol) + N' AS VARCHAR(20)) AS MOV_CTRL
        FROM dbo.DAT_CTRL_CTAS
        WHERE RTXT LIKE ''%'' + @IordOrig + ''%''
           OR RTXT LIKE ''%'' + @IordNueva + ''%''
           OR (@IdFolOrig IS NOT NULL AND RTXT LIKE ''%'' + @IdFolOrig + ''%'')
        ORDER BY FCND DESC, NDOC DESC;';

    EXEC sp_executesql
        @SqlCtrl,
        N'@TopRows INT, @IordOrig VARCHAR(20), @IordNueva VARCHAR(20), @IdFolOrig NVARCHAR(255)',
        @TopRows = @TopRows,
        @IordOrig = @IordOrig,
        @IordNueva = @IordNueva,
        @IdFolOrig = @IdFolOrig;

    DECLARE @SqlNdoc NVARCHAR(MAX) = N'
        INSERT INTO #NdocsCtrl (NDOC)
        SELECT DISTINCT TOP (@TopRows) NDOC
        FROM dbo.DAT_CTRL_CTAS
        WHERE RTXT LIKE ''%'' + @IordOrig + ''%''
           OR RTXT LIKE ''%'' + @IordNueva + ''%''
           OR (@IdFolOrig IS NOT NULL AND RTXT LIKE ''%'' + @IdFolOrig + ''%'')
        ORDER BY NDOC DESC;';

    EXEC sp_executesql
        @SqlNdoc,
        N'@TopRows INT, @IordOrig VARCHAR(20), @IordNueva VARCHAR(20), @IdFolOrig NVARCHAR(255)',
        @TopRows = @TopRows,
        @IordOrig = @IordOrig,
        @IordNueva = @IordNueva,
        @IdFolOrig = @IdFolOrig;
END
ELSE
BEGIN
    PRINT 'No existe columna CMOV ni CLSD en DAT_CTRL_CTAS.';
END;

PRINT '7) DAT_CTR_DOC';
SELECT TOP (@TopRows)
    d.DOC,
    d.CLSMOV,
    d.FCND,
    d.[USER],
    d.STAT
FROM dbo.DAT_CTR_DOC d
WHERE EXISTS (
    SELECT 1
    FROM #NdocsCtrl n
    WHERE n.NDOC = d.DOC
)
ORDER BY d.FCND DESC, d.DOC DESC;

PRINT '8) RESUMEN_MB51';
SELECT
    m.CLSM,
    c.TXTM,
    COUNT(*) AS MOVS,
    SUM(ISNULL(m.CTDA, 0)) AS SUM_CANTIDAD,
    SUM(ISNULL(m.CTOT, 0)) AS SUM_COSTO
FROM dbo.DAT_MB51 m
LEFT JOIN dbo.DAT_CMOV c
    ON c.CMOV = TRY_CONVERT(INT, m.CLSM)
WHERE EXISTS (
    SELECT 1
    FROM #DocpsMb51 d
    WHERE d.DOCP = m.DOCP
)
GROUP BY
    m.CLSM,
    c.TXTM
ORDER BY TRY_CONVERT(INT, m.CLSM);

PRINT '9) RESUMEN_CONTABLE';
IF @CtrlMovCol IS NOT NULL
BEGIN
    DECLARE @SqlCtrlResumen NVARCHAR(MAX) = N'
        SELECT
            CAST(' + QUOTENAME(@CtrlMovCol) + N' AS VARCHAR(20)) AS MOV_CTRL,
            COUNT(*) AS MOVS,
            SUM(ISNULL(IMPT, 0)) AS SUM_IMPORTE,
            MIN(CTA) AS CTA_USADA,
            MIN(NDOC) AS NDOC_MIN,
            MAX(NDOC) AS NDOC_MAX
        FROM dbo.DAT_CTRL_CTAS
        WHERE RTXT LIKE ''%'' + @IordOrig + ''%''
           OR RTXT LIKE ''%'' + @IordNueva + ''%''
           OR (@IdFolOrig IS NOT NULL AND RTXT LIKE ''%'' + @IdFolOrig + ''%'')
        GROUP BY ' + QUOTENAME(@CtrlMovCol) + N'
        ORDER BY TRY_CONVERT(INT, ' + QUOTENAME(@CtrlMovCol) + N');';

    EXEC sp_executesql
        @SqlCtrlResumen,
        N'@IordOrig VARCHAR(20), @IordNueva VARCHAR(20), @IdFolOrig NVARCHAR(255)',
        @IordOrig = @IordOrig,
        @IordNueva = @IordNueva,
        @IdFolOrig = @IdFolOrig;
END;

PRINT '10) CHECKLIST';
;WITH ORIG AS (
    SELECT TOP 1 *
    FROM dbo.PV_CTR_ORDS
    WHERE IORD = @IordOrig
),
NVA AS (
    SELECT TOP 1 *
    FROM dbo.PV_CTR_ORDS
    WHERE IORD = @IordNueva
),
TMP AS (
    SELECT TOP 1 *
    FROM dbo.PV_ORD_CAMBIO_MERMA_TMP
    WHERE IORD = @IordOrig
),
MB AS (
    SELECT
        SUM(CASE WHEN TRY_CONVERT(INT, CLSM) = 204 THEN 1 ELSE 0 END) AS MOV204,
        SUM(CASE WHEN TRY_CONVERT(INT, CLSM) = 205 THEN 1 ELSE 0 END) AS MOV205,
        SUM(CASE WHEN TRY_CONVERT(INT, CLSM) = 455 THEN 1 ELSE 0 END) AS MOV455,
        SUM(CASE WHEN TRY_CONVERT(INT, CLSM) = 456 THEN 1 ELSE 0 END) AS MOV456,
        SUM(CASE WHEN TRY_CONVERT(INT, CLSM) = 457 THEN 1 ELSE 0 END) AS MOV457
    FROM dbo.DAT_MB51
    WHERE EXISTS (
        SELECT 1
        FROM #DocpsMb51 d
        WHERE d.DOCP = DAT_MB51.DOCP
    )
),
CTA AS (
    SELECT
        COUNT(*) AS MOVS,
        SUM(CASE WHEN CTA = '101001001' THEN 1 ELSE 0 END) AS CTA_OK
    FROM dbo.DAT_CTRL_CTAS
    WHERE RTXT LIKE '%' + @IordOrig + '%'
       OR RTXT LIKE '%' + @IordNueva + '%'
       OR (@IdFolOrig IS NOT NULL AND RTXT LIKE '%' + @IdFolOrig + '%')
)
SELECT
    'ORD ORIGINAL ANULADA' AS VALIDACION,
    CASE WHEN EXISTS (SELECT 1 FROM ORIG WHERE ESTSEGU = 4) THEN 'OK' ELSE 'ERROR' END AS RESULTADO
UNION ALL
SELECT
    'ORD ORIGINAL RELACIONADA A NUEVA',
    CASE WHEN EXISTS (SELECT 1 FROM ORIG WHERE REEORD = @IordNueva) THEN 'OK' ELSE 'ERROR' END
UNION ALL
SELECT
    'NUEVA ORD EXISTE',
    CASE WHEN EXISTS (SELECT 1 FROM NVA) THEN 'OK' ELSE 'ERROR' END
UNION ALL
SELECT
    'TMP NVA_IORD COINCIDE',
    CASE WHEN EXISTS (SELECT 1 FROM TMP WHERE NVA_IORD = @IordNueva) THEN 'OK' ELSE 'ERROR' END
UNION ALL
SELECT
    'CTA CONTABLE 101001001',
    CASE WHEN EXISTS (SELECT 1 FROM CTA WHERE CTA_OK > 0) THEN 'OK' ELSE 'ERROR' END
UNION ALL
SELECT
    'MOVIMIENTO 204 CAMBIO +',
    CASE
        WHEN @Tipom = 1 AND EXISTS (SELECT 1 FROM MB WHERE MOV204 > 0) THEN 'OK'
        WHEN @Tipom = 1 THEN 'ERROR'
        ELSE 'NO APLICA'
    END
UNION ALL
SELECT
    'MOVIMIENTO 205 CAMBIO -',
    CASE
        WHEN @Tipom = 1 AND EXISTS (SELECT 1 FROM MB WHERE MOV205 > 0) THEN 'OK'
        WHEN @Tipom = 1 THEN 'ERROR'
        ELSE 'NO APLICA'
    END
UNION ALL
SELECT
    'MOVIMIENTO 456 MERMA ABONO',
    CASE
        WHEN @Tipom = 2 AND EXISTS (SELECT 1 FROM MB WHERE MOV456 > 0) THEN 'OK'
        WHEN @Tipom = 2 THEN 'ERROR'
        ELSE 'NO APLICA'
    END
UNION ALL
SELECT
    'MOVIMIENTO 455 MERMA CARGO',
    CASE
        WHEN @Tipom = 2 AND EXISTS (SELECT 1 FROM MB WHERE MOV455 > 0) THEN 'OK'
        WHEN @Tipom = 2 THEN 'ERROR'
        ELSE 'NO APLICA'
    END
UNION ALL
SELECT
    'MOVIMIENTO 457 MERMA NUEVO ART',
    CASE
        WHEN @Tipom = 2 AND EXISTS (SELECT 1 FROM MB WHERE MOV457 > 0) THEN 'OK'
        WHEN @Tipom = 2 THEN 'ERROR'
        ELSE 'NO APLICA'
    END;

DROP TABLE #NdocsCtrl;
DROP TABLE #DocpsMb51;
