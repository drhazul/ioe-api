/*
  2026-04-06
  ORDs - Autorizar requiere laboratorio asignado.
  Regla: para transicionar a ESTSEGU=3, la ORD debe tener LABOR > 0.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_autorizar
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

  DECLARE @target TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY,
    LABOR INT NULL
  );

  INSERT INTO @target (IORD, LABOR)
  SELECT TOP 1
    UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))),
    TRY_CONVERT(INT, o.LABOR)
  FROM dbo.PV_CTR_ORDS o
  LEFT JOIN dbo.DAT_LAB lab
    ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@IORD)
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

  IF NOT EXISTS (SELECT 1 FROM @target)
    THROW 58010, 'No existe la ORD o no esta autorizada para la sucursal', 1;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.LABOR, 0) <= 0
  )
    THROW 58011, 'La ORD debe tener laboratorio asignado para autorizar (ESTSEGU 3).', 1;

  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = 3,
    @ESTATUS = 2,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO
