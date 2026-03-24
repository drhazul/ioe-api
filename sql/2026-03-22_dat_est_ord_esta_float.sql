/*
  2026-03-22
  DAT_EST_ORD.ESTA debe permitir estados intermedios (ej. 9.1).
  Este script convierte ESTA a FLOAT y mantiene PK.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.DAT_EST_ORD', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DAT_EST_ORD (
    ESTA FLOAT NOT NULL,
    TIPO NVARCHAR(255) NULL,
    USR NVARCHAR(255) NULL,
    CONSTRAINT PK_DAT_EST_ORD PRIMARY KEY CLUSTERED (ESTA ASC)
  );
  RETURN;
END;
GO

DECLARE @estaType SYSNAME = NULL;

SELECT TOP 1 @estaType = t.name
FROM sys.columns c
INNER JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.DAT_EST_ORD')
  AND c.name = 'ESTA';

IF @estaType IS NULL
  THROW 59001, 'DAT_EST_ORD no contiene columna ESTA', 1;

IF @estaType <> 'float'
BEGIN
  DECLARE @pkName SYSNAME = NULL;
  SELECT TOP 1 @pkName = kc.name
  FROM sys.key_constraints kc
  INNER JOIN sys.index_columns ic
    ON ic.object_id = kc.parent_object_id
   AND ic.index_id = kc.unique_index_id
  INNER JOIN sys.columns c
    ON c.object_id = ic.object_id
   AND c.column_id = ic.column_id
  WHERE kc.parent_object_id = OBJECT_ID('dbo.DAT_EST_ORD')
    AND kc.[type] = 'PK'
    AND c.name = 'ESTA';

  IF @pkName IS NOT NULL
    EXEC('ALTER TABLE dbo.DAT_EST_ORD DROP CONSTRAINT [' + @pkName + ']');

  ALTER TABLE dbo.DAT_EST_ORD
  ALTER COLUMN ESTA FLOAT NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.DAT_EST_ORD')
      AND [type] = 'PK'
  )
  BEGIN
    ALTER TABLE dbo.DAT_EST_ORD
    ADD CONSTRAINT PK_DAT_EST_ORD PRIMARY KEY CLUSTERED (ESTA ASC);
  END;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM dbo.DAT_EST_ORD
  WHERE ABS(TRY_CONVERT(FLOAT, ESTA) - 9.1) < 0.0001
)
BEGIN
  INSERT INTO dbo.DAT_EST_ORD (ESTA, TIPO, USR)
  VALUES (9.1, N'REGRESADO PARA MERMA', N'IFT');
END;
GO
