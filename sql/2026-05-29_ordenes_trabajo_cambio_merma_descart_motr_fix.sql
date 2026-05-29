/*
  2026-05-29
  ORD cambio/merma: asegurar consistencia ART-DESCART en nueva ORD y evitar herencia de MOTR.
  Incluye rollback puntual para ORD DF01132910085 (alinear DESCART con DAT_ART.DES segun ART).
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spCambio NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_cambio_material'));
  IF @spCambio IS NULL
    THROW 59031, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio,
    'CREATE   PROCEDURE dbo.sp_ordenes_trabajo_cambio_material',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material');
  SET @spCambio = REPLACE(@spCambio,
    'CREATE PROCEDURE dbo.sp_ordenes_trabajo_cambio_material',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material');

  IF CHARINDEX('@MOTR = @motrInt,', @spCambio) = 0
    THROW 59032, 'No se encontro firma @MOTR esperada en sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio, '@MOTR = @motrInt,', '@MOTR = NULL,');

  IF CHARINDEX('WHERE IORD = @newIord;', @spCambio) = 0
    THROW 59033, 'No se encontro bloque de UPDATE nueva ORD en sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(
    @spCambio,
    'WHERE IORD = @newIord;',
    'WHERE IORD = @newIord;

    UPDATE dbo.PV_CTR_ORDS
    SET
      MOTR = NULL,
      TIPOM = 0,
      DESCART = COALESCE(
        (
          SELECT TOP 1 LTRIM(RTRIM(ISNULL(a.DES, '''')))
          FROM dbo.DAT_ART a
          WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '''')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '''')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''''))))
          ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC
        ),
        DESCART
      ),
      FCNMOD = GETDATE()
    WHERE IORD = @newIord;'
  );

  EXEC sp_executesql @spCambio;

  DECLARE @spMerma NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_merma'));
  IF @spMerma IS NULL
    THROW 59034, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma,
    'CREATE   PROCEDURE dbo.sp_ordenes_trabajo_merma',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma');
  SET @spMerma = REPLACE(@spMerma,
    'CREATE PROCEDURE dbo.sp_ordenes_trabajo_merma',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma');

  IF CHARINDEX('@MOTR = @motrInt,', @spMerma) = 0
    THROW 59035, 'No se encontro firma @MOTR esperada en sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma, '@MOTR = @motrInt,', '@MOTR = NULL,');

  IF CHARINDEX('WHERE IORD = @newIord;', @spMerma) = 0
    THROW 59036, 'No se encontro bloque de UPDATE nueva ORD en sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(
    @spMerma,
    'WHERE IORD = @newIord;',
    'WHERE IORD = @newIord;

      UPDATE dbo.PV_CTR_ORDS
      SET
        MOTR = NULL,
        TIPOM = 0,
        DESCART = COALESCE(
          (
            SELECT TOP 1 LTRIM(RTRIM(ISNULL(a.DES, '''')))
            FROM dbo.DAT_ART a
            WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '''')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''''))))
              AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '''')))) = UPPER(LTRIM(RTRIM(ISNULL(@artSalida, ''''))))
            ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC
          ),
          DESCART
        ),
        FCNMOD = GETDATE()
      WHERE IORD = @newIord;'
  );

  EXEC sp_executesql @spMerma;

  DECLARE @iordRollback NVARCHAR(255) = 'DF01132910085';

  UPDATE o
  SET
    o.DESCART = LEFT(LTRIM(RTRIM(ISNULL(a.DES, o.DESCART))), 255),
    o.FCNMOD = GETDATE()
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN dbo.DAT_ART a
    ON UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
   AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.ART, ''))))
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@iordRollback);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT
  IORD,
  SUC,
  ART,
  DESCART,
  TIPOM,
  MOTR,
  REEORD,
  ESTSEGU,
  FCNMOD
FROM dbo.PV_CTR_ORDS
WHERE IORD IN ('DF01132900182', 'DF01132910085');
