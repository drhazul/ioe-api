/* mb51_insert_missing_from_ticket.sql
   Inserta en DAT_MB51 todos los tickets que cumplen:
   - PV_TICKET_LOG.ID no existe en DAT_MB51 (IDPD null en join)
   - PV_CTR_FOL_ASVR.ESTA = 'MB51PROCES'
   - SUC <> 'DM01'
   - FCNM < '2026-04-02'  (ajusta si requieres otro corte)
   Lógica: misma que el SP de transmisión (CLSM/CTDA/CTOT, FCND=FCNM, TXT=IDFOL, ALMACEN='001').
   Actualiza STOCK en DAT_ART.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE IOELOCAL;

DECLARE @fechaCorte DATETIME = '2026-04-02T00:00:00'; -- ajusta si deseas otro límite
DECLARE @actor NVARCHAR(255) = 'codex';

IF OBJECT_ID('tempdb..#missing') IS NOT NULL DROP TABLE #missing;
IF OBJECT_ID('tempdb..#to_insert') IS NOT NULL DROP TABLE #to_insert;
IF OBJECT_ID('tempdb..#stock_delta') IS NOT NULL DROP TABLE #stock_delta;

-- 1) Identificar tickets sin MB51
SELECT
  tl.ID       AS IDPD,
  tl.IDFOL    AS DOCP,
  tl.ART,
  ISNULL(tl.CTD,0) AS CTD,
  h.SUC,
  h.AUT,
  h.FCNM
INTO #missing
FROM dbo.PV_TICKET_LOG tl
INNER JOIN dbo.PV_CTR_FOL_ASVR h ON h.IDFOL = tl.IDFOL
LEFT JOIN dbo.DAT_MB51 m ON m.IDPD = tl.ID
WHERE m.IDPD IS NULL
  AND UPPER(h.ESTA) = 'MB51PROCES'
  AND UPPER(h.SUC) <> 'DM01'
  AND h.FCNM < @fechaCorte;

-- 2) Preparar inserciones con costos y signos
SELECT
  m.IDPD,
  m.DOCP,
  m.ART,
  m.SUC,
  m.FCNM,
  CLSM = CASE WHEN UPPER(m.AUT) IN ('DF','DCA','DVF','APDF') THEN 202 ELSE 201 END,
  SIGNO = CASE WHEN UPPER(m.AUT) IN ('DF','DCA','DVF','APDF') THEN 1 ELSE -1 END,
  m.CTD,
  CTOP = ISNULL((SELECT MAX(ISNULL(da.CTOP,0)) FROM dbo.DAT_ART da WHERE da.SUC = m.SUC AND da.ART = m.ART),0)
INTO #to_insert
FROM #missing m;

-- 3) Insertar en DAT_MB51
BEGIN TRAN;

INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC)
SELECT
  t.IDPD,
  @actor,
  t.CLSM,
  t.DOCP,
  t.ART,
  CTDA = t.CTD * t.SIGNO,
  CTOT = (t.CTD * t.SIGNO) * t.CTOP,
  FCND = t.FCNM,
  FCNC = GETDATE(),
  TXT  = t.DOCP,
  ALMACEN = '001',
  SUC = t.SUC
FROM #to_insert t
WHERE NOT EXISTS (SELECT 1 FROM dbo.DAT_MB51 m WHERE m.IDPD = t.IDPD);

-- 4) Resumen de inserciones
DECLARE @inserted INT = @@ROWCOUNT;
PRINT 'Rows inserted into DAT_MB51: ' + CAST(@inserted AS VARCHAR(20));

-- 5) Actualizar STOCK agregando por SUC/ART
SELECT
  SUC,
  ART,
  DELTA = SUM(t.CTD * t.SIGNO)
INTO #stock_delta
FROM #to_insert t
WHERE NOT EXISTS (SELECT 1 FROM dbo.DAT_MB51 m WHERE m.IDPD = t.IDPD) -- solo los que se insertaron
GROUP BY SUC, ART;

UPDATE da
SET da.STOCK = ISNULL(da.STOCK,0) + sd.DELTA
FROM dbo.DAT_ART da
JOIN #stock_delta sd ON sd.SUC = da.SUC AND sd.ART = da.ART;

PRINT 'Stock updated for rows: ' + CAST(@@ROWCOUNT AS VARCHAR(20));

COMMIT;

-- 6) Log simple
SELECT * FROM #stock_delta ORDER BY SUC, ART;
SELECT COUNT(*) AS remaining_missing
FROM dbo.PV_TICKET_LOG tl
LEFT JOIN dbo.DAT_MB51 m ON m.IDPD = tl.ID
JOIN dbo.PV_CTR_FOL_ASVR h ON h.IDFOL = tl.IDFOL
WHERE m.IDPD IS NULL
  AND UPPER(h.ESTA) = 'MB51PROCES'
  AND UPPER(h.SUC) <> 'DM01'
  AND h.FCNM < @fechaCorte;
