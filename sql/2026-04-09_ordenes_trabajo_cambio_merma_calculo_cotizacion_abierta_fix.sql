/*
  Ajuste 2026-04-09: Homologación de diferencia económica ORDs con regla de cotizaciones abiertas.
  Regla aplicada: tipo de cotización (CA/VF), IVA_INTEGRADO (DAT_SUC) y REQF/RQFAC del folio.
*/

CREATE OR ALTER PROCEDURE dbo.sp_ordenes_trabajo_cambio_material
  @IORD NVARCHAR(255),
  @ART_NUEVO NVARCHAR(255),
  @MOTIVO NVARCHAR(255),
  @LABOR INT = NULL,
  @DOCDIF NVARCHAR(255) = NULL,
  @MOTR INT = NULL,
  @CTD_C_M FLOAT = 1,
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
  SET @newIord = LEFT(CONCAT(
      ISNULL(@idfol, 'ORD'),
      '-CM-',
      FORMAT(GETDATE(), 'yyyyMMddHHmmss'),
      '-',
      RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)
    ), 255);
  SET @ctdAbs = ABS(@ctdAfectada);
  SET @ctdSalida = -ABS(@ctdAfectada);
  SET @docpOrig = ISNULL(@idfol, @IORD);
  SET @docpNew = ISNULL(@idfol, @newIord);
  SET @txtReingreso = CONCAT('Reintegracion por cambio material ORD ', @IORD);
  SET @txtSalida = CONCAT('Salida por cambio material ORD ', @newIord);
  SET @txtDiff = CONCAT('Diferencia cambio material ORD ', @IORD, ' -> ', @newIord);

  BEGIN TRY
    BEGIN TRANSACTION;

    EXEC dbo.sp_ordenes_trabajo_clone_ord
      @IORD_ORIG = @IORD,
      @IORD_NEW = @newIord,
      @NEW_ART = @ART_NUEVO,
      @NEW_CTD = @ctdAfectada,
      @TIPOM = @tipom,
      @MOTR = @motrInt,
      @REEORD = @IORD,
      @DOCDIF = @doc,
      @ESTSEGU = 3,
      @ESTATUS = 2;

    IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
    BEGIN
      INSERT INTO dbo.PV_CTR_ORDS_DET (IORD, ART, JOB, ESF, CIL, EJE)
      SELECT
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
      CTD = CASE WHEN @remanente > 0 THEN @remanente ELSE CTD END,
      CTD_C_M = @ctdAfectada,
      selCtrlOrd = NULL,
      ESTSEGU = CASE WHEN @remanente > 0 THEN ESTSEGU ELSE 4 END,
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
      @CLSM = 'ORD';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @ART_NUEVO,
      @CTDA = @ctdSalida,
      @TXT = @txtSalida,
      @DOCP = @docpNew,
      @USR = @USER,
      @CLSM = 'ORD';

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
      @DESC_MOV = @txtDiff;

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
    SET @newIord = LEFT(CONCAT(
      ISNULL(@idfol, 'ORD'),
      '-MR-',
      FORMAT(GETDATE(), 'yyyyMMddHHmmss'),
      '-',
      RIGHT(CONVERT(VARCHAR(36), NEWID()), 4)
    ), 255);

  SET @ctdMermaAbs = ABS(@ctdAfectada);
  SET @ctdMermaSalida = -ABS(@ctdAfectada);
  SET @docpMerma = ISNULL(@idfol, @IORD);
  SET @docpMermaSalida = ISNULL(@newIord, @docpMerma);
  SET @txtMermaReingreso = CONCAT('Reintegracion por merma ORD ', @IORD);
  SET @txtMermaSalida = CONCAT('Salida por merma ORD ', ISNULL(@newIord, @IORD));

  BEGIN TRY
    BEGIN TRANSACTION;

    IF @CREAR_NUEVA_ORD = 1
    BEGIN
      EXEC dbo.sp_ordenes_trabajo_clone_ord
        @IORD_ORIG = @IORD,
        @IORD_NEW = @newIord,
        @NEW_ART = @artSalida,
        @NEW_CTD = @ctdAfectada,
        @TIPOM = @tipom,
        @MOTR = @motrInt,
        @REEORD = @IORD,
        @DOCDIF = @doc,
        @ESTSEGU = 3,
        @ESTATUS = 2;

      IF OBJECT_ID('dbo.PV_CTR_ORDS_DET', 'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.PV_CTR_ORDS_DET (IORD, ART, JOB, ESF, CIL, EJE)
        SELECT
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
      CTD = CASE WHEN @remanente > 0 THEN @remanente ELSE CTD END,
      CTD_C_M = @ctdAfectada,
      selCtrlOrd = NULL,
      ESTSEGU = CASE WHEN @remanente > 0 THEN ESTSEGU ELSE 4 END,
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
      @CLSM = 'ORD';

    EXEC dbo.sp_ordenes_trabajo_registrar_mb51
      @SUC = @sucOrd,
      @ART = @artSalida,
      @CTDA = @ctdMermaSalida,
      @TXT = @txtMermaSalida,
      @DOCP = @docpMermaSalida,
      @USR = @USER,
      @CLSM = 'ORD';

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
        @DESC_MOV = @txtDiff;
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
    CASE WHEN @remanente <= 0 THEN 1 ELSE 0 END AS ORD_CANCELADA,
    @diffVenta AS DIFERENCIA_ECONOMICA,
    CASE WHEN ABS(ISNULL(@diffVenta, 0)) >= 0.009 THEN 1 ELSE 0 END AS AFECTACION_CONTABLE,
    @sucOrd AS SUC,
    @USER AS USER_ACTOR,
    @IP AS IP_ACTOR;
END;


GO

