/*
  2026-04-19
  Cambio material / Merma
  Ajuste de fiscalidad por folio para usar REQF con fallback a RQFAC
  en:
    - dbo.sp_ordenes_trabajo_cambio_material
    - dbo.sp_ordenes_trabajo_merma
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @targets TABLE (proc_name SYSNAME PRIMARY KEY);
INSERT INTO @targets (proc_name)
VALUES
  ('sp_ordenes_trabajo_cambio_material'),
  ('sp_ordenes_trabajo_merma');

DECLARE @proc SYSNAME;
DECLARE @definition NVARCHAR(MAX);
DECLARE @updated NVARCHAR(MAX);
DECLARE @msg NVARCHAR(2048);
DECLARE @hasRqfac BIT = CASE
  WHEN COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'RQFAC') IS NULL THEN 0
  ELSE 1
END;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
SELECT proc_name FROM @targets;

OPEN cur;
FETCH NEXT FROM cur INTO @proc;

WHILE @@FETCH_STATUS = 0
BEGIN
  SELECT @definition = m.definition
  FROM sys.sql_modules m
  INNER JOIN sys.objects o
    ON o.object_id = m.object_id
  WHERE o.type = 'P'
    AND o.name = @proc
    AND SCHEMA_NAME(o.schema_id) = 'dbo';

  IF @definition IS NULL
  BEGIN
    SET @msg = CONCAT('No existe dbo.', @proc);
    THROW 58110, @msg, 1;
  END;

  SET @updated = REPLACE(
    @definition,
    'ISNULL(TRY_CONVERT(INT, f.REQF), 0)',
    CASE
      WHEN @hasRqfac = 1
        THEN 'COALESCE(TRY_CONVERT(INT, f.REQF), TRY_CONVERT(INT, f.RQFAC), 0)'
      ELSE 'ISNULL(TRY_CONVERT(INT, f.REQF), 0)'
    END
  );

  IF @hasRqfac = 0
  BEGIN
    PRINT CONCAT('Sin cambios en dbo.', @proc, ' (PV_CTR_FOL_ASVR no tiene columna RQFAC).');
  END
  ELSE IF @updated <> @definition
  BEGIN
    EXEC sp_executesql @updated;
    PRINT CONCAT('Actualizado dbo.', @proc, ' con fallback REQF/RQFAC.');
  END
  ELSE
  BEGIN
    PRINT CONCAT('Sin cambios en dbo.', @proc, ' (ya contiene fallback o patrón distinto).');
  END;

  FETCH NEXT FROM cur INTO @proc;
END

CLOSE cur;
DEALLOCATE cur;
GO
