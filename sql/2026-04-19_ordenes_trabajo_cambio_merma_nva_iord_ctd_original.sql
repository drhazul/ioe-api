/*
  2026-04-19
  Cambio material / merma
  - Agrega NVA_IORD en staging temporal (PV_ORD_CAMBIO_MERMA_TMP)
  - Nueva ORD se genera con CTD original (no CTD_C_M)
  - CTD_C_M queda solo para afectacion contable (MB51 / diferencia)
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.PV_ORD_CAMBIO_MERMA_TMP', 'NVA_IORD') IS NULL
BEGIN
  ALTER TABLE dbo.PV_ORD_CAMBIO_MERMA_TMP
    ADD NVA_IORD NVARCHAR(255) NULL;
END;
GO

DECLARE @targets TABLE (proc_name SYSNAME PRIMARY KEY);
INSERT INTO @targets (proc_name)
VALUES
  ('sp_ordenes_trabajo_cambio_material'),
  ('sp_ordenes_trabajo_merma');

DECLARE @proc SYSNAME;
DECLARE @definition NVARCHAR(MAX);
DECLARE @updated NVARCHAR(MAX);
DECLARE @upperDef NVARCHAR(MAX);
DECLARE @posCreate INT;
DECLARE @posProcedure INT;
DECLARE @msg NVARCHAR(2048);

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
    THROW 58140, @msg, 1;
  END;

  SET @updated = @definition;

  SET @updated = REPLACE(
    @updated,
    '@NEW_CTD = @ctdAfectada,',
    '@NEW_CTD = @ctdOrig,'
  );

  SET @updated = REPLACE(
    @updated,
    'CTD = CASE WHEN @remanente > 0 THEN @remanente ELSE CTD END,',
    'CTD = @ctdOrig,'
  );

  IF @updated <> @definition
  BEGIN
    SET @upperDef = UPPER(@updated);
    SET @posCreate = CHARINDEX('CREATE', @upperDef);
    SET @posProcedure = CHARINDEX('PROCEDURE', @upperDef);
    IF @posCreate > 0 AND @posProcedure > @posCreate
    BEGIN
      SET @updated = STUFF(@updated, @posCreate, 6, 'ALTER');
    END;

    EXEC sp_executesql @updated;
    PRINT CONCAT('Actualizado dbo.', @proc, ' con CTD original para nueva ORD.');
  END
  ELSE
  BEGIN
    PRINT CONCAT('Sin cambios en dbo.', @proc, '.');
  END;

  FETCH NEXT FROM cur INTO @proc;
END

CLOSE cur;
DEALLOCATE cur;
GO
