/*
  ORD cambio/merma - corrección de flujo para ORDs derivadas
  Fecha: 2026-05-22

  Objetivo:
  1) ORDs nuevas derivadas de cambio/merma no deben heredar TIPOM=1/2 (se fuerza TIPOM=0 en clonación).
  2) En recibir en tienda (flujo 9), ORDs derivadas (REEORD con relación) siempre pasan a flujo 10.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @spCambio NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_cambio_material'));
IF @spCambio IS NULL
  THROW 59001, 'No existe dbo.sp_ordenes_trabajo_cambio_material', 1;

SET @spCambio = REPLACE(@spCambio, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @spCambio = REPLACE(@spCambio, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @spCambio = REPLACE(@spCambio, '@TIPOM = @tipom,', '@TIPOM = 0,');
IF CHARINDEX('@TIPOM = 0,', @spCambio) = 0
  THROW 59002, 'No fue posible parchear TIPOM en sp_ordenes_trabajo_cambio_material', 1;

EXEC sp_executesql @spCambio;
GO

DECLARE @spMerma NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_merma'));
IF @spMerma IS NULL
  THROW 59003, 'No existe dbo.sp_ordenes_trabajo_merma', 1;

SET @spMerma = REPLACE(@spMerma, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @spMerma = REPLACE(@spMerma, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @spMerma = REPLACE(@spMerma, '@TIPOM = @tipom,', '@TIPOM = 0,');
IF CHARINDEX('@TIPOM = 0,', @spMerma) = 0
  THROW 59004, 'No fue posible parchear TIPOM en sp_ordenes_trabajo_merma', 1;

EXEC sp_executesql @spMerma;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_regresar_tienda_lote
  @IORDS NVARCHAR(MAX),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ords TABLE (IORD NVARCHAR(255) NOT NULL PRIMARY KEY);
  INSERT INTO @ords (IORD)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(value, ''))))
  FROM STRING_SPLIT(ISNULL(@IORDS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (SELECT 1 FROM @ords)
    THROW 58330, 'Debe enviar al menos una ORD en @IORDS', 1;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @target TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY,
    IDFOL NVARCHAR(255) NULL,
    SUC NVARCHAR(10) NULL,
    ESTSEGU FLOAT NULL,
    TIPOM INT NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU, TIPOM)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))),
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU),
    TRY_CONVERT(INT, o.TIPOM)
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  INNER JOIN @ords i
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = i.IORD
  WHERE
    (
      @SUC IS NULL
      OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@SUC)
      OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) = UPPER(@SUC)
    )
    AND (
      @IS_ADMIN = 1
      OR NOT EXISTS (SELECT 1 FROM @allowed)
      OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (SELECT SUC FROM @allowed)
      OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) IN (SELECT SUC FROM @allowed)
    );

  IF EXISTS (
    SELECT 1
    FROM @ords i
    LEFT JOIN @target t ON t.IORD = i.IORD
    WHERE t.IORD IS NULL
  )
  BEGIN
    DECLARE @missingIords NVARCHAR(2000) = (
      SELECT STRING_AGG(i.IORD, ', ')
      FROM @ords i
      LEFT JOIN @target t ON t.IORD = i.IORD
      WHERE t.IORD IS NULL
    );
    DECLARE @missingMsg NVARCHAR(2048) = LEFT(
      CONCAT('ORD no encontrada o sin acceso por sucursal: ', ISNULL(@missingIords, '')),
      2048
    );
    THROW 58331, @missingMsg, 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.ESTSEGU, -1) <> 9
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.ESTSEGU, -1) <> 9
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden recibir en tienda ORDs en estatus 9: ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58332, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = CASE
        WHEN
          NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''))), '') IS NOT NULL
          THEN 10
        WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 9.1
        WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 9.2
        ELSE 10
      END,
      o.ESTATUS = 2,
      o.FCNRT = GETDATE(),
      o.FCNMOD = GETDATE()
    FROM dbo.PV_CTR_ORDS o
    INNER JOIN @target t
      ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    o.IORD,
    o.IDFOL,
    o.SUC,
    o.ESTATUS,
    o.ESTSEGU,
    o.TIPOM,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN @target t
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD
  ORDER BY o.IORD;
END;
GO
