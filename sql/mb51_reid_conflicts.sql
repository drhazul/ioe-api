/* mb51_reid_conflicts.sql
   Re-IDiza PV_TICKET_LOG y re-inserta DAT_MB51 cuando existe conflicto de IDPD.
   Folios objetivo: DF01811202450409, DF06-20260330-VF-0032.
   Uso: sqlcmd -S 192.168.10.234 -d IOELOCAL -U sa -P "Cambio.2019" -i sql/mb51_reid_conflicts.sql
*/
SET NOCOUNT ON;
USE IOELOCAL;

DECLARE @processNow DATETIME = GETDATE();
DECLARE @actor NVARCHAR(255) = 'codex';

DECLARE @targets TABLE (
  IDPD NVARCHAR(510),
  IDFOL NVARCHAR(255),
  SUC VARCHAR(255)
);

INSERT INTO @targets (IDPD, IDFOL, SUC)
SELECT DISTINCT t.ID, t.IDFOL, h.SUC
FROM dbo.PV_TICKET_LOG t
JOIN dbo.PV_CTR_FOL_ASVR h ON h.IDFOL = t.IDFOL
WHERE t.IDFOL IN ('DF01811202450409', 'DF06-20260330-VF-0032');

BEGIN TRY
  BEGIN TRAN;

  DECLARE @id NVARCHAR(510), @idfol NVARCHAR(255), @suc VARCHAR(255);
  DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT IDPD, IDFOL, SUC FROM @targets;

  OPEN cur;
  FETCH NEXT FROM cur INTO @id, @idfol, @suc;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    DECLARE @idNew NVARCHAR(510) = LEFT(@id + '-U' + CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', @id + '|' + @idfol), 2), 510);

    -- Actualiza ticket log al nuevo ID
    UPDATE dbo.PV_TICKET_LOG
    SET ID = @idNew
    WHERE ID = @id AND IDFOL = @idfol;

    -- Datos base para inserción MB51
    DECLARE @aut NVARCHAR(40), @sign FLOAT = -1, @clsm FLOAT = 201, @fcnm DATETIME;
    SELECT TOP 1
      @aut = UPPER(LTRIM(RTRIM(ISNULL(h.AUT, '')))),
      @fcnm = h.FCNM
    FROM dbo.PV_CTR_FOL_ASVR h
    WHERE h.IDFOL = @idfol;

    IF @aut IN ('DF','DCA','DVF','APDF')
    BEGIN
      SET @sign = 1;
      SET @clsm = 202;
    END

    DECLARE @art NVARCHAR(510), @ctd FLOAT, @ctop FLOAT;
    SELECT TOP 1
      @art = t.ART,
      @ctd = ISNULL(t.CTD,0),
      @ctop = ISNULL((
        SELECT MAX(ISNULL(da.CTOP,0))
        FROM dbo.DAT_ART da
        WHERE da.SUC = @suc AND da.ART = t.ART
      ),0)
    FROM dbo.PV_TICKET_LOG t
    WHERE t.ID = @idNew
      AND t.IDFOL = @idfol;

    IF @art IS NOT NULL
    BEGIN
      INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC)
      SELECT
        @idNew,
        @actor,
        @clsm,
        @idfol,
        @art,
        @ctd * @sign,
        @ctd * @ctop * @sign,
        @fcnm,
        @processNow,
        @idfol,
        '001',
        @suc
      WHERE NOT EXISTS (SELECT 1 FROM dbo.DAT_MB51 m WHERE m.IDPD = @idNew);

      UPDATE da
      SET da.STOCK = ISNULL(da.STOCK,0) + (@ctd * @sign)
      FROM dbo.DAT_ART da
      WHERE da.SUC = @suc AND da.ART = @art;
    END

    FETCH NEXT FROM cur INTO @id, @idfol, @suc;
  END
  CLOSE cur; DEALLOCATE cur;

  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;
END CATCH;

PRINT 'Re-ID + inserción completada';
