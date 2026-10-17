/*
  Consulta / Recepción en tienda:
  - Permite rechazar la recepción de ORDs en flujo 9 con motivo obligatorio.
  - Devuelve cada ORD al flujo 5 (entregada a taller), manteniendo su TIPO
    registrado (TALLADO o BISELADO) para que el taller la reciba nuevamente.
*/

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_regresar_tienda_rechazar_lote
  @IORDS NVARCHAR(MAX),
  @MOTIVO NVARCHAR(500),
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @motivoNorm NVARCHAR(500) = LTRIM(RTRIM(ISNULL(@MOTIVO, N'')));
  IF LEN(@motivoNorm) < 3
    THROW 58340, 'El motivo del rechazo es obligatorio y debe tener al menos 3 caracteres.', 1;

  DECLARE @ords TABLE (IORD NVARCHAR(255) NOT NULL PRIMARY KEY);
  INSERT INTO @ords (IORD)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(value, N''))))
  FROM STRING_SPLIT(ISNULL(@IORDS, N''), N',')
  WHERE LTRIM(RTRIM(ISNULL(value, N''))) <> N'';

  IF NOT EXISTS (SELECT 1 FROM @ords)
    THROW 58341, 'Debe enviar al menos una ORD en @IORDS.', 1;

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, N''), N',')
  WHERE LTRIM(RTRIM(ISNULL(value, N''))) <> N'';

  DECLARE @target TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY,
    IDFOL NVARCHAR(255) NULL,
    SUC NVARCHAR(10) NULL,
    TIPO NVARCHAR(50) NULL,
    ESTSEGU FLOAT NULL
  );

  BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO @target (IORD, IDFOL, SUC, TIPO, ESTSEGU)
    SELECT
      UPPER(LTRIM(RTRIM(ISNULL(o.IORD, N'')))),
      o.IDFOL,
      o.SUC,
      UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, N'')))),
      TRY_CONVERT(FLOAT, o.ESTSEGU)
    FROM dbo.PV_CTR_ORDS o WITH (UPDLOCK, HOLDLOCK)
    LEFT JOIN dbo.DAT_LAB lab
      ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
    INNER JOIN @ords i
      ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, N'')))) = i.IORD
    WHERE
      (
        @SUC IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, N'')))) = UPPER(@SUC)
        OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, N'')))) = UPPER(@SUC)
      )
      AND (
        @IS_ADMIN = 1
        OR NOT EXISTS (SELECT 1 FROM @allowed)
        OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, N'')))) IN (SELECT SUC FROM @allowed)
        OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, N'')))) IN (SELECT SUC FROM @allowed)
      );

    IF EXISTS (
      SELECT 1
      FROM @ords i
      LEFT JOIN @target t ON t.IORD = i.IORD
      WHERE t.IORD IS NULL
    )
    BEGIN
      DECLARE @missingIords NVARCHAR(2000) = (
        SELECT STRING_AGG(i.IORD, N', ')
        FROM @ords i
        LEFT JOIN @target t ON t.IORD = i.IORD
        WHERE t.IORD IS NULL
      );
      DECLARE @missingMsg NVARCHAR(2048) = LEFT(
        CONCAT(N'ORD no encontrada o sin acceso por sucursal: ', ISNULL(@missingIords, N'')),
        2048
      );
      THROW 58342, @missingMsg, 1;
    END;

    IF EXISTS (SELECT 1 FROM @target WHERE ISNULL(ESTSEGU, -1) <> 9)
    BEGIN
      DECLARE @invalidFlowIords NVARCHAR(2000) = (
        SELECT STRING_AGG(IORD, N', ')
        FROM @target
        WHERE ISNULL(ESTSEGU, -1) <> 9
      );
      DECLARE @invalidFlowMsg NVARCHAR(2048) = LEFT(
        CONCAT(N'Solo se pueden rechazar ORDs en estatus 9: ', ISNULL(@invalidFlowIords, N'')),
        2048
      );
      THROW 58343, @invalidFlowMsg, 1;
    END;

    IF EXISTS (
      SELECT 1
      FROM @target
      WHERE TIPO NOT IN (N'TALLADO', N'TALLER', N'BISELADO', N'BISEL')
    )
    BEGIN
      DECLARE @invalidTypeIords NVARCHAR(2000) = (
        SELECT STRING_AGG(IORD, N', ')
        FROM @target
        WHERE TIPO NOT IN (N'TALLADO', N'TALLER', N'BISELADO', N'BISEL')
      );
      DECLARE @invalidTypeMsg NVARCHAR(2048) = LEFT(
        CONCAT(N'La ORD no tiene tipo TALLADO o BISELADO: ', ISNULL(@invalidTypeIords, N'')),
        2048
      );
      THROW 58344, @invalidTypeMsg, 1;
    END;

    UPDATE o
    SET
      o.ESTSEGU = 5,
      o.ESTATUS = 2,
      o.FCNMOD = GETDATE()
    FROM dbo.PV_CTR_ORDS o
    INNER JOIN @target t
      ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, N'')))) = t.IORD;

    COMMIT TRANSACTION;

    SELECT
      o.IORD,
      o.IDFOL,
      o.SUC,
      o.TIPO,
      o.ESTATUS,
      o.ESTSEGU,
      @motivoNorm AS MOTIVO_RECHAZO,
      o.FCNMOD,
      @USER AS USER_ACTOR,
      @IP AS IP_ACTOR
    FROM dbo.PV_CTR_ORDS o
    INNER JOIN @target t
      ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, N'')))) = t.IORD
    ORDER BY o.IORD;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
