/* El historial se expande en la API solo cuando se filtra un flujo.
   Evita calcular STRING_AGG para todas las ORDs antes de paginar. */
DECLARE @panel nvarchar(max) = OBJECT_DEFINITION(
  OBJECT_ID('dbo.sp_ordenes_trabajo_panel')
);

IF @panel IS NULL
  THROW 59210, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

SET @panel = REPLACE(@panel, N'      hist.FLUJO_HISTORIAL,' + CHAR(13) + CHAR(10), N'');
SET @panel = REPLACE(@panel, N'      hist.FLUJO_HISTORIAL,' + CHAR(10), N'');

DECLARE @inicio int = CHARINDEX(
  N'    OUTER APPLY (' + CHAR(10) + N'      SELECT STRING_AGG(',
  @panel
);
DECLARE @fin int = CHARINDEX(
  N'    ) hist' + CHAR(10) + N'    LEFT JOIN dbo.DAT_EST_ORD e',
  @panel,
  @inicio
);

IF @inicio > 0 AND @fin > @inicio
BEGIN
  SET @panel = STUFF(
    @panel,
    @inicio,
    @fin + LEN(N'    ) hist') - @inicio,
    N''
  );
END;

DECLARE @createPos int = CHARINDEX('CREATE', UPPER(@panel));
IF UPPER(SUBSTRING(@panel, @createPos, LEN('CREATE OR ALTER'))) <> 'CREATE OR ALTER'
BEGIN
  SET @panel = STUFF(@panel, @createPos, LEN('CREATE'), 'CREATE OR ALTER');
END;

EXEC sp_executesql @panel;
GO
