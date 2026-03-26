/*
  2026-03-23
  Flujo ORDs: envío masivo a maquila/bisel
  - Recibe lista de IORD
  - Valida alcance por sucursal
  - Exige ESTSEGU = 3 (NUEVA AUTORIZADA)
  - Actualiza ESTSEGU = 5 (ENTREGADA A MAQ O BISEL)
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_enviar_lote
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

  DECLARE @ords TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY
  );

  INSERT INTO @ords (IORD)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(value, ''))))
  FROM STRING_SPLIT(ISNULL(@IORDS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (SELECT 1 FROM @ords)
    THROW 58100, 'Debe enviar al menos una ORD en @IORDS', 1;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @target TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY,
    IDFOL NVARCHAR(255) NULL,
    SUC NVARCHAR(10) NULL,
    ESTSEGU FLOAT NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU
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
    THROW 58101, @missingMsg, 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.ESTSEGU, -1) <> 3
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.ESTSEGU, -1) <> 3
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden enviar ORDs en estatus 3 (NUEVA AUTORIZADA): ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58102, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = 5,
      o.ESTATUS = 2,
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
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN @target t
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD
  ORDER BY o.IORD;
END;
GO
