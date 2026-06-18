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

  IF ABS(ISNULL(@ctdOrig, 0) - 1) > 0.0001
     AND ABS(ISNULL(@ctdOrig, 0) - 0.5) > 0.0001
    THROW 58029, 'La ORD origen debe haber sido creada con cantidad 1 o 0.5 para cambio de material', 1;

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
      @TIPOM = 0,
      @MOTR = NULL,
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
      MOTR = NULL,
      TIPOM = 0,
      DESCART = COALESCE(
        (
          SELECT TOP 1 LTRIM(RTRIM(ISNULL(a.DES, '')))
          FROM dbo.DAT_ART a
          WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@sucOrd, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@ART_NUEVO, ''))))
          ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC
        ),
        DESCART
      ),
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
    SET @importeOrig = ROUND(
      ISNULL(@precioOrig, 0) * (ISNULL(@ctdAfectada, 0) / NULLIF(@ctdOrig, 0)),
      2
    );
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

