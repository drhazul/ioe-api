/*
  2026-04-19
  Cambio material / Merma
  Regla de negocio: nueva ORD conserva costo base de ORD original
  para evitar diferencias de precio entre ORD origen y ORD derivada.
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
DECLARE @needle NVARCHAR(MAX) = N'SET @importeOrig = ROUND(ISNULL(@precioOrig, 0) * @ctdAfectada, 2);';
DECLARE @patch NVARCHAR(MAX) = N'SET @precioNuevo = ISNULL(@precioOrig, 0);
    SET @importeOrig = ROUND(ISNULL(@precioOrig, 0) * @ctdAfectada, 2);';
DECLARE @err NVARCHAR(4000);
DECLARE @upperDef NVARCHAR(MAX);
DECLARE @posCreate INT;
DECLARE @posProcedure INT;

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
    THROW 58120, @msg, 1;
  END;

  IF @definition LIKE '%SET @precioNuevo = ISNULL(@precioOrig, 0);%'
  BEGIN
    PRINT CONCAT('Sin cambios en dbo.', @proc, ' (regla precio ya aplicada).');
  END
  ELSE
  BEGIN
    SET @updated = REPLACE(@definition, @needle, @patch);
    SET @upperDef = UPPER(@updated);
    SET @posCreate = CHARINDEX('CREATE', @upperDef);
    SET @posProcedure = CHARINDEX('PROCEDURE', @upperDef);
    IF @posCreate > 0 AND @posProcedure > @posCreate
    BEGIN
      SET @updated = STUFF(@updated, @posCreate, 6, 'ALTER');
    END;
    IF @updated <> @definition
    BEGIN
      BEGIN TRY
        EXEC sp_executesql @updated;
        PRINT CONCAT('Actualizado dbo.', @proc, ' con precio igual a ORD original.');
      END TRY
      BEGIN CATCH
        SET @err = CONCAT(
          'Error actualizando dbo.',
          @proc,
          ': ',
          ERROR_MESSAGE()
        );
        THROW 58121, @err, 1;
      END CATCH;
    END
    ELSE
    BEGIN
      PRINT CONCAT('Sin cambios en dbo.', @proc, ' (patrón no encontrado).');
    END;
  END;

  FETCH NEXT FROM cur INTO @proc;
END

CLOSE cur;
DEALLOCATE cur;
GO
