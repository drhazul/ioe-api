/*
  Ajuste 2026-04-21: cambio/merma con autorizacion final.
  - Agrega auditoria USR_AUT_CYM / FCN_AUT_CYM en PV_CTR_ORDS.
  - La ORD original queda anulada al cierre final y REEORD apunta a la nueva ORD.
  - Se conserva NVA_IORD reservada y la nueva ORD sigue clonandose con CTD original.
*/
SET NOCOUNT ON;

IF COL_LENGTH('dbo.PV_CTR_ORDS', 'USR_AUT_CYM') IS NULL
BEGIN
  ALTER TABLE dbo.PV_CTR_ORDS ADD USR_AUT_CYM NVARCHAR(255) NULL;
END;

IF COL_LENGTH('dbo.PV_CTR_ORDS', 'FCN_AUT_CYM') IS NULL
BEGIN
  ALTER TABLE dbo.PV_CTR_ORDS ADD FCN_AUT_CYM DATETIME NULL;
END;
GO
/*
  Ajuste 2026-04-09: HomologaciÃƒÂ³n de diferencia econÃƒÂ³mica ORDs con regla de cotizaciones abiertas.
  Regla aplicada: tipo de cotizaciÃƒÂ³n (CA/VF), IVA_INTEGRADO (DAT_SUC) y REQF/RQFAC del folio.
*/

GO
/*
  Ajuste 2026-04-22: movimientos MB51 y control de cuentas alineados a DAT_CMOV/DAT_CAT_CTAS.
  - MB51 usa CLSM por clase de movimiento (204/205/455/456/457) y CTOT = CTDA * DAT_ART.CTOP.
  - Diferencia contable usa CTA AD de DAT_CAT_CTAS (101001001) y clases 801/802 de DAT_CMOV.
  - NDOC de DAT_CTRL_CTAS se genera con consecutivo basado en DAT_CMOV.NDOC y se registra en DAT_CTR_DOC.
*/
CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_mb51
  @SUC NVARCHAR(10),
  @ART NVARCHAR(255),
  @CTDA FLOAT,
  @TXT NVARCHAR(255),
  @DOCP NVARCHAR(255),
  @USR NVARCHAR(255) = NULL,
  @CLSM NVARCHAR(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID('dbo.DAT_MB51', 'U') IS NULL
    RETURN;

  DECLARE @ctop FLOAT = 0;
  IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
  BEGIN
    SELECT TOP 1
      @ctop = ISNULL(TRY_CONVERT(FLOAT, a.CTOP), 0)
    FROM dbo.DAT_ART a
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))))
      AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART, ''))))
    ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC;
  END;

  DECLARE @cols NVARCHAR(MAX);
  DECLARE @vals NVARCHAR(MAX);
  DECLARE @sql NVARCHAR(MAX);

  ;WITH cols AS (
    SELECT
      c.name,
      c.column_id,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsIdentity')) AS is_identity,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsComputed')) AS is_computed
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.DAT_MB51')
  )
  SELECT
    @cols = STRING_AGG(QUOTENAME(name), ','),
    @vals = STRING_AGG(
      CASE
        WHEN name = 'IDPD' THEN 'CONVERT(NVARCHAR(36), NEWID())'
        WHEN name = 'ART' THEN '@P_ART'
        WHEN name = 'CTDA' THEN '@P_CTDA'
        WHEN name = 'CTOT' THEN 'ROUND(ISNULL(@P_CTDA, 0) * ISNULL(@P_CTOP, 0), 2)'
        WHEN name = 'TXT' THEN 'LEFT(ISNULL(@P_TXT, ''''), 255)'
        WHEN name = 'SUC' THEN '@P_SUC'
        WHEN name = 'DOCP' THEN 'LEFT(ISNULL(@P_DOCP, ''''), 255)'
        WHEN name = 'USER' THEN 'LEFT(ISNULL(@P_USR, SYSTEM_USER), 255)'
        WHEN name = 'CLSM' THEN 'TRY_CONVERT(FLOAT, @P_CLSM)'
        WHEN name = 'FCND' THEN 'CONVERT(date, GETDATE())'
        WHEN name = 'FCNC' THEN 'GETDATE()'
        WHEN name = 'ALMACEN' THEN '''001'''
        ELSE 'NULL'
      END,
      ','
    )
  FROM cols
  WHERE ISNULL(is_identity, 0) = 0
    AND ISNULL(is_computed, 0) = 0;

  IF ISNULL(@cols, '') = '' OR ISNULL(@vals, '') = ''
    RETURN;

  SET @sql = N'INSERT INTO dbo.DAT_MB51 (' + @cols + N') VALUES (' + @vals + N');';

  EXEC sp_executesql
    @sql,
    N'@P_SUC NVARCHAR(10), @P_ART NVARCHAR(255), @P_CTDA FLOAT, @P_CTOP FLOAT, @P_TXT NVARCHAR(255), @P_DOCP NVARCHAR(255), @P_USR NVARCHAR(255), @P_CLSM NVARCHAR(50)',
    @P_SUC = @SUC,
    @P_ART = @ART,
    @P_CTDA = @CTDA,
    @P_CTOP = @ctop,
    @P_TXT = @TXT,
    @P_DOCP = @DOCP,
    @P_USR = @USR,
    @P_CLSM = @CLSM;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff
  @SUC NVARCHAR(10),
  @CLIENT FLOAT,
  @IDFOL NVARCHAR(255),
  @DIFF FLOAT,
  @DOCDIF NVARCHAR(255),
  @DESC_MOV NVARCHAR(255),
  @USR NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    RETURN;

  IF ABS(ISNULL(@DIFF, 0)) < 0.0001
    RETURN;

  DECLARE @mov INT = CASE WHEN @DIFF > 0 THEN 802 ELSE 801 END;
  DECLARE @impt FLOAT = CASE WHEN @DIFF > 0 THEN -ABS(@DIFF) ELSE ABS(@DIFF) END;
  DECLARE @cta NVARCHAR(20) = NULL;
  DECLARE @docSeed BIGINT = 80000000;
  DECLARE @docWidth INT = 8;
  DECLARE @maxCtrl BIGINT = 0;
  DECLARE @maxDoc BIGINT = 0;
  DECLARE @nextDoc BIGINT = 0;
  DECLARE @ndoc NVARCHAR(255) = NULL;
  DECLARE @lockResult INT;
  DECLARE @classCol NVARCHAR(10) = NULL;
  DECLARE @sucNorm NVARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @lockResource NVARCHAR(255) = CONCAT('OT_CYM_CTRLCTA_', @mov);
  DECLARE @sql NVARCHAR(MAX);

  IF OBJECT_ID('dbo.DAT_CAT_CTAS', 'U') IS NOT NULL
  BEGIN
    SELECT TOP 1
      @cta = LTRIM(RTRIM(ISNULL(CTA, '')))
    FROM dbo.DAT_CAT_CTAS
    WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = 'AD'
    ORDER BY CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(DCTA, '')))) = 'DIFERENCIAS EN ORD DE TRABAJO' THEN 0
      ELSE 1
    END, CTA;
  END;

  IF ISNULL(LTRIM(RTRIM(ISNULL(@cta, ''))), '') = ''
    SET @cta = '101001001';

  IF OBJECT_ID('dbo.DAT_CMOV', 'U') IS NOT NULL
  BEGIN
    SELECT TOP 1
      @docSeed = COALESCE(TRY_CONVERT(BIGINT, NDOC), @docSeed)
    FROM dbo.DAT_CMOV
    WHERE TRY_CONVERT(INT, CMOV) = @mov;
  END;

  SET @docWidth = CASE WHEN LEN(CONVERT(VARCHAR(50), ISNULL(@docSeed, 80000000))) > 8
                       THEN LEN(CONVERT(VARCHAR(50), ISNULL(@docSeed, 80000000)))
                       ELSE 8 END;

  EXEC @lockResult = sp_getapplock
    @Resource = @lockResource,
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 10000;

  IF @lockResult < 0
    THROW 58060, 'No se pudo obtener lock para generar NDOC de diferencia ORD trabajo', 1;

  SELECT @classCol = CASE
    WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CMOV') IS NOT NULL THEN 'CMOV'
    WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CLSD') IS NOT NULL THEN 'CLSD'
    ELSE NULL
  END;

  IF @classCol IS NOT NULL AND COL_LENGTH('dbo.DAT_CTRL_CTAS', 'NDOC') IS NOT NULL
  BEGIN
    SET @sql = N'
      SELECT @pMAX = ISNULL(MAX(
        TRY_CONVERT(BIGINT, LEFT(LTRIM(RTRIM(ISNULL(NDOC, ''''))), PATINDEX(''%[^0-9]%'', LTRIM(RTRIM(ISNULL(NDOC, ''''))) + ''X'') - 1))
      ), 0)
      FROM dbo.DAT_CTRL_CTAS WITH (UPDLOCK, HOLDLOCK)
      WHERE TRY_CONVERT(INT, ' + QUOTENAME(@classCol) + N') = @pMOV
        AND LTRIM(RTRIM(ISNULL(NDOC, ''''))) <> '''';';

    EXEC sp_executesql
      @sql,
      N'@pMOV INT, @pMAX BIGINT OUTPUT',
      @pMOV = @mov,
      @pMAX = @maxCtrl OUTPUT;
  END;

  IF OBJECT_ID('dbo.DAT_CTR_DOC', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'DOC') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'CLSMOV') IS NOT NULL
  BEGIN
    SELECT @maxDoc = ISNULL(MAX(
      TRY_CONVERT(BIGINT, LEFT(LTRIM(RTRIM(ISNULL(DOC, ''))), PATINDEX('%[^0-9]%', LTRIM(RTRIM(ISNULL(DOC, ''))) + 'X') - 1))
    ), 0)
    FROM dbo.DAT_CTR_DOC WITH (UPDLOCK, HOLDLOCK)
    WHERE TRY_CONVERT(INT, CLSMOV) = @mov
      AND LTRIM(RTRIM(ISNULL(DOC, ''))) <> '';
  END;

  SET @nextDoc = (SELECT MAX(V) FROM (VALUES (ISNULL(@docSeed, 80000000)), (ISNULL(@maxCtrl, 0)), (ISNULL(@maxDoc, 0))) AS T(V)) + 1;
  SET @ndoc = CONCAT(RIGHT(REPLICATE('0', @docWidth) + CONVERT(VARCHAR(50), @nextDoc), @docWidth), 'GT', ISNULL(@sucNorm, ''));

  IF OBJECT_ID('dbo.DAT_CTR_DOC', 'U') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'DOC') IS NOT NULL
     AND COL_LENGTH('dbo.DAT_CTR_DOC', 'CLSMOV') IS NOT NULL
  BEGIN
    INSERT INTO dbo.DAT_CTR_DOC (DOC, CLSMOV, FCND, [USER], STAT)
    VALUES (@ndoc, CONVERT(VARCHAR(20), @mov), GETDATE(), LEFT(ISNULL(@USR, SYSTEM_USER), 255), 'V');
  END;

  DECLARE @cols NVARCHAR(MAX);
  DECLARE @vals NVARCHAR(MAX);

  ;WITH cols AS (
    SELECT
      c.name,
      c.column_id,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsIdentity')) AS is_identity,
      CONVERT(INT, COLUMNPROPERTY(c.object_id, c.name, 'IsComputed')) AS is_computed
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.DAT_CTRL_CTAS')
  )
  SELECT
    @cols = STRING_AGG(QUOTENAME(name), ','),
    @vals = STRING_AGG(
      CASE
        WHEN name = 'SUC' THEN '@P_SUC'
        WHEN name = 'CLIENT' THEN '@P_CLIENT'
        WHEN name = 'IDFOL' THEN '@P_IDFOL'
        WHEN name = 'CTA' THEN '@P_CTA'
        WHEN name = 'IMPT' THEN '@P_IMPT'
        WHEN name = 'FCND' THEN 'GETDATE()'
        WHEN name = 'FCNR' THEN 'GETDATE()'
        WHEN name = 'FCN' THEN 'GETDATE()'
        WHEN name = 'FECHA' THEN 'GETDATE()'
        WHEN name = 'RTXT' THEN 'LEFT(ISNULL(@P_DESC_MOV, ''''), 255)'
        WHEN name = 'NDOC' THEN 'LEFT(@P_DOC, 255)'
        WHEN name = 'CLSD' THEN '@P_MOV'
        WHEN name = 'CMOV' THEN '@P_MOV'
        ELSE 'NULL'
      END,
      ','
    )
  FROM cols
  WHERE ISNULL(is_identity, 0) = 0
    AND ISNULL(is_computed, 0) = 0;

  IF ISNULL(@cols, '') = '' OR ISNULL(@vals, '') = ''
    RETURN;

  SET @sql = N'INSERT INTO dbo.DAT_CTRL_CTAS (' + @cols + N') VALUES (' + @vals + N');';

  EXEC sp_executesql
    @sql,
    N'@P_SUC NVARCHAR(10), @P_CLIENT FLOAT, @P_IDFOL NVARCHAR(255), @P_CTA NVARCHAR(20), @P_IMPT FLOAT, @P_DESC_MOV NVARCHAR(255), @P_DOC NVARCHAR(255), @P_MOV INT',
    @P_SUC = @SUC,
    @P_CLIENT = @CLIENT,
    @P_IDFOL = @IDFOL,
    @P_CTA = @cta,
    @P_IMPT = @impt,
    @P_DESC_MOV = @DESC_MOV,
    @P_DOC = @ndoc,
    @P_MOV = @mov;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material
  @IORD NVARCHAR(255),
  @ART_NUEVO NVARCHAR(255),
  @MOTIVO NVARCHAR(255),
  @LABOR INT = NULL,
  @DOCDIF NVARCHAR(255) = NULL,
  @MOTR INT = NULL,
  @CTD_C_M FLOAT = 1,
  @PVTA_NUEVO FLOAT = NULL,
  @IORD_NUEVA NVARCHAR(255) = NULL,
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

  DECLARE @idfol NVARCHAR(255);
  DECLARE @sucOrd NVARCHAR(10);
  DECLARE @artOrig NVARCHAR(255);
  DECLARE @ctdOrig FLOAT;
  DECLARE @clien FLOAT;
  DECLARE @newIord NVARCHAR(255);
  DECLARE @tipom INT = 1;
  DECLARE @tipomOrd INT = 0;
  DECLARE @estseguOrd FLOAT = 0;
  DECLARE @motrInt INT = ISNULL(@MOTR, TRY_CONVERT(INT, @MOTIVO));
  DECLARE @motivoLabel NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@MOTIVO, '')));
  DECLARE @doc NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@DOCDIF, '')));
  DECLARE @ctdAfectada FLOAT;
  DECLARE @remanente FLOAT = 0;
  DECLARE @ctdAbs FLOAT = 0;
  DECLARE @ctdSalida FLOAT = 0;
  DECLARE @docpOrig NVARCHAR(255);
  DECLARE @docpNew NVARCHAR(255);
  DECLARE @txtReingreso NVARCHAR(255);
  DECLARE @txtSalida NVARCHAR(255);
  DECLARE @txtDiff NVARCHAR(255);
  DECLARE @precioOrig FLOAT = 0;
  DECLARE @precioNuevo FLOAT = 0;
  DECLARE @importeOrig FLOAT = 0;
  DECLARE @importeNuevo FLOAT = 0;
  DECLARE @diffVenta FLOAT = 0;

  IF LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''))) = ''
    THROW 58020, 'artNuevo es requerido para cambio de material', 1;

  IF @doc = ''
    SET @doc = CONCAT(
      'ODIF-',
      FORMAT(GETDATE(), 'yyyyMMddHHmmss'),
      '-',
      RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)
    );

  IF ABS(ISNULL(@CTD_C_M, 0) - 1) > 0.0001
     AND ABS(ISNULL(@CTD_C_M, 0) - 0.5) > 0.0001
    THROW 58025, 'CTD_C_M solo permite valores 1 o 0.5', 1;

  IF OBJECT_ID('dbo.DAT_ORD_MOTM', 'U') IS NOT NULL
  BEGIN
    IF @motrInt IS NULL OR @motrInt <= 0
    BEGIN
      SELECT TOP 1 @motrInt = TRY_CONVERT(INT, IDM)
      FROM dbo.DAT_ORD_MOTM
      WHERE TRY_CONVERT(INT, TIPO) = 1
        AND UPPER(LTRIM(RTRIM(ISNULL(MOTM, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@motivoLabel, ''))));
    END;

    SELECT TOP 1 @motivoLabel = LTRIM(RTRIM(ISNULL(MOTM, '')))
    FROM dbo.DAT_ORD_MOTM
    WHERE TRY_CONVERT(INT, IDM) = @motrInt
      AND TRY_CONVERT(INT, TIPO) = 1;

    IF @motrInt IS NULL OR @motrInt <= 0 OR LTRIM(RTRIM(ISNULL(@motivoLabel, ''))) = ''
      THROW 58021, 'Debe seleccionar un motivo valido de DAT_ORD_MOTM para cambio de material', 1;
  END;

  IF LTRIM(RTRIM(ISNULL(@motivoLabel, ''))) = ''
    THROW 58021, 'motivo es requerido para cambio de material', 1;

  SELECT TOP 1
    @idfol = o.IDFOL,
    @sucOrd = o.SUC,
    @artOrig = o.ART,
    @ctdOrig = TRY_CONVERT(FLOAT, o.CTD),
    @clien = TRY_CONVERT(FLOAT, o.CLIEN),
    @tipomOrd = TRY_CONVERT(INT, o.TIPOM),
    @estseguOrd = TRY_CONVERT(FLOAT, o.ESTSEGU)
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

  IF @idfol IS NULL
    THROW 58022, 'No existe la ORD origen o no tiene acceso por sucursal', 1;

  IF @estseguOrd IS NULL OR ABS(@estseguOrd - 9.1) > 0.0001
    THROW 58023, 'La ORD debe estar en flujo 9.1 para aplicar cambio material', 1;

  IF ISNULL(@tipomOrd, 0) <> 1
    THROW 58024, 'La ORD debe tener TIPOM=1 para aplicar cambio material', 1;

  IF ISNULL(@ctdOrig, 0) <= 0
    THROW 58026, 'La ORD no tiene cantidad valida para cambio de material', 1;

  IF @CTD_C_M - @ctdOrig > 0.0001
    THROW 58027, 'CTD_C_M no puede ser mayor a la cantidad de la ORD origen', 1;

  SET @ctdAfectada = @CTD_C_M;
  SET @remanente = @ctdOrig - @ctdAfectada;
  SET @newIord = NULLIF(LTRIM(RTRIM(ISNULL(@IORD_NUEVA, ''))), '');

  IF @newIord IS NULL
  BEGIN
    DECLARE @fcnGenCM DATETIME = GETDATE();
    EXEC dbo.sp_pv_ctr_ords_generate_iord
      @SUC = @sucOrd,
      @FCN = @fcnGenCM,
      @IORD_OUT = @newIord OUTPUT;
  END;

  IF @newIord IS NULL OR LTRIM(RTRIM(@newIord)) = ''
    THROW 58028, 'No se pudo generar la nueva IORD para cambio material', 1;

  SET @ctdAbs = ABS(@ctdAfectada);
  SET @ctdSalida = -ABS(@ctdAfectada);
  SET @docpOrig = ISNULL(@idfol, @IORD);
  SET @docpNew = @docpOrig;
  SET @txtReingreso = CONCAT('Cambio - Reintegracion stock ORD', @IORD);
  SET @txtSalida = CONCAT('Cambio - Descuento stock ORD', @newIord);
  SET @txtDiff = CONCAT('Diferencia cambio material ORD ', @IORD, ' -> ', @newIord);

  BEGIN TRY
    BEGIN TRANSACTION;

    EXEC dbo.sp_ordenes_trabajo_clone_ord
      @IORD_ORIG = @IORD,
      @IORD_NEW = @newIord,
      @NEW_ART = @ART_NUEVO,
      @NEW_CTD = @ctdOrig,
      @TIPOM = @tipom,
      @MOTR = @motrInt,
      @REEORD = @IORD,
      @DOCDIF = @doc,
      @ESTSEGU = 3,
      @ESTATUS = 2;

    IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
    BEGIN
      INSERT INTO dbo.PV_CTR_ORDS_DET (IORDP, IORD, ART, JOB, ESF, CIL, EJE)
      SELECT
        CONCAT(
          ROW_NUMBER() OVER (
            ORDER BY
              CASE UPPER(LTRIM(RTRIM(ISNULL(d.JOB, ''))))
                WHEN 'OD' THEN 1
                WHEN 'OI' THEN 2
                WHEN 'ADD' THEN 3
                ELSE 99
              END,
              UPPER(LTRIM(RTRIM(ISNULL(d.IORDP, ''))))
          ),
          @newIord
        ),
        @newIord,
        COALESCE(NULLIF(@ART_NUEVO, ''), d.ART),
        d.JOB,
        d.ESF,
        d.CIL,
        d.EJE
      FROM dbo.PV_CTR_ORDS_DET d
      WHERE d.IORD = @IORD;
    END;

    UPDATE dbo.PV_CTR_ORDS
    SET
      CTD = @ctdOrig,
      CTD_C_M = @ctdAfectada,
      REEORD = @newIord,
      selCtrlOrd = NULL,
      ESTSEGU = 4,
      ESTATUS = 2,
      FCNMOD = GETDATE(),
      COMAD = LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          'CAMBIO MATERIAL: ',
          @motivoLabel
        ),
        2000
      )
    WHERE IORD = @IORD;

    UPDATE dbo.PV_CTR_ORDS
    SET
      ASIGN = NULL,
      CTD_C_M = @ctdAfectada,
      selCtrlOrd = NULL,
      FCNMOD = GETDATE()
    WHERE IORD = @newIord;

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdAbs,
      @TXT = @txtReingreso,
      @DOCP = @docpOrig,
      @USR = @USER,
      @CLSM = '204';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @ART_NUEVO,
      @CTDA = @ctdSalida,
      @TXT = @txtSalida,
      @DOCP = @docpNew,
      @USR = @USER,
      @CLSM = '205';

    IF OBJECT_ID('dbo.PV_TICKET_LOG', 'U') IS NOT NULL
    BEGIN
      SELECT TOP 1
        @precioOrig = COALESCE(
          TRY_CONVERT(FLOAT, t.PVTAT),
          TRY_CONVERT(FLOAT, t.PVTA),
          0
        )
      FROM dbo.PV_TICKET_LOG t
      WHERE (
          UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@IORD)
          OR (
            UPPER(LTRIM(RTRIM(ISNULL(t.IDFOL, '')))) = UPPER(@idfol)
            AND UPPER(LTRIM(RTRIM(ISNULL(t.ART, '')))) = UPPER(@artOrig)
          )
        )
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@IORD) THEN 0
          ELSE 1
        END,
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(t.ART, '')))) = UPPER(@artOrig) THEN 0
          ELSE 1
        END,
        ISNULL(t.updated_at, CONVERT(DATETIME, '19000101', 112)) DESC,
        LTRIM(RTRIM(ISNULL(t.ID, ''))) DESC;
    END;

    IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
    BEGIN
      SELECT TOP 1
        @precioNuevo = TRY_CONVERT(FLOAT, a.PVTA)
      FROM dbo.DAT_ART a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''))))
      ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC;
    END;

    IF ISNULL(@precioOrig, 0) = 0 AND OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
    BEGIN
      SELECT TOP 1
        @precioOrig = TRY_CONVERT(FLOAT, a.PVTA)
      FROM dbo.DAT_ART a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@artOrig, ''))))
      ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC;
    END;
    SET @precioNuevo = COALESCE(@PVTA_NUEVO, @precioNuevo, @precioOrig, 0);
    SET @importeOrig = ROUND(ISNULL(@precioOrig, 0) * @ctdAfectada, 2);
    SET @importeNuevo = ROUND(ISNULL(@precioNuevo, 0) * @ctdAfectada, 2);

    DECLARE @ivaIntegrado INT = 0;
    DECLARE @rqfacFolio INT = 0;
    DECLARE @tipoTran NVARCHAR(2) = 'VF';
    DECLARE @totalOrig FLOAT = 0;
    DECLARE @totalNuevo FLOAT = 0;

    SELECT TOP 1
      @ivaIntegrado = ISNULL(TRY_CONVERT(INT, s.IVA_INTEGRADO), 0)
    FROM dbo.DAT_SUC s
    WHERE UPPER(LTRIM(RTRIM(ISNULL(s.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))));

    SELECT TOP 1
      @rqfacFolio = ISNULL(TRY_CONVERT(INT, f.REQF), 0),
      @tipoTran = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(f.ORIGEN_AUT, '')))) IN ('CA', 'VF') THEN UPPER(LTRIM(RTRIM(ISNULL(f.ORIGEN_AUT, ''))))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(f.AUT, '')))) IN ('DCA', 'CA', 'DC', 'DG', 'CP', 'PS') THEN 'CA'
        WHEN UPPER(LTRIM(RTRIM(ISNULL(f.AUT, '')))) IN ('DVF', 'VF') THEN 'VF'
        ELSE 'VF'
      END
    FROM dbo.PV_CTR_FOL_ASVR f
    WHERE UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@idfol, ''))))
    ORDER BY ISNULL(f.FCNM, f.FCN) DESC;

    IF @tipoTran = 'CA'
    BEGIN
      SET @totalOrig = ROUND(@importeOrig, 2);
      SET @totalNuevo = ROUND(@importeNuevo, 2);
    END
    ELSE IF @ivaIntegrado = -1
    BEGIN
      SET @totalOrig = ROUND(@importeOrig, 2);
      SET @totalNuevo = ROUND(@importeNuevo, 2);
    END
    ELSE IF @rqfacFolio = 1
    BEGIN
      SET @totalOrig = ROUND(@importeOrig * 1.16, 2);
      SET @totalNuevo = ROUND(@importeNuevo * 1.16, 2);
    END
    ELSE
    BEGIN
      SET @totalOrig = ROUND(@importeOrig, 2);
      SET @totalNuevo = ROUND(@importeNuevo, 2);
    END;

    SET @diffVenta = ROUND(@totalNuevo - @totalOrig, 2);

    EXEC dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff
      @SUC = @sucOrd,
      @CLIENT = @clien,
      @IDFOL = @idfol,
      @DIFF = @diffVenta,
      @DOCDIF = @doc,
      @DESC_MOV = @txtDiff,
      @USR = @USER;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    @IORD AS IORD_ORIG,
    @newIord AS IORD_NUEVA,
    @idfol AS IDFOL,
    @doc AS DOCDIF,
    @motrInt AS MOTR,
    @motivoLabel AS MOTIVO,
    @ctdAfectada AS CTD_C_M,
    @ctdOrig AS CTD_ORIGINAL,
    @remanente AS CTD_REMANENTE,
    @diffVenta AS DIFERENCIA_ECONOMICA,
    CASE WHEN ABS(ISNULL(@diffVenta, 0)) >= 0.009 THEN 1 ELSE 0 END AS AFECTACION_CONTABLE,
    @sucOrd AS SUC,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_merma
  @IORD NVARCHAR(255),
  @CANTIDAD_MERMA FLOAT,
  @MOTIVO NVARCHAR(255),
  @CREAR_NUEVA_ORD BIT = 1,
  @MOTR INT = NULL,
  @ART_NUEVO NVARCHAR(255) = NULL,
  @CTD_C_M FLOAT = NULL,
  @PVTA_NUEVO FLOAT = NULL,
  @IORD_NUEVA NVARCHAR(255) = NULL,
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

  DECLARE @idfol NVARCHAR(255);
  DECLARE @sucOrd NVARCHAR(10);
  DECLARE @artOrig NVARCHAR(255);
  DECLARE @artSalida NVARCHAR(255);
  DECLARE @ctdOrig FLOAT;
  DECLARE @clien FLOAT;
  DECLARE @remanente FLOAT;
  DECLARE @newIord NVARCHAR(255) = NULL;
  DECLARE @tipom INT = 2;
  DECLARE @tipomOrd INT = 0;
  DECLARE @estseguOrd FLOAT = 0;
  DECLARE @motrInt INT = ISNULL(@MOTR, TRY_CONVERT(INT, @MOTIVO));
  DECLARE @motivoLabel NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@MOTIVO, '')));
  DECLARE @ctdAfectada FLOAT = ISNULL(@CTD_C_M, @CANTIDAD_MERMA);
  DECLARE @ctdMermaAbs FLOAT = 0;
  DECLARE @ctdMermaSalida FLOAT = 0;
  DECLARE @docpMerma NVARCHAR(255);
  DECLARE @docpMermaSalida NVARCHAR(255);
  DECLARE @txtMermaReingreso NVARCHAR(255);
  DECLARE @txtMermaCargo NVARCHAR(255);
  DECLARE @txtMermaSalida NVARCHAR(255);
  DECLARE @doc NVARCHAR(255);
  DECLARE @txtDiff NVARCHAR(255);
  DECLARE @precioOrig FLOAT = 0;
  DECLARE @precioNuevo FLOAT = 0;
  DECLARE @importeOrig FLOAT = 0;
  DECLARE @importeNuevo FLOAT = 0;
  DECLARE @diffVenta FLOAT = 0;

  IF ABS(ISNULL(@ctdAfectada, 0) - 1) > 0.0001
     AND ABS(ISNULL(@ctdAfectada, 0) - 0.5) > 0.0001
    THROW 58037, 'CTD_C_M solo permite valores 1 o 0.5', 1;

  IF ISNULL(@ctdAfectada, 0) <= 0
    THROW 58030, 'cantidadMerma debe ser mayor a cero', 1;

  IF OBJECT_ID('dbo.DAT_ORD_MOTM', 'U') IS NOT NULL
  BEGIN
    IF @motrInt IS NULL OR @motrInt <= 0
    BEGIN
      SELECT TOP 1 @motrInt = TRY_CONVERT(INT, IDM)
      FROM dbo.DAT_ORD_MOTM
      WHERE TRY_CONVERT(INT, TIPO) = 2
        AND UPPER(LTRIM(RTRIM(ISNULL(MOTM, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@motivoLabel, ''))));
    END;

    SELECT TOP 1 @motivoLabel = LTRIM(RTRIM(ISNULL(MOTM, '')))
    FROM dbo.DAT_ORD_MOTM
    WHERE TRY_CONVERT(INT, IDM) = @motrInt
      AND TRY_CONVERT(INT, TIPO) = 2;

    IF @motrInt IS NULL OR @motrInt <= 0 OR LTRIM(RTRIM(ISNULL(@motivoLabel, ''))) = ''
      THROW 58031, 'Debe seleccionar un motivo valido de DAT_ORD_MOTM para merma', 1;
  END;

  IF LTRIM(RTRIM(ISNULL(@motivoLabel, ''))) = ''
    THROW 58031, 'motivo es requerido para merma', 1;

  SELECT TOP 1
    @idfol = o.IDFOL,
    @sucOrd = o.SUC,
    @artOrig = o.ART,
    @ctdOrig = TRY_CONVERT(FLOAT, o.CTD),
    @clien = TRY_CONVERT(FLOAT, o.CLIEN),
    @tipomOrd = TRY_CONVERT(INT, o.TIPOM),
    @estseguOrd = TRY_CONVERT(FLOAT, o.ESTSEGU)
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

  IF @idfol IS NULL
    THROW 58032, 'No existe la ORD origen o no tiene acceso por sucursal', 1;

  IF @estseguOrd IS NULL OR ABS(@estseguOrd - 9.2) > 0.0001
    THROW 58035, 'La ORD debe estar en flujo 9.2 para aplicar merma', 1;

  IF ISNULL(@tipomOrd, 0) <> 2
    THROW 58036, 'La ORD debe tener TIPOM=2 para aplicar merma', 1;

  IF ISNULL(@ctdOrig, 0) <= 0
    THROW 58033, 'La ORD no tiene cantidad valida para procesar merma', 1;

  IF @ctdAfectada - @ctdOrig > 0.0001
    THROW 58034, 'cantidadMerma no puede ser mayor a la cantidad original', 1;

  SET @CANTIDAD_MERMA = @ctdAfectada;
  SET @remanente = @ctdOrig - @ctdAfectada;
  SET @artSalida = COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''))), ''), @artOrig);
  SET @doc = CONCAT(
    'ODIF-',
    FORMAT(GETDATE(), 'yyyyMMddHHmmss'),
    '-',
    RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)
  );
  SET @txtDiff = CONCAT('Diferencia merma ORD ', @IORD);

  IF @CREAR_NUEVA_ORD = 1
  BEGIN
    SET @newIord = NULLIF(LTRIM(RTRIM(ISNULL(@IORD_NUEVA, ''))), '');

    IF @newIord IS NULL
    BEGIN
      DECLARE @fcnGenMerma DATETIME = GETDATE();
      EXEC dbo.sp_pv_ctr_ords_generate_iord
        @SUC = @sucOrd,
        @FCN = @fcnGenMerma,
        @IORD_OUT = @newIord OUTPUT;
    END;

    IF @newIord IS NULL OR LTRIM(RTRIM(@newIord)) = ''
      THROW 58038, 'No se pudo generar la nueva IORD para merma', 1;
  END;

  SET @ctdMermaAbs = ABS(@ctdAfectada);
  SET @ctdMermaSalida = -ABS(@ctdAfectada);
  SET @docpMerma = ISNULL(@idfol, @IORD);
  SET @docpMermaSalida = @docpMerma;
  SET @txtMermaReingreso = CONCAT('Merma - Reintegracion stock ORD', @IORD);
  SET @txtMermaCargo = CONCAT('Merma por uso ', @motrInt, ', ORD: ', @IORD);
  SET @txtMermaSalida = CONCAT('Merma - Descuento stock ORD', ISNULL(@newIord, @IORD));

  BEGIN TRY
    BEGIN TRANSACTION;

    IF @CREAR_NUEVA_ORD = 1
    BEGIN
      EXEC dbo.sp_ordenes_trabajo_clone_ord
        @IORD_ORIG = @IORD,
        @IORD_NEW = @newIord,
        @NEW_ART = @artSalida,
        @NEW_CTD = @ctdOrig,
        @TIPOM = @tipom,
        @MOTR = @motrInt,
        @REEORD = @IORD,
        @DOCDIF = @doc,
        @ESTSEGU = 3,
        @ESTATUS = 2;

      IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.PV_CTR_ORDS_DET (IORDP, IORD, ART, JOB, ESF, CIL, EJE)
        SELECT
          CONCAT(
            ROW_NUMBER() OVER (
              ORDER BY
                CASE UPPER(LTRIM(RTRIM(ISNULL(d.JOB, ''))))
                  WHEN 'OD' THEN 1
                  WHEN 'OI' THEN 2
                  WHEN 'ADD' THEN 3
                  ELSE 99
                END,
                UPPER(LTRIM(RTRIM(ISNULL(d.IORDP, ''))))
            ),
            @newIord
          ),
          @newIord,
          COALESCE(NULLIF(@artSalida, ''), d.ART),
          d.JOB,
          d.ESF,
          d.CIL,
          d.EJE
        FROM dbo.PV_CTR_ORDS_DET d
        WHERE d.IORD = @IORD;
      END;
    END;

    UPDATE dbo.PV_CTR_ORDS
    SET
      CTD = @ctdOrig,
      CTD_C_M = @ctdAfectada,
      REEORD = @newIord,
      selCtrlOrd = NULL,
      ESTSEGU = 4,
      ESTATUS = 2,
      FCNMOD = GETDATE(),
      COMAD = LEFT(
        CONCAT(
          ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''),
          CASE
            WHEN LTRIM(RTRIM(ISNULL(CAST(COMAD AS NVARCHAR(MAX)), ''))) = ''
              THEN ''
            ELSE ' | '
          END,
          'MERMA: ',
          @motivoLabel
        ),
        2000
      )
    WHERE IORD = @IORD;

    IF @CREAR_NUEVA_ORD = 1
    BEGIN
      UPDATE dbo.PV_CTR_ORDS
      SET
        ASIGN = NULL,
        CTD_C_M = @ctdAfectada,
        selCtrlOrd = NULL,
        FCNMOD = GETDATE()
      WHERE IORD = @newIord;
    END;

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdMermaAbs,
      @TXT = @txtMermaReingreso,
      @DOCP = @docpMerma,
      @USR = @USER,
      @CLSM = '456';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artOrig,
      @CTDA = @ctdMermaSalida,
      @TXT = @txtMermaCargo,
      @DOCP = @docpMerma,
      @USR = @USER,
      @CLSM = '455';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artSalida,
      @CTDA = @ctdMermaSalida,
      @TXT = @txtMermaSalida,
      @DOCP = @docpMermaSalida,
      @USR = @USER,
      @CLSM = '457';

    IF @CREAR_NUEVA_ORD = 1
    BEGIN
      IF OBJECT_ID('dbo.PV_TICKET_LOG', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 1
          @precioOrig = COALESCE(
            TRY_CONVERT(FLOAT, t.PVTAT),
            TRY_CONVERT(FLOAT, t.PVTA),
            0
          )
        FROM dbo.PV_TICKET_LOG t
        WHERE (
            UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@IORD)
            OR (
              UPPER(LTRIM(RTRIM(ISNULL(t.IDFOL, '')))) = UPPER(@idfol)
              AND UPPER(LTRIM(RTRIM(ISNULL(t.ART, '')))) = UPPER(@artOrig)
            )
          )
        ORDER BY
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@IORD) THEN 0
            ELSE 1
          END,
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(t.ART, '')))) = UPPER(@artOrig) THEN 0
            ELSE 1
          END,
          ISNULL(t.updated_at, CONVERT(DATETIME, '19000101', 112)) DESC,
          LTRIM(RTRIM(ISNULL(t.ID, ''))) DESC;
      END;

      IF OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 1
          @precioNuevo = TRY_CONVERT(FLOAT, a.PVTA)
        FROM dbo.DAT_ART a
        WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
          AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@artSalida, ''))))
        ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC;
      END;

      IF ISNULL(@precioOrig, 0) = 0 AND OBJECT_ID('dbo.DAT_ART', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 1
          @precioOrig = TRY_CONVERT(FLOAT, a.PVTA)
        FROM dbo.DAT_ART a
        WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
          AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@artOrig, ''))))
        ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC;
      END;
    SET @precioNuevo = COALESCE(@PVTA_NUEVO, @precioNuevo, @precioOrig, 0);
    SET @importeOrig = ROUND(ISNULL(@precioOrig, 0) * @ctdAfectada, 2);
    SET @importeNuevo = ROUND(ISNULL(@precioNuevo, 0) * @ctdAfectada, 2);

    DECLARE @ivaIntegrado INT = 0;
    DECLARE @rqfacFolio INT = 0;
    DECLARE @tipoTran NVARCHAR(2) = 'VF';
    DECLARE @totalOrig FLOAT = 0;
    DECLARE @totalNuevo FLOAT = 0;

    SELECT TOP 1
      @ivaIntegrado = ISNULL(TRY_CONVERT(INT, s.IVA_INTEGRADO), 0)
    FROM dbo.DAT_SUC s
    WHERE UPPER(LTRIM(RTRIM(ISNULL(s.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))));

    SELECT TOP 1
      @rqfacFolio = ISNULL(TRY_CONVERT(INT, f.REQF), 0),
      @tipoTran = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(f.ORIGEN_AUT, '')))) IN ('CA', 'VF') THEN UPPER(LTRIM(RTRIM(ISNULL(f.ORIGEN_AUT, ''))))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(f.AUT, '')))) IN ('DCA', 'CA', 'DC', 'DG', 'CP', 'PS') THEN 'CA'
        WHEN UPPER(LTRIM(RTRIM(ISNULL(f.AUT, '')))) IN ('DVF', 'VF') THEN 'VF'
        ELSE 'VF'
      END
    FROM dbo.PV_CTR_FOL_ASVR f
    WHERE UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@idfol, ''))))
    ORDER BY ISNULL(f.FCNM, f.FCN) DESC;

    IF @tipoTran = 'CA'
    BEGIN
      SET @totalOrig = ROUND(@importeOrig, 2);
      SET @totalNuevo = ROUND(@importeNuevo, 2);
    END
    ELSE IF @ivaIntegrado = -1
    BEGIN
      SET @totalOrig = ROUND(@importeOrig, 2);
      SET @totalNuevo = ROUND(@importeNuevo, 2);
    END
    ELSE IF @rqfacFolio = 1
    BEGIN
      SET @totalOrig = ROUND(@importeOrig * 1.16, 2);
      SET @totalNuevo = ROUND(@importeNuevo * 1.16, 2);
    END
    ELSE
    BEGIN
      SET @totalOrig = ROUND(@importeOrig, 2);
      SET @totalNuevo = ROUND(@importeNuevo, 2);
    END;

    SET @diffVenta = ROUND(@totalNuevo - @totalOrig, 2);

      EXEC dbo.sp_ordenes_trabajo_registrar_ctrl_ctas_diff
        @SUC = @sucOrd,
        @CLIENT = @clien,
        @IDFOL = @idfol,
        @DIFF = @diffVenta,
        @DOCDIF = @doc,
        @DESC_MOV = @txtDiff,
      @USR = @USER;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    @IORD AS IORD_ORIG,
    @newIord AS IORD_NUEVA,
    @idfol AS IDFOL,
    @motrInt AS MOTR,
    @motivoLabel AS MOTIVO,
    @ctdOrig AS CTD_ORIGINAL,
    @ctdAfectada AS CTD_MERMA,
    @ctdAfectada AS CTD_C_M,
    @remanente AS CTD_REMANENTE,
    1 AS ORD_CANCELADA,
    @diffVenta AS DIFERENCIA_ECONOMICA,
    CASE WHEN ABS(ISNULL(@diffVenta, 0)) >= 0.009 THEN 1 ELSE 0 END AS AFECTACION_CONTABLE,
    @sucOrd AS SUC,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR;
END;
GO



