/*
  IOEDESARROLLO: el panel operativo de DAT_JAO_ORD para INVJEF muestra
  la cola de autorización disponible, aunque el cliente conserve una ORD
  en el filtro IORD. Los demás roles y modos mantienen el filtro existente.
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

  SET @spPanel = REPLACE(@spPanel, 'CREATE                 PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
  SET @spPanel = REPLACE(@spPanel, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

  DECLARE @filterCurrent NVARCHAR(MAX) =
    N'(@IORD IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''''))) LIKE ''%'' + @IORD + ''%'')';
  DECLARE @filterCorrected NVARCHAR(MAX) =
    N'(@IORD IS NULL OR (@PANEL_MODE = ''operativo'' AND @ROLE_CODE = ''INVJEF'') OR LTRIM(RTRIM(ISNULL(o.IORD, ''''))) LIKE ''%'' + @IORD + ''%'')';

  IF CHARINDEX(@filterCurrent, @spPanel) > 0
    SET @spPanel = REPLACE(@spPanel, @filterCurrent, @filterCorrected);
  ELSE IF CHARINDEX(@filterCorrected, @spPanel) = 0
    THROW 59099, 'No se encontró el filtro IORD esperado; no se modificó el procedimiento', 1;

  EXEC sys.sp_executesql @spPanel;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
