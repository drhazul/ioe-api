/* Permite que la exportación use una sola consulta con todos los resultados. */
DECLARE @panel nvarchar(max) = OBJECT_DEFINITION(
  OBJECT_ID('dbo.sp_ordenes_trabajo_panel')
);

IF @panel IS NULL
  THROW 59220, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

IF CHARINDEX('@EXPORT BIT', @panel) = 0
BEGIN
  SET @panel = REPLACE(
    @panel,
    N'  @ROLE_CODE NVARCHAR(50) = NULL',
    N'  @ROLE_CODE NVARCHAR(50) = NULL,' + CHAR(13) + CHAR(10) +
      N'  @EXPORT BIT = 0'
  );
END;

SET @panel = REPLACE(
  @panel,
  N'  IF @PAGESIZE > 25 SET @PAGESIZE = 25;',
  N'  IF ISNULL(@EXPORT, 0) = 0 AND @PAGESIZE > 25 SET @PAGESIZE = 25;'
);

DECLARE @createPos int = CHARINDEX('CREATE', UPPER(@panel));
IF UPPER(SUBSTRING(@panel, @createPos, LEN('CREATE OR ALTER'))) <> 'CREATE OR ALTER'
BEGIN
  SET @panel = STUFF(@panel, @createPos, LEN('CREATE'), 'CREATE OR ALTER');
END;

EXEC sp_executesql @panel;
GO
