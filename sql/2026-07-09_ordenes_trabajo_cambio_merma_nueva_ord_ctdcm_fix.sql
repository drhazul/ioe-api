/*
  2026-07-09
  ORD cambio/merma: la nueva ORD derivada debe nacer con CTD = CTD_C_M.
  Repara derivadas ya creadas cuando la relacion origen/nueva esta sellada y
  la nueva ORD conserva CTD distinta a CTD_C_M.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @repair TABLE (
  IORD_ORIG NVARCHAR(255) NOT NULL,
  IORD_NUEVA NVARCHAR(255) NOT NULL,
  CTD_ORIG FLOAT NULL,
  CTD_C_M FLOAT NOT NULL,
  CTD_NUEVA_ANT FLOAT NULL,
  CTD_C_M_NUEVA_ANT FLOAT NULL,
  ESTSEGU_NUEVA FLOAT NULL
);

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @spCambio NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_cambio_material'));
  IF @spCambio IS NULL
    THROW 59071, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio,
    'CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material');
  SET @spCambio = REPLACE(@spCambio,
    'CREATE   PROCEDURE dbo.sp_ordenes_trabajo_cambio_material',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material');
  SET @spCambio = REPLACE(@spCambio,
    'CREATE PROCEDURE dbo.sp_ordenes_trabajo_cambio_material',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material');

  IF CHARINDEX('@NEW_CTD = @ctdOrig,', @spCambio) = 0
     AND CHARINDEX('@NEW_CTD = @ctdAfectada,', @spCambio) = 0
    THROW 59072, 'No se encontro asignacion @NEW_CTD esperada en sp_ordenes_trabajo_cambio_material', 1;

  SET @spCambio = REPLACE(@spCambio, '@NEW_CTD = @ctdOrig,', '@NEW_CTD = @ctdAfectada,');
  EXEC sp_executesql @spCambio;

  DECLARE @spMerma NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_merma'));
  IF @spMerma IS NULL
    THROW 59073, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma,
    'CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma');
  SET @spMerma = REPLACE(@spMerma,
    'CREATE   PROCEDURE dbo.sp_ordenes_trabajo_merma',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma');
  SET @spMerma = REPLACE(@spMerma,
    'CREATE PROCEDURE dbo.sp_ordenes_trabajo_merma',
    'ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma');

  IF CHARINDEX('@NEW_CTD = @ctdOrig,', @spMerma) = 0
     AND CHARINDEX('@NEW_CTD = @ctdAfectada,', @spMerma) = 0
    THROW 59074, 'No se encontro asignacion @NEW_CTD esperada en sp_ordenes_trabajo_merma', 1;

  SET @spMerma = REPLACE(@spMerma, '@NEW_CTD = @ctdOrig,', '@NEW_CTD = @ctdAfectada,');
  EXEC sp_executesql @spMerma;

  INSERT INTO @repair (
    IORD_ORIG,
    IORD_NUEVA,
    CTD_ORIG,
    CTD_C_M,
    CTD_NUEVA_ANT,
    CTD_C_M_NUEVA_ANT,
    ESTSEGU_NUEVA
  )
  SELECT
    o.IORD,
    n.IORD,
    TRY_CONVERT(FLOAT, o.CTD),
    TRY_CONVERT(FLOAT, o.CTD_C_M),
    TRY_CONVERT(FLOAT, n.CTD),
    TRY_CONVERT(FLOAT, n.CTD_C_M),
    TRY_CONVERT(FLOAT, n.ESTSEGU)
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN dbo.PV_CTR_ORDS n
    ON UPPER(LTRIM(RTRIM(ISNULL(n.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.REEORD, ''))))
   AND UPPER(LTRIM(RTRIM(ISNULL(n.REEORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.IORD, ''))))
  WHERE (
      ABS(ISNULL(TRY_CONVERT(FLOAT, o.CTD_C_M), 0) - 1.0) <= 0.0001
      OR ABS(ISNULL(TRY_CONVERT(FLOAT, o.CTD_C_M), 0) - 0.5) <= 0.0001
    )
    AND ABS(ISNULL(TRY_CONVERT(FLOAT, n.CTD), 0) - TRY_CONVERT(FLOAT, o.CTD_C_M)) > 0.0001
    AND TRY_CONVERT(FLOAT, o.ESTSEGU) = 4
    AND ISNULL(TRY_CONVERT(INT, n.TIPOM), 0) = 0;

  UPDATE n
  SET
    n.CTD = r.CTD_C_M,
    n.CTD_C_M = r.CTD_C_M,
    n.FCNMOD = GETDATE()
  FROM dbo.PV_CTR_ORDS n
  INNER JOIN @repair r
    ON UPPER(LTRIM(RTRIM(ISNULL(n.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(r.IORD_NUEVA, ''))));

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT
  IORD_ORIG,
  IORD_NUEVA,
  CTD_ORIG,
  CTD_C_M,
  CTD_NUEVA_ANT,
  CTD_C_M_NUEVA_ANT,
  ESTSEGU_NUEVA,
  CTD_C_M AS CTD_NUEVA_CORREGIDA
FROM @repair
ORDER BY IORD_NUEVA;
