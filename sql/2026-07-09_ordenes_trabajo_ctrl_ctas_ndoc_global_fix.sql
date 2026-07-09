/*
  Ordenes de trabajo / Cambio material y Merma
  Corrige generación de NDOC en diferencias contables para DAT_CTR_DOC.
  DAT_CTR_DOC tiene PK global por DOC; el SP anterior calculaba máximo por CLSMOV,
  pudiendo generar un DOC ya usado por otro movimiento.
*/

SET NOCOUNT ON;

IF OBJECT_ID('dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 'P') IS NULL
  THROW 59081, 'No existe dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 1;

DECLARE @sp NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff'));

SET @sp = REPLACE(@sp, 'CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 'ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff');
SET @sp = REPLACE(@sp, 'CREATE   PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 'ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff');
SET @sp = REPLACE(@sp, 'CREATE PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 'ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff');

IF CHARINDEX('OT_CYM_CTRLCTA_DOC_GLOBAL', @sp) = 0
BEGIN
  IF CHARINDEX('DECLARE @lockResource NVARCHAR(255) = CONCAT(''OT_CYM_CTRLCTA_'', @mov);', @sp) = 0
    THROW 59082, 'No se encontro lockResource esperado en sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 1;

  SET @sp = REPLACE(
    @sp,
    'DECLARE @lockResource NVARCHAR(255) = CONCAT(''OT_CYM_CTRLCTA_'', @mov);',
    'DECLARE @lockResource NVARCHAR(255) = ''OT_CYM_CTRLCTA_DOC_GLOBAL'';'
  );
END;

IF CHARINDEX('WHILE OBJECT_ID(''dbo.DAT_CTR_DOC'', ''U'') IS NOT NULL', @sp) = 0
BEGIN
  IF CHARINDEX('SET @ndoc = CONCAT(RIGHT(REPLICATE(''0'', @docWidth) + CONVERT(VARCHAR(50), @nextDoc), @docWidth), ''GT'', ISNULL(@sucNorm, ''''));', @sp) = 0
    THROW 59084, 'No se encontro asignacion @ndoc esperada en sp_ordenes_trabajo_registrar_ctrl_ctas_diff', 1;

  SET @sp = REPLACE(
    @sp,
    'SET @ndoc = CONCAT(RIGHT(REPLICATE(''0'', @docWidth) + CONVERT(VARCHAR(50), @nextDoc), @docWidth), ''GT'', ISNULL(@sucNorm, ''''));',
    'SET @ndoc = CONCAT(RIGHT(REPLICATE(''0'', @docWidth) + CONVERT(VARCHAR(50), @nextDoc), @docWidth), ''GT'', ISNULL(@sucNorm, ''''));

  WHILE OBJECT_ID(''dbo.DAT_CTR_DOC'', ''U'') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM dbo.DAT_CTR_DOC WITH (UPDLOCK, HOLDLOCK)
       WHERE LTRIM(RTRIM(ISNULL(DOC, ''''))) = @ndoc
     )
  BEGIN
    SET @nextDoc += 1;
    SET @ndoc = CONCAT(RIGHT(REPLICATE(''0'', @docWidth) + CONVERT(VARCHAR(50), @nextDoc), @docWidth), ''GT'', ISNULL(@sucNorm, ''''));
  END;'
  );
END;

EXEC sys.sp_executesql @sp;

PRINT 'sp_ordenes_trabajo_registrar_ctrl_ctas_diff actualizado: NDOC global para DAT_CTR_DOC.';
