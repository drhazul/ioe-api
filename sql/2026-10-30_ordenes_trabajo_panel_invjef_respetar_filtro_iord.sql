/*
  IOEDESARROLLO: aplicar el filtro IORD del panel operativo para INVJEF.
  La UI elimina filtros retenidos al abrir, pero debe respetar el IORD ingresado
  por el usuario al pulsar Aplicar filtros.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOEDESARROLLO'
  THROW 59097, 'Este ajuste solo se permite en IOEDESARROLLO', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spPanel NVARCHAR(MAX) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ordenes_trabajo_panel'));
  IF @spPanel IS NULL
    THROW 59098, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

  SET @spPanel = REPLACE(@spPanel, CHAR(13), N'');
  SET @spPanel = REPLACE(@spPanel, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @filterNormal NVARCHAR(MAX) =
    N'(@IORD IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''''))) LIKE ''%'' + @IORD + ''%'')';
  DECLARE @filterBypass NVARCHAR(MAX) =
    N'(@IORD IS NULL OR (@PANEL_MODE = ''operativo'' AND @ROLE_CODE = ''INVJEF'') OR LTRIM(RTRIM(ISNULL(o.IORD, ''''))) LIKE ''%'' + @IORD + ''%'')';

  IF CHARINDEX(@filterBypass, @spPanel) > 0
    SET @spPanel = REPLACE(@spPanel, @filterBypass, @filterNormal);
  ELSE IF CHARINDEX(@filterNormal, @spPanel) = 0
    THROW 59099, 'No se encontró la regla IORD esperada; no se modificó el procedimiento', 1;

  EXEC sys.sp_executesql @spPanel;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
