/* mb51_fix_reid_plan.sql
   Plan de saneo sin ejecución:
   - Re-ID de filas con sufijo -U cuando son las únicas válidas.
   - Contra-movimientos para duplicados donde existe DOCP distinto al de PV_TICKET_LOG.
   - Inserción faltante cuando PV_TICKET_LOG no tiene reflejo en MB51.
   Ejecutar en ambiente de prueba; genera SQL sugerido, no modifica datos.
*/
SET NOCOUNT ON;
USE IOELOCAL;

DECLARE @idfol NVARCHAR(255) = 'DF06-20260330-VF-0032'; -- folio en análisis

IF OBJECT_ID('tempdb..#actions') IS NOT NULL DROP TABLE #actions;
CREATE TABLE #actions (
  action_type NVARCHAR(30),
  idpd_target NVARCHAR(510),
  idpd_source NVARCHAR(510) NULL,
  docp NVARCHAR(255),
  art NVARCHAR(255),
  suc VARCHAR(255),
  clsm FLOAT,
  ctda FLOAT,
  ctot FLOAT,
  txt NVARCHAR(255),
  notes NVARCHAR(255)
);

IF OBJECT_ID('tempdb..#tl') IS NOT NULL DROP TABLE #tl;
IF OBJECT_ID('tempdb..#mb') IS NOT NULL DROP TABLE #mb;
IF OBJECT_ID('tempdb..#merged') IS NOT NULL DROP TABLE #merged;

SELECT
  IDPD   = t.ID,
  DOCP_TL= t.IDFOL,
  ART    = t.ART,
  CTD    = ISNULL(t.CTD,0),
  SUC    = h.SUC,
  CTOP   = (SELECT MAX(ISNULL(da.CTOP,0)) FROM dbo.DAT_ART da WHERE da.SUC=h.SUC AND da.ART=t.ART),
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
  dup_count = COUNT(*) OVER (PARTITION BY mb.BASE_ID)
INTO #merged
FROM #tl tl
LEFT JOIN #mb mb ON mb.BASE_ID = tl.IDPD;
-- faltantes: insertar
INSERT INTO #actions(action_type,idpd_target,docp,art,suc,clsm,ctda,ctot,txt,notes)
SELECT 'INSERT_MISSING', tl.IDPD, tl.DOCP_TL, tl.ART, tl.SUC, tl.CLSM_EXP,
       CASE WHEN tl.CLSM_EXP=201 THEN -tl.CTD ELSE tl.CTD END,
       CASE WHEN tl.CLSM_EXP=201 THEN -tl.CTD*tl.CTOP ELSE tl.CTD*tl.CTOP END,
       tl.DOCP_TL, 'No existe en MB51'
FROM #tl tl
WHERE NOT EXISTS (SELECT 1 FROM #mb WHERE BASE_ID = tl.IDPD);

-- duplicados con DOCP distinto: contramovimiento al registro inconsistente
INSERT INTO #actions(action_type,idpd_target,idpd_source,docp,art,suc,clsm,ctda,ctot,txt,notes)
SELECT 'COUNTER_BAD_DOCP',
       m.IDPD + '-REV',
       m.IDPD,
       m.DOCP,
       m.ART,
       m.SUC,
       m.CLSM,
       ISNULL(-m.CTDA,0),
       ISNULL(-m.CTOT,0),
       CONCAT('REV_DUP ', m.DOCP),
       'DOCP <> ticket'
FROM #merged j
JOIN #mb m ON m.IDPD = j.IDPD_MB51
WHERE j.DOCP IS NOT NULL
  AND j.DOCP <> j.DOCP_TL
  AND j.dup_count >= 1;

-- sufijo -U como única fila válida: reinsertar con ID base y revertir -U
INSERT INTO #actions(action_type,idpd_target,idpd_source,docp,art,suc,clsm,ctda,ctot,txt,notes)
SELECT 'REINSERT_BASE',
       j.IDPD,        -- base
       j.IDPD_MB51,   -- -U actual
       j.DOCP_TL,
       j.ART,
       j.SUC,
       j.CLSM,
       j.CTDA,
       j.CTOT,
       j.DOCP_TL,
       'Solo existe -U'
FROM #merged j
WHERE j.IDPD_MB51 LIKE '%-U%' AND j.DOCP = j.DOCP_TL AND j.dup_count = 1;

INSERT INTO #actions(action_type,idpd_target,idpd_source,docp,art,suc,clsm,ctda,ctot,txt,notes)
SELECT 'COUNTER_U',
       j.IDPD_MB51 + '-REV',
       j.IDPD_MB51,
       j.DOCP,
       j.ART,
       j.SUC,
       j.CLSM,
       ISNULL(-j.CTDA,0),
       ISNULL(-j.CTOT,0),
       CONCAT('REV_U ', j.DOCP),
       'Neutralizar -U'
FROM #merged j
WHERE j.IDPD_MB51 LIKE '%-U%' AND j.DOCP = j.DOCP_TL AND j.dup_count = 1;

-- Vista de acciones
SELECT * FROM #actions ORDER BY action_type, docp, art;

-- Genera SQL sugerido (no se ejecuta)
SELECT
  action_type,
  sql_preview =
    CASE action_type
      WHEN 'INSERT_MISSING' THEN CONCAT(
        'INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC) VALUES (''',
        idpd_target, ''',''SYSTEM'',', clsm, ',''', docp, ''',''', art, ''',', ctda, ',', ctot,
        ',GETDATE(),GETDATE(),''', txt, ''',''001'',''', suc, ''');'
      )
      WHEN 'COUNTER_BAD_DOCP' THEN CONCAT(
        'INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC) VALUES (''',
        idpd_target, ''',''SYSTEM'',', clsm, ',''', docp, ''',''', art, ''',', ctda, ',', ctot,
        ',GETDATE(),GETDATE(),''', txt, ''',''001'',''', suc, ''');'
      )
      WHEN 'REINSERT_BASE' THEN CONCAT(
        'INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC) SELECT ''',
        idpd_target, ''',[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC FROM dbo.DAT_MB51 WHERE IDPD=''', idpd_source, ''';'
      )
      WHEN 'COUNTER_U' THEN CONCAT(
        'INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC) VALUES (''',
        idpd_target, ''',''SYSTEM'',', clsm, ',''', docp, ''',''', art, ''',', ctda, ',', ctot,
        ',GETDATE(),GETDATE(),''', txt, ''',''001'',''', suc, ''');'
      )
      ELSE '--'
    END
FROM #actions
ORDER BY action_type, docp, art;
