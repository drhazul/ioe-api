/*
  DEV_PROVD - Limpieza controlada de documentos de prueba.

  Restaura el stock descontado por los movimientos 102 de los documentos
  identificados, elimina sus relaciones y reinicia el folio global en cero.
  La operación se cancela si existe cualquier otro documento para no afectar
  capturas creadas después de la revisión previa.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @TARGETS TABLE (DOC NVARCHAR(40) NOT NULL PRIMARY KEY);
  INSERT @TARGETS (DOC)
  VALUES
    ('DEV-DF01-00000001'),
    ('DEV-DF04-00000002'),
    ('DEV-DF01-00000003');

  -- Bloquea la generación de folios mientras se valida y limpia el módulo.
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.DEV_FOLIO_PROVD WITH (UPDLOCK, HOLDLOCK)
    WHERE SUC = '__GLOBAL__'
  )
    INSERT dbo.DEV_FOLIO_PROVD (SUC, ULTIMO) VALUES ('__GLOBAL__', 0);

  IF EXISTS (
    SELECT 1
    FROM dbo.DEV_DOC_PROVD h WITH (UPDLOCK, HOLDLOCK)
    WHERE NOT EXISTS (SELECT 1 FROM @TARGETS t WHERE t.DOC = h.DOC)
  )
    THROW 59290, 'La limpieza se cancelo porque existen documentos nuevos fuera del alcance revisado.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.DEV_DOC_PROVD h
    WHERE h.ESTATUS = 'AUTORIZADA'
      AND EXISTS (SELECT 1 FROM @TARGETS t WHERE t.DOC = h.DOC)
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.DAT_MB51 m
        WHERE m.DOCP = h.DOC AND m.CLSM = 102 AND m.CTDA < 0
      )
  )
    THROW 59291, 'No se encontro el movimiento 102 necesario para restaurar una devolucion autorizada.', 1;

  DECLARE @RESTORE TABLE (
    SUC NVARCHAR(20) NOT NULL,
    ART NVARCHAR(20) NOT NULL,
    CTD DECIMAL(18,4) NOT NULL,
    PRIMARY KEY (SUC, ART)
  );

  INSERT @RESTORE (SUC, ART, CTD)
  SELECT m.SUC, m.ART, SUM(-CONVERT(DECIMAL(18,4), m.CTDA))
  FROM dbo.DAT_MB51 m
  JOIN @TARGETS t ON t.DOC = m.DOCP
  WHERE m.CLSM = 102 AND m.CTDA < 0
  GROUP BY m.SUC, m.ART;

  IF EXISTS (
    SELECT 1
    FROM @RESTORE r
    LEFT JOIN dbo.DAT_ART a WITH (UPDLOCK, HOLDLOCK)
      ON a.SUC = r.SUC AND a.ART = r.ART
    WHERE a.ART IS NULL
  )
    THROW 59292, 'No se encontro el articulo de inventario que debe restaurarse.', 1;

  UPDATE a
  SET a.STOCK = ISNULL(a.STOCK, 0) + r.CTD
  FROM dbo.DAT_ART a
  JOIN @RESTORE r ON r.SUC = a.SUC AND r.ART = a.ART;

  DECLARE @ENVIOS TABLE (ID BIGINT NOT NULL PRIMARY KEY);
  INSERT @ENVIOS (ID)
  SELECT DISTINCT ed.IDENVIO
  FROM dbo.DEV_ENVIO_DOC ed
  JOIN @TARGETS t ON t.DOC = ed.DOC;

  DELETE e
  FROM dbo.DEV_EVIDENCIA_PROVD e
  JOIN dbo.DEV_CTRL_PROVD d ON d.IDPD = e.IDPD
  JOIN @TARGETS t ON t.DOC = d.DOC;

  DELETE ed
  FROM dbo.DEV_ENVIO_DOC ed
  JOIN @TARGETS t ON t.DOC = ed.DOC;

  DELETE e
  FROM dbo.DEV_ENVIO_PROVD e
  JOIN @ENVIOS x ON x.ID = e.ID
  WHERE NOT EXISTS (SELECT 1 FROM dbo.DEV_ENVIO_DOC ed WHERE ed.IDENVIO = e.ID);

  DELETE m
  FROM dbo.DAT_MB51 m
  JOIN @TARGETS t ON t.DOC = m.DOCP
  WHERE m.CLSM = 102;

  DELETE c
  FROM dbo.DAT_CTR_DOC c
  JOIN @TARGETS t ON t.DOC = c.DOC
  WHERE c.CLSMOV = '102';

  DELETE a
  FROM dbo.AUDIT_LOG a
  WHERE a.MODULO = 'DEV_PROVD'
    AND (
      EXISTS (SELECT 1 FROM @TARGETS t WHERE t.DOC = a.ENTIDAD_ID)
      OR EXISTS (
        SELECT 1
        FROM @ENVIOS x
        WHERE a.ENTIDAD = 'DEV_ENVIO_PROVD'
          AND a.ENTIDAD_ID = CONCAT('ENV-DEV-', RIGHT(CONCAT('00000000', x.ID), 8))
      )
    );

  DELETE d
  FROM dbo.DEV_CTRL_PROVD d
  JOIN @TARGETS t ON t.DOC = d.DOC;

  DELETE h
  FROM dbo.DEV_DOC_PROVD h
  JOIN @TARGETS t ON t.DOC = h.DOC;

  UPDATE dbo.DEV_FOLIO_PROVD
  SET ULTIMO = 0, FCNM = SYSDATETIME()
  WHERE SUC = '__GLOBAL__';

  COMMIT;

  SELECT
    (SELECT COUNT_BIG(*) FROM dbo.DEV_DOC_PROVD) AS DOCUMENTOS_RESTANTES,
    (SELECT ULTIMO FROM dbo.DEV_FOLIO_PROVD WHERE SUC = '__GLOBAL__') AS ULTIMO_FOLIO;
  SELECT r.SUC, r.ART, r.CTD AS STOCK_RESTAURADO, a.STOCK AS STOCK_FINAL
  FROM @RESTORE r
  JOIN dbo.DAT_ART a ON a.SUC = r.SUC AND a.ART = r.ART;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
