SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID('dbo.DAT_FORM', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.DAT_FORM (
      IDFORM INT IDENTITY(1,1) NOT NULL,
      ASPEL INT NULL,
      FORM VARCHAR(50) NOT NULL,
      NOM VARCHAR(50) NULL,
      ESTADO BIT NOT NULL CONSTRAINT DF_DAT_FORM_ESTADO DEFAULT (1),
      CONSTRAINT PK_DAT_FORM PRIMARY KEY CLUSTERED (IDFORM)
    );
  END
  ELSE
  BEGIN
    IF COL_LENGTH('dbo.DAT_FORM', 'IDFORM') IS NULL
    BEGIN
      ALTER TABLE dbo.DAT_FORM
      ADD IDFORM INT IDENTITY(1,1) NOT NULL;
    END;

    IF COL_LENGTH('dbo.DAT_FORM', 'ESTADO') IS NULL
    BEGIN
      ALTER TABLE dbo.DAT_FORM ADD ESTADO BIT NULL;
    END;

    EXEC sys.sp_executesql N'
      UPDATE dbo.DAT_FORM
      SET ESTADO = 1
      WHERE ESTADO IS NULL;
    ';

    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.DAT_FORM
      ALTER COLUMN ESTADO BIT NOT NULL;
    ';

    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('dbo.DAT_FORM')
        AND UPPER(c.name) = 'ESTADO'
    )
    BEGIN
      EXEC sys.sp_executesql N'
        ALTER TABLE dbo.DAT_FORM
        ADD CONSTRAINT DF_DAT_FORM_ESTADO DEFAULT (1) FOR ESTADO;
      ';
    END;

    DECLARE @pkName SYSNAME;
    SELECT TOP 1 @pkName = kc.name
    FROM sys.key_constraints kc
    WHERE kc.parent_object_id = OBJECT_ID('dbo.DAT_FORM')
      AND kc.[type] = 'PK';

    DECLARE @pkOnIdform BIT = 0;
    SELECT @pkOnIdform = CASE
      WHEN EXISTS (
        SELECT 1
        FROM sys.key_constraints kc
        INNER JOIN sys.index_columns ic
          ON ic.object_id = kc.parent_object_id
         AND ic.index_id = kc.unique_index_id
        INNER JOIN sys.columns c
          ON c.object_id = ic.object_id
         AND c.column_id = ic.column_id
        WHERE kc.parent_object_id = OBJECT_ID('dbo.DAT_FORM')
          AND kc.[type] = 'PK'
          AND ic.key_ordinal = 1
          AND UPPER(c.name) = 'IDFORM'
      ) THEN 1
      ELSE 0
    END;

    IF @pkName IS NULL
    BEGIN
      ALTER TABLE dbo.DAT_FORM
      ADD CONSTRAINT PK_DAT_FORM PRIMARY KEY CLUSTERED (IDFORM);
    END
    ELSE IF @pkOnIdform = 0
    BEGIN
      DECLARE @dropPkSql NVARCHAR(500) =
        N'ALTER TABLE dbo.DAT_FORM DROP CONSTRAINT [' + @pkName + N']';
      EXEC sys.sp_executesql @dropPkSql;

      ALTER TABLE dbo.DAT_FORM
      ADD CONSTRAINT PK_DAT_FORM PRIMARY KEY CLUSTERED (IDFORM);
    END;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
