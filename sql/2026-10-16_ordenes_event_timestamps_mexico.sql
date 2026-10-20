/*
  2026-10-16
  Keep generated ORD workflow and delivery timestamps in Mexico local time.
  SQL host runs UTC; business dates and existing IDs remain unchanged.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.tr_PV_CTR_ORDS_flujo_hist', 'TR') IS NULL
  THROW 58300, 'No existe dbo.tr_PV_CTR_ORDS_flujo_hist.', 1;
GO

CREATE OR ALTER TRIGGER dbo.tr_PV_CTR_ORDS_flujo_hist
ON dbo.PV_CTR_ORDS
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  INSERT dbo.PV_CTR_ORDS_FLUJO_HIST (IORD, ESTSEGU, FCNR, ORIGEN)
  SELECT
    LTRIM(RTRIM(i.IORD)),
    TRY_CONVERT(float, i.ESTSEGU),
    CONVERT(
      DATETIME2(3),
      ((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central Standard Time (Mexico)')
    ),
    N'TRIGGER'
  FROM inserted i
  LEFT JOIN deleted d
    ON d.IORD = i.IORD
  WHERE NULLIF(LTRIM(RTRIM(ISNULL(i.IORD, N''))), N'') IS NOT NULL
    AND (
      d.IORD IS NULL
      OR TRY_CONVERT(float, d.ESTSEGU) <> TRY_CONVERT(float, i.ESTSEGU)
      OR (d.ESTSEGU IS NULL AND i.ESTSEGU IS NOT NULL)
      OR (d.ESTSEGU IS NOT NULL AND i.ESTSEGU IS NULL)
    );
END;
GO

ALTER TABLE dbo.PV_CTR_ORDS_FLUJO_HIST
  DROP CONSTRAINT DF_PV_CTR_ORDS_FLUJO_HIST_FCNR;
GO
ALTER TABLE dbo.PV_CTR_ORDS_FLUJO_HIST
  ADD CONSTRAINT DF_PV_CTR_ORDS_FLUJO_HIST_FCNR
  DEFAULT (CONVERT(
    DATETIME2(3),
    ((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central Standard Time (Mexico)')
  )) FOR FCNR;
GO

ALTER TABLE dbo.PV_CTR_ORDS_ENTREGA
  DROP CONSTRAINT DF_PV_CTR_ORDS_ENTREGA_FCN_ALTA;
GO
ALTER TABLE dbo.PV_CTR_ORDS_ENTREGA
  ADD CONSTRAINT DF_PV_CTR_ORDS_ENTREGA_FCN_ALTA
  DEFAULT (CONVERT(
    DATETIME,
    ((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central Standard Time (Mexico)')
  )) FOR FCN_ALTA;
GO

ALTER TABLE dbo.PV_CTR_ORDS_ENTREGA_DET
  DROP CONSTRAINT DF_PV_CTR_ORDS_ENTREGA_DET_FCN_ALTA;
GO
ALTER TABLE dbo.PV_CTR_ORDS_ENTREGA_DET
  ADD CONSTRAINT DF_PV_CTR_ORDS_ENTREGA_DET_FCN_ALTA
  DEFAULT (CONVERT(
    DATETIME,
    ((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central Standard Time (Mexico)')
  )) FOR FCN_ALTA;
GO

/* Process timestamp writers: keep UTC-derived Mexico-local time. */

CREATE OR ALTER PROCEDURE dbo.sp_pv_ctr_ords_create_from_quote_line
  @IDFOL NVARCHAR(255),
  @ART NVARCHAR(255),
  @DESCART NVARCHAR(255) = NULL,
  @CTD FLOAT,
  @CLIEN FLOAT,
  @ESTADO NVARCHAR(50),
  @TIPO NVARCHAR(255),
  @FCNM DATETIME = NULL,
  @COMAD NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10),
  @OPV NVARCHAR(255),
  @IORD_OUT NVARCHAR(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@ART, '')));
  DECLARE @descArtNorm NVARCHAR(255) = LEFT(LTRIM(RTRIM(ISNULL(@DESCART, ''))), 255);
  DECLARE @ctdNorm FLOAT = @CTD;
  DECLARE @clienNorm FLOAT = @CLIEN;
  DECLARE @estadoNorm NVARCHAR(50) = UPPER(LTRIM(RTRIM(ISNULL(@ESTADO, ''))));
  DECLARE @tipoNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@TIPO, '')));
  DECLARE @fcnmNorm DATETIME = @FCNM;
  DECLARE @comadNorm NVARCHAR(MAX) = NULLIF(LTRIM(RTRIM(ISNULL(@COMAD, ''))), '');
  DECLARE @sucNorm NVARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@OPV, '')));
  DECLARE @qtyEpsilon FLOAT = 0.0001;

  DECLARE @now DATETIME = CAST(
    SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)'
    AS DATETIME
  );
  DECLARE @iord NVARCHAR(255);
  DECLARE @clsArt FLOAT = NULL;
  DECLARE @valOrd FLOAT = NULL;
  DECLARE @ctord FLOAT = 100;
  DECLARE @ncliente NVARCHAR(255) = '';
  DECLARE @datArtObject NVARCHAR(517) = NULL;
  DECLARE @conTpoOrdObject NVARCHAR(517) = NULL;
  DECLARE @lookupSql NVARCHAR(MAX) = N'';

  SET @IORD_OUT = NULL;

  IF @idfolNorm = '' OR @artNorm = '' OR @tipoNorm = '' OR @sucNorm = '' OR @opvNorm = ''
    THROW 50063, 'Datos obligatorios incompletos para crear ORD.', 1;

  IF @fcnmNorm IS NULL
    THROW 50070, 'La fecha de entrega es obligatoria.', 1;

  IF @comadNorm IS NULL
    THROW 50071, 'El campo COMAD es obligatorio.', 1;

  IF @clienNorm IS NULL OR @clienNorm = 1
    THROW 50060, 'No se permite crear ORD para el cliente seleccionado.', 1;

  IF @estadoNorm IN ('EDITANDO', 'PAGADO2', 'DEV PEND')
    SET @estadoNorm = 'PENDIENTE';

  IF @estadoNorm <> 'PENDIENTE'
    THROW 50061, 'El documento no esta en estado PENDIENTE.', 1;

  IF @ctdNorm IS NULL
    THROW 50062, 'La cantidad registrada para el articulo no permite crear ORD.', 1;

  IF ABS(@ctdNorm - 1.0) > @qtyEpsilon AND ABS(@ctdNorm - 0.5) > @qtyEpsilon
    THROW 50062, 'La cantidad registrada para el articulo no permite crear ORD.', 1;

  SELECT TOP 1
    @datArtObject = QUOTENAME(s.name) + N'.' + QUOTENAME(o.name)
  FROM sys.objects o
  INNER JOIN sys.schemas s
    ON s.schema_id = o.schema_id
  WHERE o.name = N'DAT_ART'
    AND o.type IN (N'U', N'V')
  ORDER BY
    CASE WHEN s.name = N'dbo' THEN 0 ELSE 1 END,
    s.name ASC;

  IF @datArtObject IS NOT NULL
  BEGIN
    SET @lookupSql = N'
      SELECT TOP 1
        @clsArtOut = TRY_CONVERT(FLOAT, SCLA2)
      FROM ' + @datArtObject + N'
      WHERE ART = @artIn
      ORDER BY SUC ASC;';

    EXEC sys.sp_executesql
      @lookupSql,
      N'@artIn NVARCHAR(255), @clsArtOut FLOAT OUTPUT',
      @artIn = @artNorm,
      @clsArtOut = @clsArt OUTPUT;
  END;

  SELECT TOP 1
    @conTpoOrdObject = QUOTENAME(s.name) + N'.' + QUOTENAME(o.name)
  FROM sys.objects o
  INNER JOIN sys.schemas s
    ON s.schema_id = o.schema_id
  WHERE o.name = N'CON_TPO_ORD'
    AND o.type IN (N'U', N'V')
  ORDER BY
    CASE WHEN s.name = N'dbo' THEN 0 ELSE 1 END,
    s.name ASC;

  IF @conTpoOrdObject IS NOT NULL AND @clsArt IS NOT NULL
  BEGIN
    SET @lookupSql = N'
      SELECT TOP 1
        @valOrdOut = TRY_CONVERT(FLOAT, SCLA2)
      FROM ' + @conTpoOrdObject + N'
      WHERE TRY_CONVERT(FLOAT, SCLA2) = @clsArtIn;';

    EXEC sys.sp_executesql
      @lookupSql,
      N'@clsArtIn FLOAT, @valOrdOut FLOAT OUTPUT',
      @clsArtIn = @clsArt,
      @valOrdOut = @valOrd OUTPUT;
  END;

  IF @valOrd IS NOT NULL
    SET @ctord = 120;

  SELECT TOP 1
    @ncliente = LEFT(LTRIM(RTRIM(ISNULL(RazonSocialReceptor, ''))), 255)
  FROM dbo.FACT_CLIENT_SHP
  WHERE IDC = @clienNorm;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    EXEC dbo.sp_pv_ctr_ords_generate_iord
      @SUC = @sucNorm,
      @FCN = @now,
      @IORD_OUT = @iord OUTPUT;

    IF @iord IS NULL OR LTRIM(RTRIM(@iord)) = ''
      THROW 50068, 'No se pudo generar IORD para la orden.', 1;

    IF (
      UPPER(LTRIM(RTRIM(@iord))) LIKE '%AUX%'
      OR LEFT(UPPER(LTRIM(RTRIM(@iord))), LEN(@sucNorm)) <> @sucNorm
      OR LEN(LTRIM(RTRIM(@iord))) <> LEN(@sucNorm) + 9
      OR TRY_CONVERT(BIGINT, SUBSTRING(LTRIM(RTRIM(@iord)), LEN(@sucNorm) + 1, 9)) IS NULL
    )
      THROW 50069, 'Formato de IORD invalido para nomenclatura estandar.', 1;

    INSERT INTO dbo.PV_CTR_ORDS
    (
      IORD,
      IDFOL,
      TIPO,
      OPV,
      FCNS,
      FCNM,
      CLIEN,
      CTD,
      ART,
      COMAD,
      ESTATUS,
      SUC,
      NCLIENTE,
      DESCART,
      CTORD
    )
    VALUES
    (
      @iord,
      @idfolNorm,
      @tipoNorm,
      @opvNorm,
      @now,
      @fcnmNorm,
      @clienNorm,
      @ctdNorm,
      @artNorm,
      @comadNorm,
      1,
      @sucNorm,
      NULLIF(@ncliente, ''),
      NULLIF(@descArtNorm, ''),
      @ctord
    );

    INSERT INTO dbo.PV_CTR_ORDS_DET (IORDP, IORD, ART, JOB)
    VALUES
      (CONCAT('1', @iord), @iord, @artNorm, 'OD'),
      (CONCAT('2', @iord), @iord, @artNorm, 'OI'),
      (CONCAT('3', @iord), @iord, @artNorm, 'ADD');

    SET @IORD_OUT = @iord;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_set_estado
  @IORD NVARCHAR(255),
  @ESTSEGU FLOAT,
  @ESTATUS INT = NULL,
  @ASIGN NVARCHAR(255) = NULL,
  @LABOR INT = NULL,
  @OBS NVARCHAR(255) = NULL,
  @FIRMA_CLIENTE NVARCHAR(MAX) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @processNow DATETIME = CONVERT(
    DATETIME,
    ((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central Standard Time (Mexico)')
  );

  DECLARE @allowed TABLE (SUC NVARCHAR(10) PRIMARY KEY);
  INSERT INTO @allowed (SUC)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(value)))
  FROM STRING_SPLIT(ISNULL(@ALLOWED_SUCS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (
    SELECT 1
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
      )
  )
  BEGIN
    THROW 58010, 'No existe la ORD o no esta autorizada para la sucursal', 1;
  END;

  UPDATE dbo.PV_CTR_ORDS
  SET
    ESTSEGU = @ESTSEGU,
    ESTATUS = COALESCE(@ESTATUS, ESTATUS),
    ASIGN = COALESCE(NULLIF(@ASIGN, ''), ASIGN),
    LABOR = COALESCE(@LABOR, LABOR),
    FCNMOD = @processNow,
    FCNEN = CASE WHEN @ESTSEGU = 11 THEN @processNow ELSE FCNEN END,
    HR_ENT = CASE WHEN @ESTSEGU = 11 THEN @processNow ELSE HR_ENT END,
    COMAD = CASE
      WHEN NULLIF(@OBS, '') IS NULL THEN COMAD
      ELSE LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          @OBS
        ),
        2000
      )
    END
  WHERE IORD = @IORD;

  SELECT TOP 1
    o.IORD,
    o.IDFOL,
    o.ESTATUS,
    o.ESTSEGU,
    o.SUC,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  WHERE o.IORD = @IORD;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_entregar_lote
  @IORDS NVARCHAR(MAX),
  @OBS NVARCHAR(255) = NULL,
  @FIRMA_CLIENTE NVARCHAR(MAX) = NULL,
  @USER NVARCHAR(255) = NULL,
  @IP NVARCHAR(100) = NULL,
  @IS_ADMIN BIT = 0,
  @ALLOWED_SUCS NVARCHAR(MAX) = NULL,
  @SUC NVARCHAR(10) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @processNow DATETIME = CONVERT(
    DATETIME,
    ((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central Standard Time (Mexico)')
  );

  DECLARE @firmaNorm NVARCHAR(MAX) = LTRIM(RTRIM(ISNULL(@FIRMA_CLIENTE, '')));
  IF ISNULL(@firmaNorm, '') = ''
    THROW 58218, 'Debe capturar firma digital para registrar la entrega', 1;

  DECLARE @ords TABLE (
    IORD NVARCHAR(255) NOT NULL PRIMARY KEY
  );

  INSERT INTO @ords (IORD)
  SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(value, ''))))
  FROM STRING_SPLIT(ISNULL(@IORDS, ''), ',')
  WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> '';

  IF NOT EXISTS (SELECT 1 FROM @ords)
    THROW 58220, 'Debe enviar al menos una ORD en @IORDS', 1;

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
    THROW 58221, @missingMsg, 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @target t
    WHERE ISNULL(t.ESTSEGU, -1) <> 10
  )
  BEGIN
    DECLARE @invalidIords NVARCHAR(2000) = (
      SELECT STRING_AGG(t.IORD, ', ')
      FROM @target t
      WHERE ISNULL(t.ESTSEGU, -1) <> 10
    );
    DECLARE @invalidMsg NVARCHAR(2048) = LEFT(
      CONCAT('Solo se pueden entregar ORDs en estatus 10 (REGRESADO A TIENDA): ', ISNULL(@invalidIords, '')),
      2048
    );
    THROW 58222, @invalidMsg, 1;
  END;

  DECLARE @batchSuc NVARCHAR(10) = NULL;
  DECLARE @batchCount INT = 0;
  DECLARE @idEntrega BIGINT = NULL;
  DECLARE @folioEntrega NVARCHAR(255) = NULL;

  SELECT TOP 1
    @batchSuc = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))), '')
  FROM @target
  ORDER BY IORD;

  SELECT @batchCount = COUNT(1)
  FROM @target;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @created TABLE (ID_ENTREGA BIGINT);
    INSERT INTO dbo.PV_CTR_ORDS_ENTREGA (
      FOLIO_ENTREGA,
      SUC,
      OBS,
      FIRMA_CLIENTE,
      TOTAL_ORDS,
      USER_ALTA,
      FCN_ALTA,
      IP_ALTA
    )
    OUTPUT inserted.ID_ENTREGA INTO @created (ID_ENTREGA)
    VALUES (
      NULL,
      @batchSuc,
      NULLIF(LEFT(LTRIM(RTRIM(ISNULL(@OBS, ''))), 255), ''),
      @firmaNorm,
      @batchCount,
      @USER,
      @processNow,
      @IP
    );

    SELECT TOP 1 @idEntrega = ID_ENTREGA FROM @created;
    IF @idEntrega IS NULL
      THROW 58223, 'No se pudo crear folio de entrega', 1;

    SET @folioEntrega = CONCAT(
      'ENT-',
      COALESCE(NULLIF(@batchSuc, ''), 'GEN'),
      '-',
      CONVERT(VARCHAR(8), @processNow, 112),
      '-',
      RIGHT(REPLICATE('0', 6) + CAST(@idEntrega AS VARCHAR(20)), 6)
    );

    UPDATE dbo.PV_CTR_ORDS_ENTREGA
    SET FOLIO_ENTREGA = @folioEntrega
    WHERE ID_ENTREGA = @idEntrega;

    INSERT INTO dbo.PV_CTR_ORDS_ENTREGA_DET (
      IORD,
      ID_ENTREGA,
      USER_ALTA,
      IP_ALTA
    )
    SELECT
      t.IORD,
      @idEntrega,
      @USER,
      @IP
    FROM @target t;

    UPDATE o
    SET
      o.ESTSEGU = 11,
      o.ESTATUS = 2,
      o.FCNMOD = @processNow,
      o.FCNEN = @processNow,
      o.HR_ENT = @processNow,
      o.ID_ENTREGA = @idEntrega,
      o.FIRMA_CLIENTE = NULL,
      o.COMAD = CASE
        WHEN NULLIF(LEFT(LTRIM(RTRIM(ISNULL(@OBS, ''))), 255), '') IS NULL THEN o.COMAD
        ELSE LEFT(
          CONCAT(
            ISNULL(CAST(o.COMAD AS NVARCHAR(MAX)), ''),
            CASE
              WHEN LTRIM(RTRIM(ISNULL(CAST(o.COMAD AS NVARCHAR(MAX)), ''))) = ''
                THEN ''
              ELSE ' | '
            END,
            LEFT(LTRIM(RTRIM(ISNULL(@OBS, ''))), 255)
          ),
          2000
        )
      END
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
    o.ID_ENTREGA,
    ent.FOLIO_ENTREGA,
    ent.TOTAL_ORDS,
    o.SUC,
    o.ESTATUS,
    o.ESTSEGU,
    o.FCNMOD,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR
  FROM dbo.PV_CTR_ORDS o
  INNER JOIN @target t
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = t.IORD
  LEFT JOIN dbo.PV_CTR_ORDS_ENTREGA ent
    ON ent.ID_ENTREGA = o.ID_ENTREGA
  ORDER BY o.IORD;
END;
GO
