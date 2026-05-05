/*
  2026-05-03
  ORDs - Laboratorio externo en flujo de envio/recepcion:
  1) Enviar a taller:
     - laboratorio interno: 3 -> 5
     - laboratorio externo (DAT_LAB.UBILAB='EXTERNO'): 3 -> 9
  2) Recibir en taller:
     - interno: 5 -> 7
     - externo: 9 -> 10 (tambien soporta 5 -> 10 para casos previos)
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
    ESTSEGU FLOAT NULL,
    LABOR INT NULL,
    LAB_SUC NVARCHAR(10) NULL,
    LAB_TIPOLAB NVARCHAR(100) NULL,
    LAB_UBILAB NVARCHAR(100) NULL,
    LAB_DESC NVARCHAR(255) NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU, LABOR, LAB_SUC, LAB_TIPOLAB, LAB_UBILAB, LAB_DESC)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
    TRY_CONVERT(INT, o.LABOR) AS LABOR,
    UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) AS LAB_SUC,
    UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))) AS LAB_TIPOLAB,
    UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))) AS LAB_UBILAB,
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

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.LABOR, 0) <= 0
  )
  BEGIN
    DECLARE @invalidLaborIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.LABOR, 0) <= 0
    );
    DECLARE @invalidLaborMsg NVARCHAR(2048) = LEFT(
      CONCAT('Las siguientes ORDs deben tener laboratorio asignado para enviar a taller: ', ISNULL(@invalidLaborIords, '')),
      2048
    );
    THROW 58103, @invalidLaborMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = CASE
        WHEN ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
          OR (
            ISNULL(t.LAB_UBILAB, '') = ''
            AND (
              ISNULL(t.LAB_SUC, '') = ''
              OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
              OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
            )
          )
        THEN 9
        ELSE 5
      END,
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

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_enviar
  @IORD NVARCHAR(255),
  @ASIGN NVARCHAR(255) = NULL,
  @LABOR INT = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  DECLARE
    @estadoActual FLOAT = NULL,
    @laborActual INT = NULL,
    @laborFinal INT = NULL,
    @labSuc NVARCHAR(10) = '',
    @labTipo NVARCHAR(100) = '',
    @labUbicacion NVARCHAR(100) = '',
    @labDesc NVARCHAR(255) = '',
    @estadoDestino FLOAT = NULL;

  SELECT TOP 1
    @estadoActual = TRY_CONVERT(FLOAT, o.ESTSEGU),
    @laborActual = TRY_CONVERT(INT, o.LABOR)
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@IORD, ''))))
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
    THROW 58110, 'No existe la ORD o no está autorizada para la sucursal', 1;

  IF ABS(@estadoActual - 3) > 0.0001
    THROW 58111, 'La ORD debe estar en estatus 3 (NUEVA AUTORIZADA) para poder enviarse', 1;

  SET @laborFinal = COALESCE(TRY_CONVERT(INT, @LABOR), @laborActual);
  IF ISNULL(@laborFinal, 0) <= 0
    THROW 58112, 'La ORD debe tener laboratorio asignado para enviar a taller', 1;

  SELECT TOP 1
    @labSuc = UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))),
    @labTipo = UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))),
    @labUbicacion = UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))),
    @labDesc = UPPER(LTRIM(RTRIM(ISNULL(lab.LAB, ''))))
  FROM dbo.DAT_LAB lab
  WHERE TRY_CONVERT(INT, lab.ID) = @laborFinal;

  SET @estadoDestino = CASE
    WHEN ISNULL(@labUbicacion, '') LIKE '%EXTER%'
      OR (
        ISNULL(@labUbicacion, '') = ''
        AND (
          ISNULL(@labSuc, '') = ''
          OR ISNULL(@labTipo, '') LIKE '%EXTER%'
          OR ISNULL(@labDesc, '') LIKE '%EXTER%'
        )
      )
    THEN 9
    ELSE 5
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = @estadoDestino,
      o.ESTATUS = 2,
      o.LABOR = @laborFinal,
      o.ASIGN = COALESCE(@ASIGN, o.ASIGN),
      o.FCNMOD = GETDATE()
    FROM dbo.PV_CTR_ORDS o
    WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@IORD, ''))));

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
    o.ASIGN,
    o.LABOR,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@IORD, ''))));
END;
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
    LAB_UBILAB NVARCHAR(100) NULL,
    LAB_DESC NVARCHAR(255) NULL
  );

  INSERT INTO @target (IORD, IDFOL, SUC, ESTSEGU, LAB_SUC, LAB_TIPOLAB, LAB_UBILAB, LAB_DESC)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
    o.IDFOL,
    o.SUC,
    TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
    UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) AS LAB_SUC,
    UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))) AS LAB_TIPOLAB,
    UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))) AS LAB_UBILAB,
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
    WHERE NOT (
      (
        (
          ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
          OR (
            ISNULL(t.LAB_UBILAB, '') = ''
            AND (
              ISNULL(t.LAB_SUC, '') = ''
              OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
              OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
            )
          )
        )
        AND ISNULL(t.ESTSEGU, -1) IN (5, 9)
      )
      OR (
        NOT (
          ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
          OR (
            ISNULL(t.LAB_UBILAB, '') = ''
            AND (
              ISNULL(t.LAB_SUC, '') = ''
              OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
              OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
            )
          )
        )
        AND ISNULL(t.ESTSEGU, -1) = 5
      )
    )
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE NOT (
        (
          (
            ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
            OR (
              ISNULL(t.LAB_UBILAB, '') = ''
              AND (
                ISNULL(t.LAB_SUC, '') = ''
                OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
                OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
              )
            )
          )
          AND ISNULL(t.ESTSEGU, -1) IN (5, 9)
        )
        OR (
          NOT (
            ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
            OR (
              ISNULL(t.LAB_UBILAB, '') = ''
              AND (
                ISNULL(t.LAB_SUC, '') = ''
                OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
                OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
              )
            )
          )
          AND ISNULL(t.ESTSEGU, -1) = 5
        )
      )
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden recibir ORDs en estatus 5 (interno) o 9 (externo): ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58212, @invalidMsg, 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE o
    SET
      o.ESTSEGU = CASE
        WHEN ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
          OR (
            ISNULL(t.LAB_UBILAB, '') = ''
            AND (
              ISNULL(t.LAB_SUC, '') = ''
              OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
              OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
            )
          )
        THEN 10
        ELSE 7
      END,
      o.ESTATUS = 2,
      o.FCNRT = CASE
        WHEN ISNULL(t.LAB_UBILAB, '') LIKE '%EXTER%'
          OR (
            ISNULL(t.LAB_UBILAB, '') = ''
            AND (
              ISNULL(t.LAB_SUC, '') = ''
              OR ISNULL(t.LAB_TIPOLAB, '') LIKE '%EXTER%'
              OR ISNULL(t.LAB_DESC, '') LIKE '%EXTER%'
            )
          )
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
  DECLARE @labUbicacion NVARCHAR(100) = '';
  DECLARE @labDesc NVARCHAR(255) = '';

  SELECT TOP 1
    @estadoActual = TRY_CONVERT(FLOAT, o.ESTSEGU),
    @labSuc = UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))),
    @labTipo = UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))),
    @labUbicacion = UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))),
    @labDesc = UPPER(LTRIM(RTRIM(ISNULL(lab.LAB, ''))))
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@IORD, ''))))
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

  DECLARE @isLabExterno BIT = CASE
    WHEN ISNULL(@labUbicacion, '') LIKE '%EXTER%'
      OR (
        ISNULL(@labUbicacion, '') = ''
        AND (
          ISNULL(@labSuc, '') = ''
          OR ISNULL(@labTipo, '') LIKE '%EXTER%'
          OR ISNULL(@labDesc, '') LIKE '%EXTER%'
        )
      )
    THEN 1
    ELSE 0
  END;

  IF @isLabExterno = 1
  BEGIN
    IF ABS(@estadoActual - 5) > 0.0001 AND ABS(@estadoActual - 9) > 0.0001
      THROW 58231, 'La ORD externa debe estar en estatus 5 o 9 para poder recibirse', 1;
  END
  ELSE IF ABS(@estadoActual - 5) > 0.0001
    THROW 58231, 'La ORD debe estar en estatus 5 (ENTREGADA A MAQ O BISEL) para poder recibirse', 1;

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
    WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@IORD, ''))));
  END;
END;
GO
