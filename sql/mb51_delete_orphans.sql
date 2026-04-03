/* mb51_delete_orphans.sql
   Elimina en DAT_MB51 los registros de un folio que NO tienen relación en PV_TICKET_LOG.
   Param: @idfol (cambia el valor antes de ejecutar).
   Solo afecta CLSM 201/202.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE IOELOCAL;

DECLARE @idfol NVARCHAR(255) = 'DF0113112024504746'; -- <-- ajusta aquí el folio

PRINT 'Folio objetivo: ' + @idfol;

-- Previo: muestra orphans detectados
SELECT *
FROM dbo.DAT_MB51 m
LEFT JOIN dbo.PV_TICKET_LOG t ON t.ID = m.IDPD
WHERE m.CLSM IN (201,202)
  AND m.DOCP = @idfol
  AND t.ID IS NULL;

BEGIN TRAN;

DECLARE @deleted INT = 0;

DELETE FROM dbo.DAT_MB51
WHERE CLSM IN (201,202)
  AND DOCP = @idfol
  AND IDPD NOT IN (SELECT ID FROM dbo.PV_TICKET_LOG);

SET @deleted = @@ROWCOUNT;
PRINT 'deleted_rows=' + CAST(@deleted AS VARCHAR(20));

COMMIT;
