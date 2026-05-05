/*
  2026-04-29
  Garantia ORD -> nuevo flujo 9.3 + modulo Home restaurado + transicion opcional a 9.1/9.2.
*/
SET NOCOUNT ON;

/* 1) Estado 9.3 en catalogo de flujo */
IF OBJECT_ID('dbo.DAT_EST_ORD', 'U') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1
    FROM dbo.DAT_EST_ORD
    WHERE ABS(TRY_CONVERT(FLOAT, ESTA) - 9.3) <= 0.0001
  )
  BEGIN
    UPDATE dbo.DAT_EST_ORD
    SET TIPO = 'GARANTIA APLICADA'
    WHERE ABS(TRY_CONVERT(FLOAT, ESTA) - 9.3) <= 0.0001;
  END
  ELSE
  BEGIN
    INSERT INTO dbo.DAT_EST_ORD (ESTA, TIPO)
    VALUES (9.3, 'GARANTIA APLICADA');
  END
END;

/* 2) Reactivar modulo entregadas/garantia para Home */
IF OBJECT_ID('dbo.MOD_FRONT', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.GRUPMOD_FRONT', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.GRUPMOD_FRONT_MOD', 'U') IS NOT NULL
BEGIN
  DECLARE @modEntregadas INT;

  SELECT TOP 1 @modEntregadas = IDMOD_FRONT
  FROM dbo.MOD_FRONT
  WHERE UPPER(LTRIM(RTRIM(ISNULL(CODIGO, '')))) = 'DAT_JAO_ORD_ENTREGADAS';

  IF @modEntregadas IS NOT NULL
  BEGIN
    UPDATE dbo.MOD_FRONT
    SET ACTIVO = 1,
        NOMBRE = 'Gestion garantia ORD entregadas'
    WHERE IDMOD_FRONT = @modEntregadas;

    DECLARE @targetGroups TABLE (IDGRUPMOD_FRONT INT PRIMARY KEY);

    INSERT INTO @targetGroups (IDGRUPMOD_FRONT)
    SELECT DISTINCT g.IDGRUPMOD_FRONT
    FROM dbo.GRUPMOD_FRONT g
    WHERE (
        UPPER(LTRIM(RTRIM(ISNULL(g.NOMBRE, '')))) LIKE '%JEF%'
        AND UPPER(LTRIM(RTRIM(ISNULL(g.NOMBRE, '')))) LIKE '%TALLER%'
      )
      OR UPPER(LTRIM(RTRIM(ISNULL(g.NOMBRE, '')))) LIKE 'SUPER%';

    IF NOT EXISTS (SELECT 1 FROM @targetGroups)
    BEGIN
      INSERT INTO @targetGroups (IDGRUPMOD_FRONT)
      SELECT DISTINCT gm.IDGRUPMOD_FRONT
      FROM dbo.GRUPMOD_FRONT_MOD gm
      INNER JOIN dbo.MOD_FRONT m ON m.IDMOD_FRONT = gm.IDMOD_FRONT
      WHERE UPPER(LTRIM(RTRIM(ISNULL(m.CODIGO, '')))) = 'DAT_JAO_ORD';
    END

    INSERT INTO dbo.GRUPMOD_FRONT_MOD (IDGRUPMOD_FRONT, IDMOD_FRONT)
    SELECT tg.IDGRUPMOD_FRONT, @modEntregadas
    FROM @targetGroups tg
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.GRUPMOD_FRONT_MOD x
      WHERE x.IDGRUPMOD_FRONT = tg.IDGRUPMOD_FRONT
        AND x.IDMOD_FRONT = @modEntregadas
    );
  END
END;
GO

/* 3) Garantia ahora cambia de 11 -> 9.3 */
CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_garantia
  @IORD NVARCHAR(255),
  @MOTIVO NVARCHAR(255) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  DECLARE @obs NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@MOTIVO, ''))), '');

  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = 9.3,
    @ESTATUS = 2,
    @OBS = @obs,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;
END;
GO

/* 4) Aplicar merma o cambio desde 9.3 -> 9.1 / 9.2 */
CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_aplicar_merma_cambio
  @IORD NVARCHAR(255),
  @TIPOM INT,
  @MOTR INT,
  @OBS NVARCHAR(255) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @TIPOM NOT IN (1, 2)
    THROW 58031, 'TIPOM debe ser 1 (CAMBIO) o 2 (MERMA).', 1;

  IF @MOTR IS NULL OR @MOTR <= 0
    THROW 58032, 'MOTR es requerido y debe ser mayor a 0.', 1;

  DECLARE @targetFlow FLOAT = CASE WHEN @TIPOM = 1 THEN 9.1 ELSE 9.2 END;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PV_CTR_ORDS o
    WHERE o.IORD = @IORD
      AND ABS(TRY_CONVERT(FLOAT, o.ESTSEGU) - 9.3) <= 0.0001
  )
  BEGIN
    THROW 58033, 'La ORD debe estar en flujo 9.3 para aplicar merma o cambio.', 1;
  END

  EXEC dbo.sp_ordenes_trabajo_set_estado
    @IORD = @IORD,
    @ESTSEGU = @targetFlow,
    @ESTATUS = 2,
    @OBS = @OBS,
    @USER = @USER,
    @IP = @IP,
    @IS_ADMIN = @IS_ADMIN,
    @ALLOWED_SUCS = @ALLOWED_SUCS,
    @SUC = @SUC;

  DECLARE @sqlUpdate NVARCHAR(MAX) = N'UPDATE dbo.PV_CTR_ORDS SET FCNMOD = GETDATE()';
  IF COL_LENGTH('dbo.PV_CTR_ORDS', 'TIPOM') IS NOT NULL
    SET @sqlUpdate += N', TIPOM = @P_TIPOM';
  IF COL_LENGTH('dbo.PV_CTR_ORDS', 'TPOM') IS NOT NULL
    SET @sqlUpdate += N', TPOM = @P_TIPOM';
  IF COL_LENGTH('dbo.PV_CTR_ORDS', 'MOTR') IS NOT NULL
    SET @sqlUpdate += N', MOTR = @P_MOTR';
  SET @sqlUpdate += N' WHERE IORD = @P_IORD';
  EXEC sp_executesql
    @sqlUpdate,
    N'@P_TIPOM INT, @P_MOTR INT, @P_IORD NVARCHAR(255)',
    @P_TIPOM = @TIPOM,
    @P_MOTR = @MOTR,
    @P_IORD = @IORD;

  SELECT TOP 1
    o.IORD,
    o.IDFOL,
    o.ESTATUS,
    o.ESTSEGU,
    o.TIPOM,
    o.MOTR,
    o.SUC,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  WHERE o.IORD = @IORD;
END;
GO

/* 5) Parche puntual al SP de panel para 9.3 y acceso entregadas solo admin/jef */
DECLARE @panelDef NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_panel'));
IF @panelDef IS NOT NULL
BEGIN
  DECLARE @patched NVARCHAR(MAX) = @panelDef;

  SET @patched = REPLACE(@patched, 'CREATE   PROCEDURE', 'ALTER PROCEDURE');
  SET @patched = REPLACE(@patched, 'CREATE PROCEDURE', 'ALTER PROCEDURE');

  DECLARE @oldEntregadasBlock NVARCHAR(MAX) =
    'ELSE IF @PANEL_MODE = ''entregadas''' + CHAR(13) + CHAR(10) +
    '  BEGIN' + CHAR(13) + CHAR(10) +
    '    IF @IS_ADMIN = 1 OR @ROLE_CODE IN (''JEF_TALLER'', ''TALLER'')' + CHAR(13) + CHAR(10) +
    '      INSERT INTO @allowedStatus (ESTSEGU) VALUES (11);' + CHAR(13) + CHAR(10) +
    '  END';
  DECLARE @newEntregadasBlock NVARCHAR(MAX) =
    'ELSE IF @PANEL_MODE = ''entregadas''' + CHAR(13) + CHAR(10) +
    '  BEGIN' + CHAR(13) + CHAR(10) +
    '    IF @IS_ADMIN = 1 OR @ROLE_CODE IN (''JEF_TALLER'')' + CHAR(13) + CHAR(10) +
    '      INSERT INTO @allowedStatus (ESTSEGU) VALUES (11);' + CHAR(13) + CHAR(10) +
    '  END';
  SET @patched = REPLACE(@patched, @oldEntregadasBlock, @newEntregadasBlock);

  SET @patched = REPLACE(
    @patched,
    'IF @IS_ADMIN = 1 OR @ROLE_CODE IN (''JEF_TALLER'', ''TALLER'')'+CHAR(13)+CHAR(10)+'      INSERT INTO @allowedStatus (ESTSEGU) VALUES (11);',
    'IF @IS_ADMIN = 1 OR @ROLE_CODE IN (''JEF_TALLER'')'+CHAR(13)+CHAR(10)+'      INSERT INTO @allowedStatus (ESTSEGU) VALUES (11);'
  );

  DECLARE @entregadasStart INT = CHARINDEX('ELSE IF @PANEL_MODE = ''entregadas''', @patched);
  IF @entregadasStart > 0
  BEGIN
    DECLARE @entregadasSegment NVARCHAR(500) = SUBSTRING(@patched, @entregadasStart, 500);
    DECLARE @legacyNeedle NVARCHAR(100) = '''JEF_TALLER'', ''TALLER''';
    DECLARE @needlePos INT = CHARINDEX(@legacyNeedle, @entregadasSegment);
    IF @needlePos > 0
    BEGIN
      DECLARE @globalPos INT = @entregadasStart + @needlePos - 1;
      SET @patched = STUFF(@patched, @globalPos, LEN(@legacyNeedle), '''JEF_TALLER''');
    END
  END

  SET @patched = REPLACE(
    @patched,
    'VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (10), (12);',
    'VALUES (2), (3), (3.1), (5), (6), (7), (8), (9), (9.1), (9.2), (9.3), (10), (12);'
  );

  SET @patched = REPLACE(
    @patched,
    'VALUES (5), (7), (8), (9), (9.1), (9.2);',
    'VALUES (5), (7), (8), (9), (9.1), (9.2), (9.3);'
  );

  IF @patched <> @panelDef
    EXEC sp_executesql @patched;
END;
GO
