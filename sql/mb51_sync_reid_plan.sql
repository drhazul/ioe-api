/* mb51_sync_reid_plan.sql
   Simulación sobre folio único (configurable con @idfol_filter).
   Acción: intenta insertar faltantes; si conflicto de PK, re-IDiza ticket y reintenta.
   No borra nada.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE IOELOCAL;

DECLARE @idfol_filter NVARCHAR(255) = 'DF0113112024504746'; -- folio a simular
DECLARE @actor NVARCHAR(255) = 'codex';

IF OBJECT_ID('tempdb..#incidentes') IS NOT NULL DROP TABLE #incidentes;
CREATE TABLE #incidentes (
  IDPD_MB51 NVARCHAR(510),
  DOCP_MB51 NVARCHAR(255),
  ART NVARCHAR(255),
  CLSM FLOAT,
  SUC VARCHAR(255),
  FCNC DATETIME,
  ID_TL NVARCHAR(510) NULL,
  IDFOL_TL NVARCHAR(255) NULL
);

INSERT INTO #incidentes (IDPD_MB51, DOCP_MB51, ART, CLSM, SUC, FCNC, ID_TL, IDFOL_TL)
SELECT m.IDPD, m.DOCP, m.ART, m.CLSM, m.SUC, m.FCNC, t.ID, t.IDFOL
FROM dbo.DAT_MB51 m
LEFT JOIN dbo.PV_TICKET_LOG t ON t.ID = m.IDPD
WHERE m.CLSM IN (201,202)
  AND (@idfol_filter IS NULL OR m.DOCP = @idfol_filter)
  AND t.ID IS NULL;         -- incidencia: MB51 sin ticket

IF OBJECT_ID('tempdb..#log_acciones') IS NOT NULL DROP TABLE #log_acciones;
CREATE TABLE #log_acciones (
  IDFOL NVARCHAR(255),
  IDPD_ORIG NVARCHAR(510),
  IDPD_FINAL NVARCHAR(510),
  ART NVARCHAR(255),
  ACCION NVARCHAR(50),
  DETALLE NVARCHAR(200),
  FCN DATETIME DEFAULT GETDATE()
);

DECLARE @idpd_mb51 NVARCHAR(510), @idfol NVARCHAR(255), @art NVARCHAR(255),
        @clsm FLOAT, @suc VARCHAR(255), @ctd FLOAT, @ctop FLOAT,
        @ctda FLOAT, @ctot FLOAT, @id_new NVARCHAR(510);

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
  SELECT i.IDPD_MB51, i.DOCP_MB51, i.ART, i.CLSM, i.SUC
  FROM #incidentes i;

OPEN cur;
FETCH NEXT FROM cur INTO @idpd_mb51, @idfol, @art, @clsm, @suc;
WHILE @@FETCH_STATUS = 0
BEGIN
  SELECT TOP 1
    @ctd = ISNULL(t.CTD,0),
    @ctop = ISNULL((
       SELECT MAX(ISNULL(da.CTOP,0))
       FROM dbo.DAT_ART da
       WHERE da.SUC = @suc AND da.ART = t.ART),0)
  FROM dbo.PV_TICKET_LOG t
  WHERE t.IDFOL = @idfol AND t.ART = @art;

  IF @ctd IS NULL
  BEGIN
    INSERT INTO #log_acciones VALUES (@idfol, @idpd_mb51, NULL, @art, 'SKIP', 'No existe en ticket', GETDATE());
    FETCH NEXT FROM cur INTO @idpd_mb51, @idfol, @art, @clsm, @suc;
    CONTINUE;
  END;

  SET @ctda = CASE WHEN @clsm = 201 THEN -@ctd ELSE @ctd END;
  SET @ctot = @ctda * @ctop;
  SET @id_new = @idpd_mb51; -- primer intento

  BEGIN TRY
    INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC)
    VALUES (@id_new, @actor, @clsm, @idfol, @art, @ctda, @ctot, GETDATE(), GETDATE(), @idfol, '001', @suc);

    UPDATE dbo.DAT_ART
      SET STOCK = ISNULL(STOCK,0) + @ctda
      WHERE SUC=@suc AND ART=@art;

    INSERT INTO #log_acciones VALUES (@idfol, @idpd_mb51, @id_new, @art, 'INSERT', 'IDPD original', GETDATE());
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() = 2627
    BEGIN
      SET @id_new = LEFT(@idpd_mb51 + '-U' + CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', @idpd_mb51 + '|' + @idfol), 2), 510);

      UPDATE dbo.PV_TICKET_LOG SET ID=@id_new
      WHERE ID = @idpd_mb51 AND IDFOL=@idfol;

      INSERT INTO dbo.DAT_MB51 (IDPD,[USER],CLSM,DOCP,ART,CTDA,CTOT,FCND,FCNC,TXT,ALMACEN,SUC)
      VALUES (@id_new, @actor, @clsm, @idfol, @art, @ctda, @ctot, GETDATE(), GETDATE(), @idfol, '001', @suc);

      UPDATE dbo.DAT_ART
        SET STOCK = ISNULL(STOCK,0) + @ctda
        WHERE SUC=@suc AND ART=@art;

      INSERT INTO #log_acciones VALUES (@idfol, @idpd_mb51, @id_new, @art, 'REID+INSERT', 'Conflicto PK, re-ID aplicado', GETDATE());
    END
    ELSE
    BEGIN
      INSERT INTO #log_acciones VALUES (@idfol, @idpd_mb51, NULL, @art, 'ERROR', ERROR_MESSAGE(), GETDATE());
    END;
  END CATCH;

  FETCH NEXT FROM cur INTO @idpd_mb51, @idfol, @art, @clsm, @suc;
END
CLOSE cur; DEALLOCATE cur;

-- Salida de la simulación
SELECT * FROM #log_acciones ORDER BY FCN, ART;
