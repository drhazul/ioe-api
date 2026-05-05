/*
  2026-05-01
  Recepción ORDs por laboratorio externo:
  - Si DAT_LAB.SUC está vacío o laboratorio está marcado como externo,
    recepción desde estatus 5 pasa directo a estatus 10 (pendiente entrega cliente).
  - Laboratorio interno conserva flujo 5 -> 7.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_recibir_lote
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
    THROW 58210, 'Debe enviar al menos una ORD en @IORDS', 1;

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
    LAB_SUC NVARCHAR(10) NULL,
    LAB_TIPOLAB NVARCHAR(100) NULL,
    LAB_DESC NVARCHAR(255) NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU, LAB_SUC, LAB_TIPOLAB, LAB_DESC)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
    UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) AS LAB_SUC,
    UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))) AS LAB_TIPOLAB,
    UPPER(LTRIM(RTRIM(ISNULL(lab.LAB, '')))) AS LAB_DESC
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
    THROW 58211, @missingMsg, 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.ESTSEGU, -1) <> 5
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.ESTSEGU, -1) <> 5
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden recibir ORDs en estatus 5 (ENTREGADA A MAQ O BISEL): ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58212, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = CASE
        WHEN ISNULL(t.LAB_SUC, '') = ''
          OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
          OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
        THEN 10
        ELSE 7
      END,
      o.ESTATUS = 2,
      o.FCNRT = CASE
        WHEN ISNULL(t.LAB_SUC, '') = ''
          OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
          OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
        THEN GETDATE()
        ELSE o.FCNRT
      END,
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

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_recibir
  @IORD NVARCHAR(255),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE @estadoActual FLOAT = NULL;
  DECLARE @labSuc NVARCHAR(10) = '';
  DECLARE @labTipo NVARCHAR(100) = '';
  DECLARE @labDesc NVARCHAR(255) = '';

  SELECT TOP 1
    @estadoActual = TRY_CONVERT(FLOAT, o.ESTSEGU),
    @labSuc = UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))),
    @labTipo = UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))),
    @labDesc = UPPER(LTRIM(RTRIM(ISNULL(lab.LAB, ''))))
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  WHERE o.IORD = @IORD
    AND (
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

  IF @estadoActual IS NULL
    THROW 58230, 'No existe la ORD o no está autorizada para la sucursal', 1;

  IF ABS(@estadoActual - 5) > 0.0001
    THROW 58231, 'La ORD debe estar en estatus 5 (ENTREGADA A MAQ O BISEL) para poder recibirse', 1;

  DECLARE @isLabExterno BIT = CASE
    WHEN ISNULL(@labSuc, '') = ''
      OR ISNULL(@labTipo, '') LIKE '%EXTER%'
      OR ISNULL(@labDesc, '') LIKE '%EXTER%'
    THEN 1
    ELSE 0
  END;

  DECLARE @estadoDestino FLOAT = CASE WHEN @isLabExterno = 1 THEN 10 ELSE 7 END;

  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = @estadoDestino,
    @ESTATUS = 2,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;

  IF @isLabExterno = 1 AND COL_LENGTH('dbo.PV_CTR_ORDS', 'FCNRT') IS NOT NULL
  BEGIN
    UPDATE o
    SET
      o.FCNRT = GETDATE(),
      o.FCNMOD = GETDATE()
    FROM dbo.PV_CTR_ORDS o
    WHERE o.IORD = @IORD;
  END;
END;
GO