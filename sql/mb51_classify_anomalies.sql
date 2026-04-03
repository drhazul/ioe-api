/* mb51_classify_anomalies.sql
   Objetivo: clasificar inconsistencias entre PV_TICKET_LOG y DAT_MB51 sin ejecutar cambios.
   Uso sugerido:
     sqlcmd -S 192.168.10.234 -d IOELOCAL -U sa -P "Cambio.2019" -i sql/mb51_classify_anomalies.sql -s ";" -W -o mb51_anomalies.csv
*/

SET NOCOUNT ON;
USE IOELOCAL;

DECLARE @idfol NVARCHAR(255) = NULL; -- opcional, ej. 'DF01811202450409'
DECLARE @soloAnomalias BIT = 1;

IF OBJECT_ID('tempdb..#tl') IS NOT NULL DROP TABLE #tl;
IF OBJECT_ID('tempdb..#mb') IS NOT NULL DROP TABLE #mb;
IF OBJECT_ID('tempdb..#j') IS NOT NULL DROP TABLE #j;

SELECT
  IDPD   = t.ID,
  DOCP_TL= t.IDFOL,
  ART    = t.ART,
  CTD    = ISNULL(t.CTD,0),
  SUC    = h.SUC,
  CLSM_EXP = CASE WHEN UPPER(h.AUT) IN ('DF','DCA','DVF','APDF') THEN 202 ELSE 201 END
INTO #tl
FROM dbo.PV_TICKET_LOG t
JOIN dbo.PV_CTR_FOL_ASVR h ON h.IDFOL = t.IDFOL
WHERE (@idfol IS NULL OR t.IDFOL = @idfol);

SELECT
  IDPD,
  BASE_ID = CASE WHEN IDPD LIKE '%-U%' THEN LEFT(IDPD, CHARINDEX('-U',IDPD)-1) ELSE IDPD END,
  DOCP,
  ART,
  CTDA,
  CTOT,
  CLSM,
  SUC
INTO #mb
FROM dbo.DAT_MB51
WHERE CLSM IN (201,202);

SELECT
  tl.*,
  mb.IDPD AS IDPD_MB51,
  mb.DOCP,
  mb.CTDA,
  mb.CTOT,
  mb.CLSM,
  mb.BASE_ID,
  anomaly = CASE
    WHEN mb.IDPD IS NULL THEN 'A_FALTA_MB51'
    WHEN mb.DOCP <> tl.DOCP_TL THEN 'C_DOCP_DIF'
    WHEN ABS(ISNULL(mb.CTDA,0) - CASE WHEN mb.CLSM=201 THEN -tl.CTD ELSE tl.CTD END) > 0.0001 THEN 'D_CTD_DIF'
    WHEN COUNT(*) OVER (PARTITION BY mb.IDPD) > 1 THEN 'B_BASE_DUP'
    ELSE 'OK'
  END
INTO #j
FROM #tl tl
LEFT JOIN #mb mb ON mb.IDPD = tl.IDPD;

SELECT anomaly, COUNT(1) AS rows_count
FROM #j
GROUP BY anomaly
ORDER BY rows_count DESC;

IF @soloAnomalias = 1
  SELECT * FROM #j WHERE anomaly <> 'OK' ORDER BY DOCP_TL, ART;
ELSE
  SELECT * FROM #j ORDER BY DOCP_TL, ART;

-- Orphans en MB51 (no existen en PV_TICKET_LOG)
SELECT m.*
FROM #mb m
WHERE NOT EXISTS (SELECT 1 FROM #tl t WHERE t.IDPD = m.IDPD);
