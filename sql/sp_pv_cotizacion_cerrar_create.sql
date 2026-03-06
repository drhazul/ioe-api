CREATE OR ALTER PROCEDURE dbo.sp_pv_cotizacion_cerrar
  @IDFOL NVARCHAR(255),
  @SUC NVARCHAR(255) = NULL,
  @TIPOTRAN NVARCHAR(10),
  @RQFAC BIT,
  @IDOPV NVARCHAR(255) = NULL,
  @FORMAS_JSON NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @sucInput NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@SUC, '')));
  DECLARE @tipotranNorm NVARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPOTRAN, ''))));
  DECLARE @opvNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@IDOPV, ''))), '');
  DECLARE @epsilon DECIMAL(18, 6) = 0.0001;
  DECLARE @fechaProceso DATETIME = GETDATE();

  DECLARE @sucDb NVARCHAR(255);
  DECLARE @clien FLOAT;
  DECLARE @esta NVARCHAR(255);
  DECLARE @itemsCount INT = 0;
  DECLARE @totalBase MONEY = 0;
  DECLARE @ivaIntegrado INT;
  DECLARE @subtotal MONEY = 0;
  DECLARE @iva MONEY = 0;
  DECLARE @totalFinal MONEY = 0;
  DECLARE @sumPagos MONEY = 0;
  DECLARE @cambio MONEY = 0;

  DECLARE @creditoSolicitado MONEY = 0;
  DECLARE @limite MONEY = 0;
  DECLARE @ejercido MONEY = 0;
  DECLARE @disponible MONEY = 0;

  DECLARE @folFormTable NVARCHAR(512);
  DECLARE @folFormObjId INT;
  DECLARE @hasIMPA BIT = 0;
  DECLARE @hasIMPD BIT = 0;
  DECLARE @hasAUT BIT = 0;

  DECLARE @ctrlObjId INT;
  DECLARE @ctrlHasCTA BIT = 0;
  DECLARE @ctrlHasCLIENT BIT = 0;
  DECLARE @ctrlHasCMOV BIT = 0;
  DECLARE @ctrlHasCLSD BIT = 0;
  DECLARE @ctrlHasIMPT BIT = 0;
  DECLARE @ctrlHasNDOC BIT = 0;
  DECLARE @ctrlHasIDFOL BIT = 0;
  DECLARE @ctrlHasSUC BIT = 0;
  DECLARE @ctrlHasOPV BIT = 0;
  DECLARE @ctrlHasIDOPV BIT = 0;
  DECLARE @ctrlHasTIPO BIT = 0;
  DECLARE @ctrlHasRTXT BIT = 0;
  DECLARE @ctrlHasFCND BIT = 0;
  DECLARE @ctrlHasFCN BIT = 0;
  DECLARE @ctrlHasFCNR BIT = 0;
  DECLARE @ctrlHasFECHA BIT = 0;
  DECLARE @ctrlClassCol NVARCHAR(10);

  DECLARE @docObjId INT;
  DECLARE @docHasNDOC BIT = 0;
  DECLARE @docHasIDFOL BIT = 0;
  DECLARE @docHasCLIENT BIT = 0;
  DECLARE @docHasCTA BIT = 0;
  DECLARE @docHasCMOV BIT = 0;
  DECLARE @docHasCLSD BIT = 0;
  DECLARE @docHasIMPT BIT = 0;
  DECLARE @docHasSUC BIT = 0;
  DECLARE @docHasOPV BIT = 0;
  DECLARE @docHasIDOPV BIT = 0;
  DECLARE @docHasTIPO BIT = 0;
  DECLARE @docHasRTXT BIT = 0;
  DECLARE @docHasFCND BIT = 0;
  DECLARE @docHasFCN BIT = 0;
  DECLARE @docHasFCNR BIT = 0;
  DECLARE @docHasFECHA BIT = 0;
  DECLARE @docClassCol NVARCHAR(10);

  DECLARE @sql NVARCHAR(MAX);
  DECLARE @params NVARCHAR(MAX);

  DECLARE @formaForm NVARCHAR(40);
  DECLARE @formaImpp MONEY;
  DECLARE @formaAut NVARCHAR(255);
  DECLARE @formaAutFinal NVARCHAR(255);
  DECLARE @impc MONEY;
  DECLARE @cambioPendiente MONEY;
  DECLARE @efectivoCambioAsignado BIT = 0;
  DECLARE @execIdf NVARCHAR(255);
  DECLARE @execImptNeg MONEY;
  DECLARE @execRqfac INT;

  DECLARE @lockResult INT;
  DECLARE @maxCtrl BIGINT = 0;
  DECLARE @maxDoc BIGINT = 0;
  DECLARE @nextNdoc BIGINT;
  DECLARE @ndoc NVARCHAR(255);
  DECLARE @cargoRtxt NVARCHAR(255);

  DECLARE @headerObjId INT;
  DECLARE @headHasREQF BIT = 0;
  DECLARE @headHasRQFAC BIT = 0;
  DECLARE @headHasAUT BIT = 0;
  DECLARE @headHasFCNM BIT = 0;
  DECLARE @headHasOPVM BIT = 0;

  IF @idfolNorm = ''
    THROW 51001, 'IDFOL es requerido', 1;

  IF @tipotranNorm NOT IN ('CA', 'VF')
    THROW 51002, 'TIPOTRAN invalido. Valores permitidos: CA, VF', 1;

  IF @tipotranNorm = 'CA'
    SET @RQFAC = 0;

  IF NULLIF(LTRIM(RTRIM(ISNULL(@FORMAS_JSON, ''))), '') IS NULL
    THROW 51003, 'FORMAS_JSON es requerido', 1;

  DECLARE @FORMAS TABLE (
    ROW_ID INT IDENTITY(1, 1) PRIMARY KEY,
    FORM_RAW NVARCHAR(40) NULL,
    FORM NVARCHAR(40) NULL,
    IMPP MONEY NULL,
    AUT NVARCHAR(255) NULL
  );

  DECLARE @USED_REFS TABLE (
    IDREF NVARCHAR(255) PRIMARY KEY
  );

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1
      @sucDb = LTRIM(RTRIM(ISNULL(SUC, ''))),
      @clien = TRY_CONVERT(FLOAT, CLIEN),
      @esta = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE IDFOL = @idfolNorm;

    IF @sucDb IS NULL
      THROW 51004, 'La cotizacion no existe', 1;

    IF @sucDb = ''
      THROW 51005, 'La cotizacion no tiene sucursal asignada', 1;

    IF @sucInput <> '' AND @sucInput <> @sucDb
      THROW 51006, 'La sucursal enviada no corresponde al folio', 1;

    IF @esta LIKE '%PAGAD%'
      OR @esta LIKE '%TRANSMITIR%'
      OR @esta LIKE '%FINAL%'
      OR @esta LIKE '%PROCES%'
      OR @esta LIKE '%CERRAD%'
      OR @esta LIKE '%CANCEL%'
      OR @esta LIKE '%ENVIAD%'
      OR @esta LIKE '%FACTUR%'
      OR @esta LIKE '%TERMIN%'
      THROW 51007, 'La cotizacion ya no permite cierre en su estado actual', 1;

    SELECT
      @itemsCount = COUNT(1),
      @totalBase = ROUND(SUM(ISNULL(CTD, 0) * ISNULL(PVTA, 0)), 2)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    IF ISNULL(@itemsCount, 0) <= 0
      THROW 51008, 'La cotizacion no tiene articulos para cierre', 1;

    IF ISNULL(@totalBase, 0) <= 0
      THROW 51009, 'La cotizacion tiene total base invalido', 1;

    SELECT TOP 1
      @ivaIntegrado = TRY_CONVERT(INT, IVA_INTEGRADO)
    FROM dbo.DAT_SUC
    WHERE SUC = @sucDb;

    IF @ivaIntegrado IS NULL
      THROW 51010, 'No existe configuracion IVA para la sucursal del folio', 1;

    IF @tipotranNorm = 'CA'
    BEGIN
      SET @subtotal = ROUND(@totalBase, 2);
      SET @iva = 0;
      SET @totalFinal = ROUND(@totalBase, 2);
    END
    ELSE
    BEGIN
      IF @ivaIntegrado = -1
      BEGIN
        SET @totalFinal = ROUND(@totalBase, 2);
        SET @subtotal = ROUND(@totalFinal / 1.16, 2);
        SET @iva = ROUND(@totalFinal - @subtotal, 2);
      END
      ELSE
      BEGIN
        IF @RQFAC = 1
        BEGIN
          SET @subtotal = ROUND(@totalBase, 2);
          SET @iva = ROUND(@subtotal * 0.16, 2);
          SET @totalFinal = ROUND(@subtotal + @iva, 2);
        END
        ELSE
        BEGIN
          SET @totalFinal = ROUND(@totalBase, 2);
          SET @subtotal = ROUND(@totalFinal / 1.16, 2);
          SET @iva = ROUND(@totalFinal - @subtotal, 2);
        END
      END
    END

    INSERT INTO @FORMAS (FORM_RAW, FORM, IMPP, AUT)
    SELECT
      UPPER(LTRIM(RTRIM(ISNULL(J.[form], '')))),
      UPPER(LTRIM(RTRIM(ISNULL(J.[form], '')))),
      TRY_CONVERT(MONEY, J.[impp]),
      NULLIF(LTRIM(RTRIM(ISNULL(J.[aut], ''))), '')
    FROM OPENJSON(@FORMAS_JSON)
    WITH (
      [form] NVARCHAR(40) '$.form',
      [impp] DECIMAL(18, 4) '$.impp',
      [aut] NVARCHAR(255) '$.aut'
    ) J;

    IF NOT EXISTS (SELECT 1 FROM @FORMAS)
      THROW 51011, 'Debe registrar al menos una forma de pago', 1;

    UPDATE F
    SET FORM = CASE
      WHEN FORM_RAW IN ('EFECTIVO', 'CASH') THEN 'EFECTIVO'
      WHEN FORM_RAW IN ('TARJETA', 'CARD') THEN 'TARJETA'
      WHEN FORM_RAW IN ('CHEQUE') THEN 'CHEQUE'
      WHEN FORM_RAW IN ('TRANSFERENCIA', 'TRANSFER', 'SPEI') THEN 'TRANSFERENCIA'
      WHEN FORM_RAW IN ('DEPOSITO 3RO', 'DEPOSITO3RO', 'DEPOSITO TERCERO') THEN 'DEPOSITO 3RO'
      WHEN FORM_RAW IN ('CREDITO') THEN 'CREDITO'
      WHEN FORM_RAW IN ('DEUDOR') THEN 'DEUDOR'
      ELSE FORM_RAW
    END
    FROM @FORMAS F;

    IF EXISTS (
      SELECT 1
      FROM @FORMAS
      WHERE FORM NOT IN ('EFECTIVO', 'TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO', 'CREDITO', 'DEUDOR')
    )
      THROW 51012, 'Se detecto una forma de pago no permitida', 1;

    IF EXISTS (
      SELECT 1
      FROM @FORMAS
      WHERE ISNULL(IMPP, 0) <= 0
    )
      THROW 51013, 'El importe de la forma de pago debe ser mayor a 0', 1;

    IF @tipotranNorm = 'CA'
    BEGIN
      IF EXISTS (SELECT 1 FROM @FORMAS WHERE FORM <> 'EFECTIVO')
        THROW 51014, 'Para cierre tipo CA solo se permite EFECTIVO', 1;
      IF (SELECT COUNT(DISTINCT FORM) FROM @FORMAS) > 1
        THROW 51015, 'Para cierre tipo CA solo se permite una forma de pago', 1;
    END

    IF EXISTS (
      SELECT 1
      FROM @FORMAS
      WHERE FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
        AND NULLIF(LTRIM(RTRIM(ISNULL(AUT, ''))), '') IS NULL
    )
      THROW 51016, 'TARJETA/CHEQUE/TRANSFERENCIA/DEPOSITO 3RO requieren referencia', 1;

    IF EXISTS (
      SELECT 1
      FROM @FORMAS
      WHERE FORM NOT IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
        AND NULLIF(LTRIM(RTRIM(ISNULL(AUT, ''))), '') IS NOT NULL
    )
      THROW 51017, 'Solo TARJETA/CHEQUE/TRANSFERENCIA/DEPOSITO 3RO permiten referencia manual', 1;

    IF EXISTS (
      SELECT 1
      FROM @FORMAS
      WHERE FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO', 'CREDITO', 'DEUDOR')
    )
    AND TRY_CONVERT(INT, @clien) = 1
      THROW 51018, 'Para formas no efectivo el cliente no puede ser 1', 1;

    IF @RQFAC = 1 AND TRY_CONVERT(INT, @clien) = 1
      THROW 51019, 'Para cierre con factura el cliente no puede ser 1', 1;

    IF EXISTS (
      SELECT UPPER(LTRIM(RTRIM(AUT)))
      FROM @FORMAS
      WHERE FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
      GROUP BY UPPER(LTRIM(RTRIM(AUT)))
      HAVING COUNT(1) > 1
    )
      THROW 51020, 'No se puede reutilizar la misma referencia en multiples formas', 1;

    INSERT INTO @USED_REFS (IDREF)
    SELECT DISTINCT UPPER(LTRIM(RTRIM(AUT)))
    FROM @FORMAS
    WHERE FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO');

    IF EXISTS (
      SELECT 1
      FROM @FORMAS F
      WHERE F.FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.REF_DETALLE R
          WHERE UPPER(LTRIM(RTRIM(ISNULL(R.IDREF, '')))) = UPPER(LTRIM(RTRIM(ISNULL(F.AUT, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(R.IDFOL, '')))) = UPPER(@idfolNorm)
            AND UPPER(LTRIM(RTRIM(ISNULL(R.ESTATUS, '')))) = 'PROCESADO'
            AND (
              NULLIF(UPPER(LTRIM(RTRIM(ISNULL(R.TIPO, '')))), '') IS NULL
              OR UPPER(LTRIM(RTRIM(ISNULL(R.TIPO, '')))) = F.FORM
            )
            AND NULLIF(LTRIM(RTRIM(ISNULL(R.RfcEmisor, ''))), '') IS NOT NULL
            AND TRY_CONVERT(MONEY, R.IMPT) IS NOT NULL
        )
    )
      THROW 51021, 'Debe asignar referencia valida para TARJETA/CHEQUE/TRANSFERENCIA/DEPOSITO 3RO', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.REF_DETALLE R
      WHERE UPPER(LTRIM(RTRIM(ISNULL(R.IDFOL, '')))) = UPPER(@idfolNorm)
        AND UPPER(LTRIM(RTRIM(ISNULL(R.ESTATUS, '')))) IN ('CAPTURADO', 'PROCESADO')
        AND NOT EXISTS (
          SELECT 1
          FROM @USED_REFS U
          WHERE U.IDREF = UPPER(LTRIM(RTRIM(ISNULL(R.IDREF, ''))))
        )
    )
      THROW 51022, 'Existen referencias ligadas al folio sin utilizar; elimine las referencias no usadas antes de finalizar', 1;

    SELECT @sumPagos = ROUND(SUM(ISNULL(IMPP, 0)), 2)
    FROM @FORMAS;

    IF @sumPagos + @epsilon < @totalFinal
      THROW 51023, 'El total pagado es menor al total de la cotizacion', 1;

    DECLARE @hasEfectivo BIT = 0;
    IF EXISTS (SELECT 1 FROM @FORMAS WHERE FORM = 'EFECTIVO')
      SET @hasEfectivo = 1;

    IF @sumPagos > @totalFinal + @epsilon AND @hasEfectivo = 0
      THROW 51024, 'El total pagado no puede exceder el total de la cotizacion', 1;

    SELECT @creditoSolicitado = ROUND(SUM(ISNULL(IMPP, 0)), 2)
    FROM @FORMAS
    WHERE FORM = 'CREDITO';

    IF ISNULL(@creditoSolicitado, 0) > 0
    BEGIN
      IF @clien IS NULL OR @clien <= 0
        THROW 51025, 'No se puede aplicar CREDITO sin cliente valido', 1;

      SELECT TOP 1
        @limite = ROUND(COALESCE(TRY_CONVERT(MONEY, L_CRED), 0), 2)
      FROM dbo.FACT_CLIENT_SHP
      WHERE IDC = @clien;

      IF @limite IS NULL
        THROW 51026, 'Cliente no encontrado para validar credito', 1;

      IF @limite <= 0
        THROW 51027, 'Cliente sin limite de credito disponible', 1;

      SELECT
        @ejercido = ROUND(SUM(ABS(ISNULL(IMPT, 0))), 2)
      FROM dbo.DAT_CTRL_CTAS
      WHERE CTA = '101001002'
        AND CLIENT = @clien;

      SET @ejercido = ISNULL(@ejercido, 0);
      SET @disponible = ROUND(@limite - @ejercido, 2);

      IF @disponible + @epsilon < @creditoSolicitado
        THROW 51028, 'Credito insuficiente para cubrir la forma CREDITO', 1;
    END

    IF OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR') IS NOT NULL
      SET @folFormTable = 'dbo.PV_CTR_FOL_FORM_SVR';
    ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORM') IS NOT NULL
      SET @folFormTable = 'dbo.PV_CTR_FOL_FORM';
    ELSE
      THROW 51029, 'No existe tabla de formas (PV_CTR_FOL_FORM_SVR/PV_CTR_FOL_FORM)', 1;

    SET @folFormObjId = OBJECT_ID(@folFormTable);
    SELECT
      @hasIMPA = MAX(CASE WHEN UPPER(name) = 'IMPA' THEN 1 ELSE 0 END),
      @hasIMPD = MAX(CASE WHEN UPPER(name) = 'IMPD' THEN 1 ELSE 0 END),
      @hasAUT = MAX(CASE WHEN UPPER(name) = 'AUT' THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = @folFormObjId;

    SET @sql = N'DELETE FROM ' + @folFormTable + N' WHERE IDFOL = @pIDFOL';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255)',
      @pIDFOL = @idfolNorm;

    SET @cambio = CASE WHEN @sumPagos > @totalFinal THEN ROUND(@sumPagos - @totalFinal, 2) ELSE 0 END;
    SET @cambioPendiente = @cambio;

    DECLARE forma_cursor CURSOR LOCAL FAST_FORWARD FOR
      SELECT FORM, IMPP, AUT
      FROM @FORMAS
      ORDER BY ROW_ID;

    OPEN forma_cursor;
    FETCH NEXT FROM forma_cursor INTO @formaForm, @formaImpp, @formaAut;

    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @impc = 0;
      IF @cambioPendiente > 0 AND @efectivoCambioAsignado = 0 AND @formaForm = 'EFECTIVO'
      BEGIN
        SET @impc = @cambioPendiente;
        SET @cambioPendiente = 0;
        SET @efectivoCambioAsignado = 1;
      END

      SET @formaAutFinal = CASE WHEN @formaForm IN ('CREDITO', 'DEUDOR') THEN @idfolNorm ELSE @formaAut END;
      SET @execIdf = CONVERT(NVARCHAR(255), NEWID());

      SET @sql = N'
        INSERT INTO ' + @folFormTable + N' (
          IDF,
          IDFOL,
          FCN,
          FORM,
          IMPP,
          IMPC' +
          CASE WHEN @hasIMPA = 1 THEN N', IMPA' ELSE N'' END +
          CASE WHEN @hasIMPD = 1 THEN N', IMPD' ELSE N'' END +
          CASE WHEN @hasAUT = 1 THEN N', AUT' ELSE N'' END + N'
        )
        VALUES (
          @pIDF,
          @pIDFOL,
          @pNOW,
          @pFORM,
          @pIMPP,
          @pIMPC' +
          CASE WHEN @hasIMPA = 1 THEN N', 0' ELSE N'' END +
          CASE WHEN @hasIMPD = 1 THEN N', @pIMPD' ELSE N'' END +
          CASE WHEN @hasAUT = 1 THEN N', @pAUT' ELSE N'' END + N'
        );';

      EXEC sys.sp_executesql
        @sql,
        N'@pIDF NVARCHAR(255), @pIDFOL NVARCHAR(255), @pNOW DATETIME, @pFORM NVARCHAR(40), @pIMPP MONEY, @pIMPC MONEY, @pIMPD MONEY, @pAUT NVARCHAR(255)',
        @pIDF = @execIdf,
        @pIDFOL = @idfolNorm,
        @pNOW = @fechaProceso,
        @pFORM = @formaForm,
        @pIMPP = @formaImpp,
        @pIMPC = @impc,
        @pIMPD = @totalFinal,
        @pAUT = @formaAutFinal;

      IF @formaForm IN ('CREDITO', 'DEUDOR')
      BEGIN
        EXEC @lockResult = sp_getapplock
          @Resource = 'PV_CIERRE_NDOC_602',
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = 15000;

        IF @lockResult < 0
          THROW 51030, 'No se pudo generar consecutivo NDOC para cierre', 1;

        SET @maxCtrl = 0;
        IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'NDOC') IS NOT NULL
        BEGIN
          SET @sql = N'
            SELECT @pMAX = ISNULL(MAX(TRY_CONVERT(BIGINT, SUBSTRING(LTRIM(RTRIM(NDOC)), 2, 50))), 0)
            FROM dbo.DAT_CTRL_CTAS WITH (UPDLOCK, HOLDLOCK)
            WHERE LTRIM(RTRIM(ISNULL(NDOC, ''''))) LIKE ''N%'';';

          EXEC sys.sp_executesql
            @sql,
            N'@pMAX BIGINT OUTPUT',
            @pMAX = @maxCtrl OUTPUT;
        END

        SET @maxDoc = 0;
        IF OBJECT_ID('dbo.DAT_CTR_DOC') IS NOT NULL AND COL_LENGTH('dbo.DAT_CTR_DOC', 'NDOC') IS NOT NULL
        BEGIN
          SET @sql = N'
            SELECT @pMAX = ISNULL(MAX(TRY_CONVERT(BIGINT, SUBSTRING(LTRIM(RTRIM(NDOC)), 2, 50))), 0)
            FROM dbo.DAT_CTR_DOC WITH (UPDLOCK, HOLDLOCK)
            WHERE LTRIM(RTRIM(ISNULL(NDOC, ''''))) LIKE ''N%'';';

          EXEC sys.sp_executesql
            @sql,
            N'@pMAX BIGINT OUTPUT',
            @pMAX = @maxDoc OUTPUT;
        END

        SET @nextNdoc = (SELECT MAX(V) FROM (VALUES (@maxCtrl), (@maxDoc), (6000000)) AS T(V)) + 1;
        SET @ndoc = 'N' + CONVERT(VARCHAR(50), @nextNdoc);
        SET @cargoRtxt = 'Cargo ' + LOWER(@formaForm) + ' ticket ' + @idfolNorm;

        IF OBJECT_ID('dbo.DAT_CTR_DOC') IS NOT NULL
        BEGIN
          SET @docObjId = OBJECT_ID('dbo.DAT_CTR_DOC');
          SELECT
            @docHasNDOC = MAX(CASE WHEN UPPER(name) = 'NDOC' THEN 1 ELSE 0 END),
            @docHasIDFOL = MAX(CASE WHEN UPPER(name) = 'IDFOL' THEN 1 ELSE 0 END),
            @docHasCLIENT = MAX(CASE WHEN UPPER(name) = 'CLIENT' THEN 1 ELSE 0 END),
            @docHasCTA = MAX(CASE WHEN UPPER(name) = 'CTA' THEN 1 ELSE 0 END),
            @docHasCMOV = MAX(CASE WHEN UPPER(name) = 'CMOV' THEN 1 ELSE 0 END),
            @docHasCLSD = MAX(CASE WHEN UPPER(name) = 'CLSD' THEN 1 ELSE 0 END),
            @docHasIMPT = MAX(CASE WHEN UPPER(name) = 'IMPT' THEN 1 ELSE 0 END),
            @docHasSUC = MAX(CASE WHEN UPPER(name) = 'SUC' THEN 1 ELSE 0 END),
            @docHasOPV = MAX(CASE WHEN UPPER(name) = 'OPV' THEN 1 ELSE 0 END),
            @docHasIDOPV = MAX(CASE WHEN UPPER(name) = 'IDOPV' THEN 1 ELSE 0 END),
            @docHasTIPO = MAX(CASE WHEN UPPER(name) = 'TIPO' THEN 1 ELSE 0 END),
            @docHasRTXT = MAX(CASE WHEN UPPER(name) = 'RTXT' THEN 1 ELSE 0 END),
            @docHasFCND = MAX(CASE WHEN UPPER(name) = 'FCND' THEN 1 ELSE 0 END),
            @docHasFCN = MAX(CASE WHEN UPPER(name) = 'FCN' THEN 1 ELSE 0 END),
            @docHasFCNR = MAX(CASE WHEN UPPER(name) = 'FCNR' THEN 1 ELSE 0 END),
            @docHasFECHA = MAX(CASE WHEN UPPER(name) = 'FECHA' THEN 1 ELSE 0 END)
          FROM sys.columns
          WHERE object_id = @docObjId;

          SET @docClassCol = CASE
            WHEN @docHasCMOV = 1 THEN 'CMOV'
            WHEN @docHasCLSD = 1 THEN 'CLSD'
            ELSE NULL
          END;

          IF @docHasNDOC = 1
          BEGIN
            SET @sql = N'
              INSERT INTO dbo.DAT_CTR_DOC (
                NDOC' +
                CASE WHEN @docHasIDFOL = 1 THEN N', IDFOL' ELSE N'' END +
                CASE WHEN @docHasCLIENT = 1 THEN N', CLIENT' ELSE N'' END +
                CASE WHEN @docHasCTA = 1 THEN N', CTA' ELSE N'' END +
                CASE WHEN @docClassCol IS NOT NULL THEN N', ' + @docClassCol ELSE N'' END +
                CASE WHEN @docHasIMPT = 1 THEN N', IMPT' ELSE N'' END +
                CASE WHEN @docHasSUC = 1 THEN N', SUC' ELSE N'' END +
                CASE WHEN @docHasOPV = 1 THEN N', OPV' ELSE N'' END +
                CASE WHEN @docHasIDOPV = 1 THEN N', IDOPV' ELSE N'' END +
                CASE WHEN @docHasTIPO = 1 THEN N', TIPO' ELSE N'' END +
                CASE WHEN @docHasRTXT = 1 THEN N', RTXT' ELSE N'' END +
                CASE WHEN @docHasFCND = 1 THEN N', FCND' ELSE N'' END +
                CASE WHEN @docHasFCN = 1 THEN N', FCN' ELSE N'' END +
                CASE WHEN @docHasFCNR = 1 THEN N', FCNR' ELSE N'' END +
                CASE WHEN @docHasFECHA = 1 THEN N', FECHA' ELSE N'' END + N'
              )
              VALUES (
                @pNDOC' +
                CASE WHEN @docHasIDFOL = 1 THEN N', @pIDFOL' ELSE N'' END +
                CASE WHEN @docHasCLIENT = 1 THEN N', @pCLIENT' ELSE N'' END +
                CASE WHEN @docHasCTA = 1 THEN N', @pCTA' ELSE N'' END +
                CASE WHEN @docClassCol IS NOT NULL THEN N', @pCLSD' ELSE N'' END +
                CASE WHEN @docHasIMPT = 1 THEN N', @pIMPT_POS' ELSE N'' END +
                CASE WHEN @docHasSUC = 1 THEN N', @pSUC' ELSE N'' END +
                CASE WHEN @docHasOPV = 1 THEN N', @pOPV' ELSE N'' END +
                CASE WHEN @docHasIDOPV = 1 THEN N', @pOPV' ELSE N'' END +
                CASE WHEN @docHasTIPO = 1 THEN N', @pTIPO' ELSE N'' END +
                CASE WHEN @docHasRTXT = 1 THEN N', @pRTXT' ELSE N'' END +
                CASE WHEN @docHasFCND = 1 THEN N', @pNOW' ELSE N'' END +
                CASE WHEN @docHasFCN = 1 THEN N', @pNOW' ELSE N'' END +
                CASE WHEN @docHasFCNR = 1 THEN N', @pNOW' ELSE N'' END +
                CASE WHEN @docHasFECHA = 1 THEN N', @pNOW' ELSE N'' END + N'
              );';

            EXEC sys.sp_executesql
              @sql,
              N'@pNDOC NVARCHAR(255), @pIDFOL NVARCHAR(255), @pCLIENT FLOAT, @pCTA NVARCHAR(255), @pCLSD INT, @pIMPT_POS MONEY, @pSUC NVARCHAR(255), @pOPV NVARCHAR(255), @pTIPO NVARCHAR(40), @pRTXT NVARCHAR(255), @pNOW DATETIME',
              @pNDOC = @ndoc,
              @pIDFOL = @idfolNorm,
              @pCLIENT = @clien,
              @pCTA = '101001002',
              @pCLSD = 602,
              @pIMPT_POS = @formaImpp,
              @pSUC = @sucDb,
              @pOPV = @opvNorm,
              @pTIPO = @formaForm,
              @pRTXT = @cargoRtxt,
              @pNOW = @fechaProceso;
          END
        END

        SET @ctrlObjId = OBJECT_ID('dbo.DAT_CTRL_CTAS');
        IF @ctrlObjId IS NULL
          THROW 51031, 'No existe DAT_CTRL_CTAS', 1;

        SELECT
          @ctrlHasCTA = MAX(CASE WHEN UPPER(name) = 'CTA' THEN 1 ELSE 0 END),
          @ctrlHasCLIENT = MAX(CASE WHEN UPPER(name) = 'CLIENT' THEN 1 ELSE 0 END),
          @ctrlHasCMOV = MAX(CASE WHEN UPPER(name) = 'CMOV' THEN 1 ELSE 0 END),
          @ctrlHasCLSD = MAX(CASE WHEN UPPER(name) = 'CLSD' THEN 1 ELSE 0 END),
          @ctrlHasIMPT = MAX(CASE WHEN UPPER(name) = 'IMPT' THEN 1 ELSE 0 END),
          @ctrlHasNDOC = MAX(CASE WHEN UPPER(name) = 'NDOC' THEN 1 ELSE 0 END),
          @ctrlHasIDFOL = MAX(CASE WHEN UPPER(name) = 'IDFOL' THEN 1 ELSE 0 END),
          @ctrlHasSUC = MAX(CASE WHEN UPPER(name) = 'SUC' THEN 1 ELSE 0 END),
          @ctrlHasOPV = MAX(CASE WHEN UPPER(name) = 'OPV' THEN 1 ELSE 0 END),
          @ctrlHasIDOPV = MAX(CASE WHEN UPPER(name) = 'IDOPV' THEN 1 ELSE 0 END),
          @ctrlHasTIPO = MAX(CASE WHEN UPPER(name) = 'TIPO' THEN 1 ELSE 0 END),
          @ctrlHasRTXT = MAX(CASE WHEN UPPER(name) = 'RTXT' THEN 1 ELSE 0 END),
          @ctrlHasFCND = MAX(CASE WHEN UPPER(name) = 'FCND' THEN 1 ELSE 0 END),
          @ctrlHasFCN = MAX(CASE WHEN UPPER(name) = 'FCN' THEN 1 ELSE 0 END),
          @ctrlHasFCNR = MAX(CASE WHEN UPPER(name) = 'FCNR' THEN 1 ELSE 0 END),
          @ctrlHasFECHA = MAX(CASE WHEN UPPER(name) = 'FECHA' THEN 1 ELSE 0 END)
        FROM sys.columns
        WHERE object_id = @ctrlObjId;

        SET @ctrlClassCol = CASE
          WHEN @ctrlHasCMOV = 1 THEN 'CMOV'
          WHEN @ctrlHasCLSD = 1 THEN 'CLSD'
          ELSE NULL
        END;
        SET @execImptNeg = -@formaImpp;

        IF @ctrlHasCTA = 0 OR @ctrlHasCLIENT = 0 OR @ctrlHasIMPT = 0 OR @ctrlHasNDOC = 0 OR @ctrlHasIDFOL = 0 OR @ctrlClassCol IS NULL
          THROW 51032, 'DAT_CTRL_CTAS no contiene columnas requeridas para cargo', 1;

        SET @sql = N'
          INSERT INTO dbo.DAT_CTRL_CTAS (
            CTA,
            CLIENT,
            ' + @ctrlClassCol + N',
            IMPT,
            NDOC,
            IDFOL' +
            CASE WHEN @ctrlHasSUC = 1 THEN N', SUC' ELSE N'' END +
            CASE WHEN @ctrlHasOPV = 1 THEN N', OPV' ELSE N'' END +
            CASE WHEN @ctrlHasIDOPV = 1 THEN N', IDOPV' ELSE N'' END +
            CASE WHEN @ctrlHasTIPO = 1 THEN N', TIPO' ELSE N'' END +
            CASE WHEN @ctrlHasRTXT = 1 THEN N', RTXT' ELSE N'' END +
            CASE WHEN @ctrlHasFCND = 1 THEN N', FCND' ELSE N'' END +
            CASE WHEN @ctrlHasFCN = 1 THEN N', FCN' ELSE N'' END +
            CASE WHEN @ctrlHasFCNR = 1 THEN N', FCNR' ELSE N'' END +
            CASE WHEN @ctrlHasFECHA = 1 THEN N', FECHA' ELSE N'' END + N'
          )
          VALUES (
            @pCTA,
            @pCLIENT,
            @pCLSD,
            @pIMPT_NEG,
            @pNDOC,
            @pIDFOL' +
            CASE WHEN @ctrlHasSUC = 1 THEN N', @pSUC' ELSE N'' END +
            CASE WHEN @ctrlHasOPV = 1 THEN N', @pOPV' ELSE N'' END +
            CASE WHEN @ctrlHasIDOPV = 1 THEN N', @pOPV' ELSE N'' END +
            CASE WHEN @ctrlHasTIPO = 1 THEN N', @pTIPO' ELSE N'' END +
            CASE WHEN @ctrlHasRTXT = 1 THEN N', @pRTXT' ELSE N'' END +
            CASE WHEN @ctrlHasFCND = 1 THEN N', @pNOW' ELSE N'' END +
            CASE WHEN @ctrlHasFCN = 1 THEN N', @pNOW' ELSE N'' END +
            CASE WHEN @ctrlHasFCNR = 1 THEN N', @pNOW' ELSE N'' END +
            CASE WHEN @ctrlHasFECHA = 1 THEN N', @pNOW' ELSE N'' END + N'
          );';

        EXEC sys.sp_executesql
          @sql,
          N'@pCTA NVARCHAR(255), @pCLIENT FLOAT, @pCLSD INT, @pIMPT_NEG MONEY, @pNDOC NVARCHAR(255), @pIDFOL NVARCHAR(255), @pSUC NVARCHAR(255), @pOPV NVARCHAR(255), @pTIPO NVARCHAR(40), @pRTXT NVARCHAR(255), @pNOW DATETIME',
          @pCTA = '101001002',
          @pCLIENT = @clien,
          @pCLSD = 602,
          @pIMPT_NEG = @execImptNeg,
          @pNDOC = @ndoc,
          @pIDFOL = @idfolNorm,
          @pSUC = @sucDb,
          @pOPV = @opvNorm,
          @pTIPO = @formaForm,
          @pRTXT = @cargoRtxt,
          @pNOW = @fechaProceso;
      END

      FETCH NEXT FROM forma_cursor INTO @formaForm, @formaImpp, @formaAut;
    END

    CLOSE forma_cursor;
    DEALLOCATE forma_cursor;

    UPDATE dbo.PV_CTR_ORDS
    SET ESTATUS = 2
    WHERE IDFOL = @idfolNorm;

    SET @headerObjId = OBJECT_ID('dbo.PV_CTR_FOL_ASVR');
    SELECT
      @headHasREQF = MAX(CASE WHEN UPPER(name) = 'REQF' THEN 1 ELSE 0 END),
      @headHasRQFAC = MAX(CASE WHEN UPPER(name) = 'RQFAC' THEN 1 ELSE 0 END),
      @headHasAUT = MAX(CASE WHEN UPPER(name) = 'AUT' THEN 1 ELSE 0 END),
      @headHasFCNM = MAX(CASE WHEN UPPER(name) = 'FCNM' THEN 1 ELSE 0 END),
      @headHasOPVM = MAX(CASE WHEN UPPER(name) = 'OPVM' THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = @headerObjId;

    SET @sql = N'
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        ESTA = ''PAGADO'',
        IMPT = @pTOTAL' +
        CASE WHEN @headHasREQF = 1 THEN N', REQF = @pRQFAC' ELSE N'' END +
        CASE WHEN @headHasRQFAC = 1 THEN N', RQFAC = @pRQFAC' ELSE N'' END +
        CASE WHEN @headHasAUT = 1 THEN N', AUT = @pTIPOTRAN' ELSE N'' END +
        CASE WHEN @headHasFCNM = 1 THEN N', FCNM = @pNOW' ELSE N'' END +
        CASE WHEN @headHasOPVM = 1 THEN N', OPVM = @pOPV' ELSE N'' END + N'
      WHERE IDFOL = @pIDFOL';
    SET @execRqfac = CASE WHEN @tipotranNorm = 'CA' THEN 0 ELSE CASE WHEN @RQFAC = 1 THEN 1 ELSE 0 END END;

    EXEC sys.sp_executesql
      @sql,
      N'@pTOTAL MONEY, @pRQFAC INT, @pTIPOTRAN NVARCHAR(10), @pOPV NVARCHAR(255), @pIDFOL NVARCHAR(255), @pNOW DATETIME',
      @pTOTAL = @totalFinal,
      @pRQFAC = @execRqfac,
      @pTIPOTRAN = @tipotranNorm,
      @pOPV = @opvNorm,
      @pIDFOL = @idfolNorm,
      @pNOW = @fechaProceso;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS idfol,
      @tipotranNorm AS tipotran,
      CAST(CASE WHEN @tipotranNorm = 'CA' THEN 0 ELSE CASE WHEN @RQFAC = 1 THEN 1 ELSE 0 END END AS BIT) AS rqfac,
      ROUND(@subtotal, 2) AS subtotal,
      ROUND(@iva, 2) AS iva,
      ROUND(@totalFinal, 2) AS total,
      ROUND(@totalBase, 2) AS totalBase,
      @ivaIntegrado AS ivaIntegrado,
      ROUND(@sumPagos, 2) AS sumPagos,
      ROUND(@cambio, 2) AS cambio;
  END TRY
  BEGIN CATCH
    IF CURSOR_STATUS('local', 'forma_cursor') >= -1
    BEGIN
      CLOSE forma_cursor;
      DEALLOCATE forma_cursor;
    END

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    THROW;
  END CATCH
END;
GO
