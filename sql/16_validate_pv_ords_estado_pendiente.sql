SET NOCOUNT ON;

DECLARE @module NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_pv_ctr_ords_create_from_quote_line'));

IF @module IS NULL
BEGIN
  THROW 51000, 'No existe dbo.sp_pv_ctr_ords_create_from_quote_line en la base actual.', 1;
END;

SELECT
  CASE WHEN @module LIKE '%estado PENDIENTE%' THEN 1 ELSE 0 END AS TieneMensajePendiente,
  CASE WHEN @module LIKE '%IF @estadoNorm <> ''PENDIENTE''%' THEN 1 ELSE 0 END AS ValidaEstadoPendiente,
  CASE WHEN @module LIKE '%IF @estadoNorm IN (''EDITANDO'', ''PAGADO2'', ''DEV PEND'')%' THEN 1 ELSE 0 END AS MantieneCompatibilidadLegacy,
  CASE WHEN @module LIKE '%estado EDITANDO%' THEN 1 ELSE 0 END AS TieneMensajeLegacyEditando;
