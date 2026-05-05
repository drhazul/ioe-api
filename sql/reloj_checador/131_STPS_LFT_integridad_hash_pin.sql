SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID('dbo.ATT_TIME_LOG', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.ATT_TIME_LOG', 'hash_verificacion') IS NULL
  BEGIN
    ALTER TABLE dbo.ATT_TIME_LOG
      ADD hash_verificacion VARCHAR(64) NULL;
  END;

  IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.COLABORADORES', 'pin') IS NOT NULL
  BEGIN
    DECLARE @pinLength INT = NULL;
    SELECT TOP 1 @pinLength = c.max_length
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.COLABORADORES')
      AND c.name = 'pin';

    IF ISNULL(@pinLength, 0) < 100
    BEGIN
      ALTER TABLE dbo.COLABORADORES
        ALTER COLUMN pin VARCHAR(100) NOT NULL;
    END;
  END;

  IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.COLABORADORES', 'secure_pin') IS NOT NULL
  BEGIN
    DECLARE @securePinLength INT = NULL;
    SELECT TOP 1 @securePinLength = c.max_length
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.COLABORADORES')
      AND c.name = 'secure_pin';

    IF ISNULL(@securePinLength, 0) < 100
    BEGIN
      ALTER TABLE dbo.COLABORADORES
        ALTER COLUMN secure_pin VARCHAR(100) NULL;
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
