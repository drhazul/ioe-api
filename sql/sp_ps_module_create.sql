SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*
  Pago de Servicios - catalogos y procedimientos almacenados
  - Crea catalogos base si no existen
  - Crea/actualiza SPs del flujo panel -> detalle -> pago -> terminar
*/

IF OBJECT_ID('dbo.PV_DAT_PS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PV_DAT_PS (
    IDS CHAR(2) NOT NULL PRIMARY KEY,
    DESSV VARCHAR(120) NOT NULL,
    TIPO VARCHAR(10) NOT NULL
  );
END;
GO

MERGE dbo.PV_DAT_PS AS target
USING (
  SELECT 'AD' AS IDS, 'ABONO DIFERENCIA TALLER' AS DESSV, 'ABONO' AS TIPO UNION ALL
  SELECT 'AP', 'ABONO APARTADOS', 'ABONO' UNION ALL
  SELECT 'CR', 'ABONO A CREDITO CLIENTE', 'ABONO' UNION ALL
  SELECT 'DC', 'DISPOSICION REINTEGRACION CCH', 'CARGO' UNION ALL
  SELECT 'DG', 'DISPOSICION POR GASTO', 'CARGO'
) AS src
ON target.IDS = src.IDS
WHEN MATCHED THEN
  UPDATE SET target.DESSV = src.DESSV, target.TIPO = src.TIPO
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDS, DESSV, TIPO)
  VALUES (src.IDS, src.DESSV, src.TIPO);
GO

IF OBJECT_ID('dbo.DAT_REF_GTO', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DAT_REF_GTO (
    IDR INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    REFGASTO VARCHAR(120) NOT NULL
  );
END;
GO

INSERT INTO dbo.DAT_REF_GTO (REFGASTO)
SELECT src.REFGASTO
FROM (
  SELECT 'CAJA CHICA' AS REFGASTO UNION ALL
  SELECT 'ENERGIA ELECTRICA' UNION ALL
  SELECT 'AGUA' UNION ALL
  SELECT 'TELEFONIA' UNION ALL
  SELECT 'INTERNET' UNION ALL
  SELECT 'MENSAJERIA' UNION ALL
  SELECT 'MANTENIMIENTO' UNION ALL
  SELECT 'PAPELERIA'
) AS src
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.DAT_REF_GTO t
  WHERE UPPER(LTRIM(RTRIM(t.REFGASTO))) = UPPER(LTRIM(RTRIM(src.REFGASTO)))
);
GO

IF OBJECT_ID('dbo.PV_TIPO_ESTA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PV_TIPO_ESTA (
    TIPO VARCHAR(10) NOT NULL PRIMARY KEY,
    [DESC] VARCHAR(150) NOT NULL,
    MODULO VARCHAR(20) NULL,
    COM VARCHAR(255) NULL,
    RELACION VARCHAR(10) NULL,
    NDOC VARCHAR(20) NULL
  );
END;
GO

MERGE dbo.PV_TIPO_ESTA AS target
USING (
  SELECT 'AD' AS TIPO, 'ABONO DIFERENCIA TALLER' AS [DESC], NULL AS MODULO, 'PAGO DE SERVICIOS' AS COM, 'PAD' AS RELACION, NULL AS NDOC UNION ALL
  SELECT 'AP', 'ABONO APARTADOS', NULL, 'PAGO DE SERVICIOS', 'PAP', NULL UNION ALL
  SELECT 'APC', 'APARTADO CANCELADO', NULL, 'CANCELACION DE TRANSACCION APARTADOS', NULL, NULL UNION ALL
  SELECT 'APDC', 'APARTADO DEVUELTO CANCELADO', NULL, 'CANCELACION DE TRANSACCION APARTADOS', NULL, NULL UNION ALL
  SELECT 'APDF', 'APARTADO DEVUELTO', 'VTA', 'DEVOLUCION DE APARTADO', NULL, NULL UNION ALL
  SELECT 'APDP', 'APARTADO DEVUELTO PENDIENTE', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'APF', 'TRANSACCION APARTADO FINALIZADO', NULL, 'APARTADO DE MERCANCIA', NULL, NULL UNION ALL
  SELECT 'APP', 'NUEVO APARTADO PENDIENTE', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'CA', 'COTIZACION ABIERTA', 'VTA', 'COTIZACION QUE RECIBE FORMA DE PAGO', NULL, '70000000' UNION ALL
  SELECT 'CAN', 'COTIZACION ANULADA', NULL, 'COTIZACION ANULADA SIN FORMA DE PAGO INTEGRADA', NULL, NULL UNION ALL
  SELECT 'CD', 'COTIZACION DEVUELTA', 'VTA', 'COTIZACION ANULADA CON FORMA DE PAGO INTEGRADA', NULL, NULL UNION ALL
  SELECT 'CF', 'COTIZACION FINALIZADA', NULL, 'COTIZACION TRANSITORIA PARA VTA FINALIZADA', NULL, NULL UNION ALL
  SELECT 'CP', 'COTIZACION PENDIENTE', NULL, 'COTIZACION QUE NO RECIBE FORMA DE PAGO', NULL, '70000000' UNION ALL
  SELECT 'CPF', 'COTIZACION PENDIENTE FINALIZADA', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'CR', 'ABONO ACREDITO', NULL, 'PAGO DE SERVICIOS', 'PCR', NULL UNION ALL
  SELECT 'DC', 'DISPOSICION REINTEGRACION CCH', NULL, 'PAGO DE SERVICIOS', 'PDC', NULL UNION ALL
  SELECT 'DCAN', 'DEVOLUCION CANCELADA', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'DF', 'DEVOLUCION FINALIZADA', 'VTA', 'SOPORTE DE DEVOLUCION DE VENTA', NULL, NULL UNION ALL
  SELECT 'DG', 'DISPOSICION POR GASTO', NULL, 'PAGO DE SERVICIOS', 'PDG', NULL UNION ALL
  SELECT 'NAP', 'NUEVO APARTADO', 'VTA', 'APARTADO DE MERCANCIA PROCESANDO', NULL, NULL UNION ALL
  SELECT 'PAD', 'ABONO DIFERENCIA TALLER PENDIENTE', NULL, 'PAGO DE SERVICIOS TRANSACION PENDIENTE', NULL, NULL UNION ALL
  SELECT 'PAP', 'ABONO APARTADOS PENDIENTE', NULL, 'PAGO DE SERVICIOS TRANSACION PENDIENTE', NULL, NULL UNION ALL
  SELECT 'PCR', 'ABONO ACREDITO PENDIENTE', NULL, 'PAGO DE SERVICIOS TRANSACION PENDIENTE', NULL, NULL UNION ALL
  SELECT 'PD', 'TRANSACCION PENDIENTE DE DEVOLUCION', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'PDC', 'DISPOSICION POR CAJA CHICA', NULL, 'PAGO DE SERVICIOS TRANSACION PENDIENTE', NULL, NULL UNION ALL
  SELECT 'PDCT', 'ANULACION COTIZACION PENDIENTE', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'PDG', 'DISPOSICION POR GASTO', NULL, 'PAGO DE SERVICIOS TRANSACION PENDIENTE', NULL, NULL UNION ALL
  SELECT 'PS', 'COTIZACION DE PAGO DE SERVICIOS', NULL, 'TRANSACION TEMPORAL PARA PAGO DE SERVICIOS', NULL, NULL UNION ALL
  SELECT 'PV', 'TRANSACCION PENDIENTE DE VENTA', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'SC', 'TRANSACCION PAGO DE SERVICIO CANCELADO', NULL, 'ESTATUS DE LA TRANSACCION', NULL, NULL UNION ALL
  SELECT 'VD', 'VENTA DEVUELTA', 'VTA', 'DEVOLUCION DE TICKET DE VENTA', NULL, NULL UNION ALL
  SELECT 'VF', 'VENTA FINALIZADA', 'VTA', 'VENTA CON IMPUESTOS', NULL, NULL
) AS src
ON target.TIPO = src.TIPO
WHEN MATCHED THEN
  UPDATE SET
    target.[DESC] = src.[DESC],
    target.MODULO = src.MODULO,
    target.COM = src.COM,
    target.RELACION = src.RELACION,
    target.NDOC = src.NDOC
WHEN NOT MATCHED BY TARGET THEN
  INSERT (TIPO, [DESC], MODULO, COM, RELACION, NDOC)
  VALUES (src.TIPO, src.[DESC], src.MODULO, src.COM, src.RELACION, src.NDOC);
GO


CREATE OR ALTER PROCEDURE dbo.sp_ps_folios_list
  @SUC VARCHAR(4) = NULL,
  @ESTA VARCHAR(20) = 'PENDIENTE',
  @SEARCH NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(4) = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(@SUC, '')))), '');
  DECLARE @estaNorm VARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@ESTA, 'PENDIENTE'))));
  DECLARE @searchNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@SEARCH, '')));
  DECLARE @searchLike NVARCHAR(260) = '%' + @searchNorm + '%';

  IF @estaNorm = '' SET @estaNorm = 'PENDIENTE';

  SELECT
    a.*,
    c.RazonSocialReceptor
  FROM dbo.PV_CTR_FOL_ASVR a
  LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
  WHERE (@sucNorm IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm)
    AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) IN (
      'PS', 'PAD', 'PAP', 'PCR', 'PDC', 'PDG',
      'AD', 'AP', 'CR', 'DC', 'DG'
    )
    AND (
      @estaNorm IN ('ALL', 'TODOS', '*')
      OR (@estaNorm = 'PENDIENTE' AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) = 'PENDIENTE')
      OR (@estaNorm = 'PAGADO' AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) = 'PAGADO')
      OR (@estaNorm NOT IN ('ALL', 'TODOS', '*', 'PENDIENTE', 'PAGADO') AND UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) = @estaNorm)
    )
    AND (
      @searchNorm = ''
      OR a.IDFOL LIKE @searchLike
      OR ISNULL(c.RazonSocialReceptor, '') LIKE @searchLike
      OR CAST(ISNULL(a.CLIEN, 0) AS NVARCHAR(50)) LIKE @searchLike
    )
  ORDER BY a.FCN DESC, a.TRA DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_folio_create
  @SUC VARCHAR(4),
  @TER NVARCHAR(50) = NULL,
  @OPV NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm VARCHAR(4) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @terNorm NVARCHAR(50) = NULLIF(LTRIM(RTRIM(ISNULL(@TER, ''))), '');
  DECLARE @opvNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@OPV, '')));
  DECLARE @idfol NVARCHAR(255);
  DECLARE @nextTra INT;
  DECLARE @fechaProceso DATETIME = GETDATE();
  DECLARE @fechaProcesoDate DATE = CONVERT(DATE, GETDATE());

  IF @sucNorm = ''
    THROW 57001, 'SUC es requerido', 1;

  IF @opvNorm = ''
    THROW 57002, 'OPV es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    EXEC dbo.sp_pv_next_visible_folio
      @SUC = @sucNorm,
      @TIPO_FOLIO = 'CP',
      @FECHA = @fechaProcesoDate,
      @IDFOL_OUT = @idfol OUTPUT,
      @CONSEC_OUT = @nextTra OUTPUT;

    IF ISNULL(LTRIM(RTRIM(@idfol)), '') = ''
      THROW 57003, 'No se pudo generar folio CP para Pago de Servicios', 1;

    INSERT INTO dbo.PV_CTR_FOL_ASVR (
      IDFOL,
      CLIEN,
      FCN,
      SUC,
      TER,
      TRA,
      OPV,
      ESTA,
      IMPT,
      FPGO,
      IMPP,
      AUT,
      REQF,
      FCNM,
      OPVM,
      IDFOLINICIAL,
      ORIGEN_AUT
    )
    VALUES (
      @idfol,
      1,
      @fechaProceso,
      @sucNorm,
      @terNorm,
      CAST(@nextTra AS NVARCHAR(20)),
      @opvNorm,
      'PENDIENTE',
      0,
      NULL,
      0,
      'PS',
      0,
      @fechaProceso,
      @opvNorm,
      @idfol,
      'CA'
    );

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfol AS IDFOL,
      @sucNorm AS SUC,
      CAST(@nextTra AS NVARCHAR(20)) AS TRA,
      @opvNorm AS OPV,
      'PENDIENTE' AS ESTA,
      'CA' AS ORIGEN_AUT;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_panel_get
  @IDFOL NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));

  IF @idfolNorm = ''
    THROW 57010, 'IDFOL es requerido', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL = @idfolNorm)
    THROW 57011, 'El folio PS no existe', 1;

  SELECT
    ISNULL((
      SELECT TOP 1
        a.IDFOL,
        a.CLIEN,
        a.SUC,
        a.TER,
        a.TRA,
        a.OPV,
        a.OPVM,
        a.ESTA,
        a.AUT,
        a.FPGO,
        a.IMPT,
        a.IMPP,
        a.REQF,
        a.FCN,
        a.FCNM,
        c.RazonSocialReceptor
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON c.IDC = a.CLIEN
      WHERE a.IDFOL = @idfolNorm
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ), '{}') AS HEADER_JSON,
    ISNULL((
      SELECT
        t.ID,
        t.IDFOL,
        t.ART,
        t.UPC,
        t.DES,
        t.ORD,
        TRY_CONVERT(DECIMAL(18, 4), t.CTD) AS CTD,
        TRY_CONVERT(DECIMAL(18, 4), t.PVTA) AS PVTA,
        TRY_CONVERT(DECIMAL(18, 4), t.PVTAT) AS PVTAT,
        CASE
          WHEN TRY_CONVERT(DECIMAL(18, 4), t.PVTA) IS NULL THEN NULL
          ELSE ROUND(
            ISNULL(TRY_CONVERT(DECIMAL(18, 4), t.PVTA), 0)
            * ISNULL(TRY_CONVERT(DECIMAL(18, 4), t.CTD), 0),
            4
          )
        END AS TOTAL
      FROM dbo.PV_TICKET_LOG t
      WHERE t.IDFOL = @idfolNorm
      ORDER BY t.ART ASC
      FOR JSON PATH
    ), '[]') AS TICKET_JSON,
    ISNULL((
      SELECT IDS, DESSV, TIPO
      FROM dbo.PV_DAT_PS
      ORDER BY IDS
      FOR JSON PATH
    ), '[]') AS SERVICIOS_JSON,
    ISNULL((
      SELECT IDR, REFGASTO
      FROM dbo.DAT_REF_GTO
      ORDER BY REFGASTO
      FOR JSON PATH
    ), '[]') AS GASTOS_JSON;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_folio_set_cliente
  @IDFOL NVARCHAR(255),
  @CLIEN FLOAT,
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @clienNorm FLOAT = TRY_CONVERT(FLOAT, @CLIEN);
  DECLARE @userNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@USER, ''))), '');

  IF @idfolNorm = ''
    THROW 57012, 'IDFOL es requerido', 1;

  IF @clienNorm IS NULL OR @clienNorm <= 0
    THROW 57013, 'CLIEN debe ser un número positivo', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
      WHERE IDFOL = @idfolNorm
    )
      THROW 57014, 'El folio PS no existe', 1;

    IF NOT EXISTS (
      SELECT 1
      FROM dbo.FACT_CLIENT_SHP
      WHERE TRY_CONVERT(FLOAT, IDC) = @clienNorm
    )
      THROW 57015, 'El cliente no existe', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm
    )
      THROW 57016, 'No se puede cambiar cliente cuando el ticket ya tiene líneas', 1;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET
      CLIEN = @clienNorm,
      FCNM = GETDATE(),
      OPVM = COALESCE(@userNorm, OPVM)
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT TOP 1
      a.IDFOL,
      TRY_CONVERT(FLOAT, a.CLIEN) AS CLIEN,
      c.RazonSocialReceptor
    FROM dbo.PV_CTR_FOL_ASVR a
    LEFT JOIN dbo.FACT_CLIENT_SHP c
      ON TRY_CONVERT(FLOAT, c.IDC) = TRY_CONVERT(FLOAT, a.CLIEN)
    WHERE a.IDFOL = @idfolNorm;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_ticket_add_service
  @IDFOL NVARCHAR(255),
  @IDS CHAR(2),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @idsNorm CHAR(2) = UPPER(LTRIM(RTRIM(ISNULL(@IDS, ''))));
  DECLARE @descSvr VARCHAR(120);
  DECLARE @existingCount INT = 0;
  DECLARE @firstUpc CHAR(2);
  DECLARE @autRelacion NVARCHAR(40);
  DECLARE @nextSeq INT;
  DECLARE @art NVARCHAR(255);
  DECLARE @ticketObjId INT = OBJECT_ID('dbo.PV_TICKET_LOG');
  DECLARE @hasId BIT = 0;
  DECLARE @idIsIdentity BIT = 0;
  DECLARE @hasPvtat BIT = 0;
  DECLARE @hasUpdatedAt BIT = 0;
  DECLARE @sql NVARCHAR(MAX);
  DECLARE @newTicketId NVARCHAR(36);
  DECLARE @folioFound BIT = 0;
  DECLARE @folioCliente FLOAT = NULL;

  IF @idfolNorm = ''
    THROW 57020, 'IDFOL es requerido', 1;

  IF @idsNorm = ''
    THROW 57021, 'IDS es requerido', 1;

  IF @ticketObjId IS NULL
    THROW 57022, 'No existe tabla PV_TICKET_LOG', 1;

  SELECT TOP 1
    @folioFound = 1,
    @folioCliente = TRY_CONVERT(FLOAT, CLIEN)
  FROM dbo.PV_CTR_FOL_ASVR
  WHERE IDFOL = @idfolNorm;

  IF @folioFound = 0
    THROW 57023, 'El folio PS no existe', 1;

  IF @idsNorm IN ('AD', 'AP', 'CR') AND ISNULL(@folioCliente, 0) <= 1
    THROW 57029, 'Seleccione Cliente', 1;

  SELECT TOP 1 @descSvr = DESSV
  FROM dbo.PV_DAT_PS
  WHERE IDS = @idsNorm;

  IF @descSvr IS NULL
    THROW 57024, 'El servicio IDS no existe en PV_DAT_PS', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT @existingCount = COUNT(1)
    FROM dbo.PV_TICKET_LOG WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm;

    IF @existingCount > 0
    BEGIN
      SELECT TOP 1 @firstUpc = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm
      ORDER BY ART;

      IF @firstUpc IS NOT NULL AND @firstUpc <> @idsNorm
        THROW 57025, 'No se permite mezclar tipos de servicio en el mismo folio', 1;
    END
    ELSE
    BEGIN
      IF OBJECT_ID('dbo.PV_TIPO_ESTA', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 1 @autRelacion = LTRIM(RTRIM(ISNULL(RELACION, '')))
        FROM dbo.PV_TIPO_ESTA
        WHERE UPPER(LTRIM(RTRIM(ISNULL(TIPO, '')))) = @idsNorm;
      END

      IF @autRelacion IS NULL OR @autRelacion = ''
        SET @autRelacion = @idsNorm;

      UPDATE dbo.PV_CTR_FOL_ASVR
      SET AUT = @autRelacion,
          FCNM = GETDATE()
      WHERE IDFOL = @idfolNorm;
    END

    IF @idsNorm IN ('DC', 'DG')
    BEGIN
      IF @startedTran = 1 AND @@TRANCOUNT > 0
        COMMIT TRANSACTION;

      SELECT
        CAST(1 AS BIT) AS requiresAuthorizationForm,
        @idfolNorm AS IDFOL,
        @idsNorm AS IDS,
        CAST(NULL AS NVARCHAR(255)) AS ART,
        'Servicio requiere autorizacion previa' AS message;
      RETURN;
    END

    SELECT @nextSeq = ISNULL(COUNT(1), 0) + 1
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    SET @art = CONCAT(CAST(@nextSeq AS NVARCHAR(20)), @idsNorm);

    SELECT
      @hasId = MAX(CASE WHEN UPPER(name) = 'ID' THEN 1 ELSE 0 END),
      @hasPvtat = MAX(CASE WHEN UPPER(name) = 'PVTAT' THEN 1 ELSE 0 END),
      @hasUpdatedAt = MAX(CASE WHEN UPPER(name) = 'UPDATED_AT' THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = @ticketObjId;

    IF @hasId = 1
      SET @idIsIdentity = CASE WHEN COLUMNPROPERTY(@ticketObjId, 'ID', 'IsIdentity') = 1 THEN 1 ELSE 0 END;

    SET @sql = N'INSERT INTO dbo.PV_TICKET_LOG ('
      + CASE WHEN @hasId = 1 AND @idIsIdentity = 0 THEN N'ID, ' ELSE N'' END
      + N'IDFOL, UPC, ART, DES, CTD, PVTA, ORD'
      + CASE WHEN @hasPvtat = 1 THEN N', PVTAT' ELSE N'' END
      + CASE WHEN @hasUpdatedAt = 1 THEN N', UPDATED_AT' ELSE N'' END
      + N') VALUES ('
      + CASE WHEN @hasId = 1 AND @idIsIdentity = 0 THEN N'@pID, ' ELSE N'' END
      + N'@pIDFOL, @pUPC, @pART, @pDES, 1, NULL, NULL'
      + CASE WHEN @hasPvtat = 1 THEN N', NULL' ELSE N'' END
      + CASE WHEN @hasUpdatedAt = 1 THEN N', GETDATE()' ELSE N'' END
      + N');';

    SET @newTicketId = CONVERT(NVARCHAR(36), NEWID());

    EXEC sys.sp_executesql
      @sql,
      N'@pID NVARCHAR(36), @pIDFOL NVARCHAR(255), @pUPC CHAR(2), @pART NVARCHAR(255), @pDES VARCHAR(120)',
      @pID = @newTicketId,
      @pIDFOL = @idfolNorm,
      @pUPC = @idsNorm,
      @pART = @art,
      @pDES = @descSvr;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      CAST(0 AS BIT) AS requiresAuthorizationForm,
      @idfolNorm AS IDFOL,
      @idsNorm AS IDS,
      @art AS ART,
      @descSvr AS DES;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_adeudos_cliente
  @CLIENT BIGINT,
  @FOLIO NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @jsonR NVARCHAR(MAX) = '[]';
  DECLARE @jsonRes NVARCHAR(MAX) = '[]';
  DECLARE @folioNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@FOLIO, ''))));

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    THROW 57026, 'No existe DAT_CTRL_CTAS para consultar adeudos de cliente', 1;
  IF OBJECT_ID('dbo.PV_CTR_FOL_ASVR', 'U') IS NULL
    THROW 57044, 'No existe PV_CTR_FOL_ASVR para consultar adeudos de cliente', 1;

  ;WITH q AS (
    SELECT
      TRY_CONVERT(BIGINT, c.CLIENT) AS CLIENT,
      p.FCNM,
      LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))) AS IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(CAST(p.ORIGEN_AUT AS NVARCHAR(10)), '')))) AS ORIGEN_AUT,
      ISNULL(
        CASE
          WHEN COUNT(DISTINCT NULLIF(rel.RELACION, '')) = 1
            THEN MAX(NULLIF(rel.RELACION, ''))
          ELSE 'MIXTA'
        END,
        '-'
      ) AS RELACION,
      ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), c.IMPT), 0)), 4) AS ADEUDO
    FROM dbo.DAT_CTRL_CTAS c
    INNER JOIN dbo.PV_CTR_FOL_ASVR p
      ON UPPER(LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))))
       = UPPER(LTRIM(RTRIM(ISNULL(CAST(p.IDFOL AS NVARCHAR(255)), ''))))
    OUTER APPLY (
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(x.RELACION, '')))) AS RELACION
      FROM dbo.DAT_CAT_CTAS x
      WHERE UPPER(LTRIM(RTRIM(ISNULL(x.CTA, ''))))
          = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.CTA AS NVARCHAR(50)), ''))))
        AND (
          UPPER(LTRIM(RTRIM(ISNULL(x.SUC, ''))))
            = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
          OR LTRIM(RTRIM(ISNULL(x.SUC, ''))) = ''
        )
      ORDER BY CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(x.SUC, ''))))
           = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
          THEN 0
        ELSE 1
      END
    ) rel
    WHERE TRY_CONVERT(BIGINT, c.CLIENT) = @CLIENT
      AND (
        @folioNorm = ''
        OR UPPER(LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), '')))) LIKE '%' + @folioNorm + '%'
      )
    GROUP BY
      c.CLIENT,
      c.IDFOL,
      p.FCNM,
      p.ORIGEN_AUT
    HAVING ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), c.IMPT), 0)), 4) <> 0
  )
  SELECT
    @jsonR = ISNULL((
      SELECT CLIENT, FCNM, IDFOL, ORIGEN_AUT, RELACION, ADEUDO AS SumaDeIMPT, ADEUDO
      FROM q
      ORDER BY FCNM
      FOR JSON PATH
    ), '[]'),
    @jsonRes = ISNULL((
      SELECT CLIENT, FCNM, IDFOL, ORIGEN_AUT, RELACION, ADEUDO AS SumaDeIMPT, ADEUDO
      FROM q
      WHERE ADEUDO < 0
      ORDER BY FCNM
      FOR JSON PATH
    ), '[]');

  SELECT
    @jsonR AS ADEUDOS_R_JSON,
    @jsonRes AS ADEUDOS_RES_JSON;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_adeudos_folio_detalle
  @CLIENT BIGINT,
  @IDFOL NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @jsonDetalle NVARCHAR(MAX) = '[]';

  IF @idfolNorm = ''
    THROW 57027, 'IDFOL es requerido para consultar detalle de adeudo', 1;

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    THROW 57028, 'No existe DAT_CTRL_CTAS para consultar adeudos de cliente', 1;

  SELECT
    @jsonDetalle = ISNULL((
      SELECT
        c.*
      FROM dbo.DAT_CTRL_CTAS c
      WHERE TRY_CONVERT(BIGINT, c.CLIENT) = @CLIENT
        AND UPPER(LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), '')))) = UPPER(@idfolNorm)
      FOR JSON PATH
    ), '[]');

  SELECT
    @jsonDetalle AS DETALLE_JSON;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_ticket_set_reference_folio
  @IDFOL_ACTUAL NVARCHAR(255),
  @TICKET_LINE_ID NVARCHAR(255),
  @IDFOL_REF NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL_ACTUAL, '')));
  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@TICKET_LINE_ID, '')));
  DECLARE @idfolRefNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL_REF, '')));
  DECLARE @lineUpc CHAR(2);
  DECLARE @relacion NVARCHAR(40);
  DECLARE @clienActual BIGINT;
  DECLARE @adeudoRef DECIMAL(18,4) = 0;
  DECLARE @reqfRef INT = 0;
  DECLARE @newReqfClass INT = 0;
  DECLARE @hasReqfNeg INT = 0;
  DECLARE @hasReqfZero INT = 0;

  IF @idfolNorm = '' OR @artNorm = '' OR @idfolRefNorm = ''
    THROW 57030, 'IDFOL_ACTUAL, TICKET_LINE_ID e IDFOL_REF son requeridos', 1;

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    THROW 57031, 'No existe DAT_CTRL_CTAS para validar referencia de folio', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL = @idfolNorm)
    THROW 57032, 'El ticket no contiene renglones para asignar referencia', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1 @lineUpc = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
    FROM dbo.PV_TICKET_LOG WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;

    IF @lineUpc IS NULL OR @lineUpc = ''
      THROW 57033, 'La linea de ticket seleccionada no existe', 1;

    SELECT TOP 1
      @clienActual = TRY_CONVERT(BIGINT, CLIEN)
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolNorm);

    IF @clienActual IS NULL OR @clienActual <= 1
      THROW 57034, 'Seleccione un cliente válido antes de asignar referencia', 1;

    ;WITH adeudoSel AS (
      SELECT
        LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))) AS IDFOL,
        LTRIM(RTRIM(ISNULL(CAST(c.NDOC AS NVARCHAR(255)), ''))) AS NDOC,
        ISNULL(rel.RELACION, '') AS RELACION,
        ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), c.IMPT), 0)), 4) AS ADEUDO
      FROM dbo.DAT_CTRL_CTAS c
      OUTER APPLY (
        SELECT TOP 1
          UPPER(LTRIM(RTRIM(ISNULL(x.RELACION, '')))) AS RELACION
        FROM dbo.DAT_CAT_CTAS x
        WHERE UPPER(LTRIM(RTRIM(ISNULL(x.CTA, '')))) = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.CTA AS NVARCHAR(50)), ''))))
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(x.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
            OR LTRIM(RTRIM(ISNULL(x.SUC, ''))) = ''
          )
        ORDER BY CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(x.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
            THEN 0 ELSE 1
        END
      ) rel
      WHERE TRY_CONVERT(BIGINT, c.CLIENT) = @clienActual
      GROUP BY
        c.IDFOL,
        c.NDOC,
        rel.RELACION
    ),
    adeudoRefSel AS (
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) AS RELACION,
        ROUND(SUM(ISNULL(ADEUDO, 0)), 4) AS ADEUDO,
        MAX(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolRefNorm) THEN 1 ELSE 0 END) AS MATCH_IDFOL
      FROM adeudoSel
      WHERE
        UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolRefNorm)
        OR UPPER(LTRIM(RTRIM(ISNULL(NDOC, '')))) = UPPER(@idfolRefNorm)
      GROUP BY
        UPPER(LTRIM(RTRIM(ISNULL(RELACION, ''))))
    )
    SELECT TOP 1
      @relacion = UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))),
      @adeudoRef = ADEUDO
    FROM adeudoRefSel
    ORDER BY
      CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineUpc THEN 0 ELSE 1 END,
      MATCH_IDFOL DESC,
      ADEUDO ASC;

    IF @relacion IS NULL OR @relacion = ''
      THROW 57035, 'No se encontro adeudo para la referencia enviada', 1;

    IF ISNULL(@adeudoRef, 0) >= 0
      THROW 57040, 'La referencia seleccionada no tiene adeudo pendiente', 1;

    IF @lineUpc <> @relacion
      THROW 57036, 'La referencia no corresponde al tipo de servicio del ticket', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm
        AND ART <> @artNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(ORD, '')))) = UPPER(@idfolRefNorm)
    )
      THROW 57037, 'La referencia ya fue asignada a otra linea del ticket', 1;

    SELECT TOP 1 @reqfRef = TRY_CONVERT(INT, REQF)
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolRefNorm);

    IF @reqfRef IS NULL
      SET @reqfRef = 0;

    SET @newReqfClass = CASE WHEN @reqfRef = -1 THEN -1 ELSE 0 END;

    SELECT
      @hasReqfNeg = MAX(CASE WHEN ISNULL(r.REF_REQF, 0) = -1 THEN 1 ELSE 0 END),
      @hasReqfZero = MAX(CASE WHEN ISNULL(r.REF_REQF, 0) <> -1 THEN 1 ELSE 0 END)
    FROM dbo.PV_TICKET_LOG t
    OUTER APPLY (
      SELECT TOP 1 TRY_CONVERT(INT, x.REQF) AS REF_REQF
      FROM dbo.PV_CTR_FOL_ASVR x
      WHERE UPPER(LTRIM(RTRIM(ISNULL(x.IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(t.ORD, ''))))
    ) r
    WHERE t.IDFOL = @idfolNorm
      AND LTRIM(RTRIM(ISNULL(t.ORD, ''))) <> ''
      AND t.ART <> @artNorm;

    IF @newReqfClass = -1 AND ISNULL(@hasReqfZero, 0) = 1
      THROW 57038, 'No se permite mezclar referencias con y sin factura en el ticket', 1;

    IF @newReqfClass = 0 AND ISNULL(@hasReqfNeg, 0) = 1
      THROW 57039, 'No se permite mezclar referencias con y sin factura en el ticket', 1;

    UPDATE dbo.PV_TICKET_LOG
    SET ORD = @idfolRefNorm
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS IDFOL,
      @artNorm AS ART,
      @lineUpc AS UPC,
      @idfolRefNorm AS ORD,
      @reqfRef AS REQF_REF;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_ticket_set_reference_gasto
  @IDFOL_ACTUAL NVARCHAR(255),
  @TICKET_LINE_ID NVARCHAR(255),
  @REFGASTO NVARCHAR(120),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL_ACTUAL, '')));
  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@TICKET_LINE_ID, '')));
  DECLARE @refNorm NVARCHAR(120) = LTRIM(RTRIM(ISNULL(@REFGASTO, '')));
  DECLARE @lineUpc CHAR(2);
  DECLARE @resolvedRef NVARCHAR(120);

  IF @idfolNorm = '' OR @artNorm = '' OR @refNorm = ''
    THROW 57040, 'IDFOL_ACTUAL, TICKET_LINE_ID y REFGASTO son requeridos', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1 @lineUpc = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
    FROM dbo.PV_TICKET_LOG WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;

    IF @lineUpc IS NULL OR @lineUpc = ''
      THROW 57041, 'La linea de ticket seleccionada no existe', 1;

    IF @lineUpc IN ('AP', 'AD', 'CR')
      THROW 57042, 'El tipo de servicio no admite referencia de gasto', 1;

    IF TRY_CONVERT(INT, @refNorm) IS NOT NULL
    BEGIN
      SELECT TOP 1 @resolvedRef = LTRIM(RTRIM(ISNULL(REFGASTO, '')))
      FROM dbo.DAT_REF_GTO
      WHERE IDR = TRY_CONVERT(INT, @refNorm);
    END

    IF @resolvedRef IS NULL OR @resolvedRef = ''
    BEGIN
      SELECT TOP 1 @resolvedRef = LTRIM(RTRIM(ISNULL(REFGASTO, '')))
      FROM dbo.DAT_REF_GTO
      WHERE UPPER(LTRIM(RTRIM(ISNULL(REFGASTO, '')))) = UPPER(@refNorm);
    END

    IF @resolvedRef IS NULL OR @resolvedRef = ''
      THROW 57043, 'La referencia de gasto no existe', 1;

    UPDATE dbo.PV_TICKET_LOG
    SET ORD = @resolvedRef
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS IDFOL,
      @artNorm AS ART,
      @lineUpc AS UPC,
      @resolvedRef AS ORD;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_ps_ticket_update_pvta
  @IDFOL NVARCHAR(255),
  @ART NVARCHAR(255),
  @PVTA DECIMAL(18, 4),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@ART, '')));
  DECLARE @lineOrd NVARCHAR(255);
  DECLARE @lineUpc NVARCHAR(10);
  DECLARE @lineCtd DECIMAL(18, 4);
  DECLARE @clienActual BIGINT;
  DECLARE @valimp DECIMAL(18, 4);
  DECLARE @isAdeudoService BIT = 0;
  DECLARE @consumidoOtros DECIMAL(18, 4) = 0;
  DECLARE @saldoDisponible DECIMAL(18, 4) = 0;
  DECLARE @lineTotal DECIMAL(18, 4) = 0;
  DECLARE @ticketObjId INT = OBJECT_ID('dbo.PV_TICKET_LOG');
  DECLARE @hasPvta BIT = 0;
  DECLARE @hasPvtat BIT = 0;
  DECLARE @hasUpdatedAt BIT = 0;
  DECLARE @sql NVARCHAR(MAX);

  IF @idfolNorm = '' OR @artNorm = ''
    THROW 57050, 'IDFOL y ART son requeridos', 1;

  IF @PVTA IS NULL OR @PVTA <= 0
    THROW 57051, 'PVTA debe ser mayor a 0', 1;

  IF @ticketObjId IS NULL
    THROW 57052, 'No existe tabla PV_TICKET_LOG', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1
      @lineOrd = LTRIM(RTRIM(ISNULL(ORD, ''))),
      @lineUpc = UPPER(LTRIM(RTRIM(ISNULL(UPC, '')))),
      @lineCtd = TRY_CONVERT(DECIMAL(18,4), CTD)
    FROM dbo.PV_TICKET_LOG WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;

    IF @lineUpc IS NULL OR @lineUpc = ''
      THROW 57053, 'La linea de ticket no existe', 1;

    IF @lineUpc IN ('AD', 'AP', 'CR')
      SET @isAdeudoService = 1;

    IF @lineOrd IS NULL OR @lineOrd = ''
      THROW 57054, 'Debe asignar referencia (ORD) antes de capturar PVTA', 1;

    SELECT TOP 1
      @clienActual = TRY_CONVERT(BIGINT, CLIEN)
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolNorm);

    IF @clienActual IS NULL OR @clienActual <= 1
      THROW 57055, 'El folio no tiene cliente válido para validar adeudo', 1;

    IF @isAdeudoService = 1
    BEGIN
      ;WITH adeudoFolio AS (
        SELECT
          LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))) AS IDFOL,
          LTRIM(RTRIM(ISNULL(CAST(c.NDOC AS NVARCHAR(255)), ''))) AS NDOC,
          ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), c.IMPT), 0)), 4) AS ADEUDO
        FROM dbo.DAT_CTRL_CTAS c
        WHERE TRY_CONVERT(BIGINT, c.CLIENT) = @clienActual
        GROUP BY
          c.IDFOL,
          c.NDOC
      )
      SELECT
        @valimp = ABS(ROUND(ISNULL(SUM(ADEUDO), 0), 4))
      FROM adeudoFolio
      WHERE
        (
          UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@lineOrd)
          OR UPPER(LTRIM(RTRIM(ISNULL(NDOC, '')))) = UPPER(@lineOrd)
        )
        AND ADEUDO < 0;
    END
    ELSE
    BEGIN
      ;WITH adeudoSel AS (
        SELECT
          LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))) AS IDFOL,
          LTRIM(RTRIM(ISNULL(CAST(c.NDOC AS NVARCHAR(255)), ''))) AS NDOC,
          ISNULL(rel.RELACION, '') AS RELACION,
          ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), c.IMPT), 0)), 4) AS ADEUDO
        FROM dbo.DAT_CTRL_CTAS c
        OUTER APPLY (
          SELECT TOP 1
            UPPER(LTRIM(RTRIM(ISNULL(x.RELACION, '')))) AS RELACION
          FROM dbo.DAT_CAT_CTAS x
          WHERE UPPER(LTRIM(RTRIM(ISNULL(x.CTA, '')))) = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.CTA AS NVARCHAR(50)), ''))))
            AND (
              UPPER(LTRIM(RTRIM(ISNULL(x.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
              OR LTRIM(RTRIM(ISNULL(x.SUC, ''))) = ''
            )
          ORDER BY CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(x.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
              THEN 0 ELSE 1
          END
        ) rel
        WHERE TRY_CONVERT(BIGINT, c.CLIENT) = @clienActual
        GROUP BY
          c.IDFOL,
          c.NDOC,
          rel.RELACION
      )
      SELECT
        @valimp = ABS(ROUND(ISNULL(SUM(ADEUDO), 0), 4))
      FROM adeudoSel
      WHERE
        UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineUpc
        AND (
          UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@lineOrd)
          OR UPPER(LTRIM(RTRIM(ISNULL(NDOC, '')))) = UPPER(@lineOrd)
        )
        AND ADEUDO < 0;
    END;

    IF @valimp IS NULL
      THROW 57056, 'No se encontro adeudo para validar el importe capturado', 1;

    IF @lineCtd IS NULL OR @lineCtd <= 0
      SET @lineCtd = 1;

    SELECT
      @consumidoOtros = ISNULL(SUM(
        ROUND(
          ISNULL(TRY_CONVERT(DECIMAL(18,4), t.PVTA), 0)
          * ISNULL(NULLIF(TRY_CONVERT(DECIMAL(18,4), t.CTD), 0), 1),
          4
        )
      ), 0)
    FROM dbo.PV_TICKET_LOG t
    WHERE t.IDFOL = @idfolNorm
      AND t.ART <> @artNorm
      AND (
        (@isAdeudoService = 1 AND UPPER(LTRIM(RTRIM(ISNULL(t.UPC, '')))) IN ('AD', 'AP', 'CR'))
        OR (@isAdeudoService = 0 AND UPPER(LTRIM(RTRIM(ISNULL(t.UPC, '')))) = @lineUpc)
      )
      AND UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@lineOrd);

    SET @saldoDisponible = ROUND(@valimp - @consumidoOtros, 4);
    SET @lineTotal = ROUND(@PVTA * @lineCtd, 4);

    IF @isAdeudoService = 1 AND @lineTotal > @valimp
      THROW 57057, 'PVTA excede la deuda del folio referenciado', 1;

    IF @saldoDisponible <= 0 OR @lineTotal > @saldoDisponible
      THROW 57057, 'PVTA excede el adeudo disponible para la referencia', 1;

    SELECT
      @hasPvta = MAX(CASE WHEN UPPER(name) = 'PVTA' THEN 1 ELSE 0 END),
      @hasPvtat = MAX(CASE WHEN UPPER(name) = 'PVTAT' THEN 1 ELSE 0 END),
      @hasUpdatedAt = MAX(CASE WHEN UPPER(name) = 'UPDATED_AT' THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = @ticketObjId;

    IF @hasPvta = 0
      THROW 57058, 'La tabla PV_TICKET_LOG no contiene columna PVTA', 1;

    SET @sql = N'UPDATE dbo.PV_TICKET_LOG SET PVTA = @pPVTA'
      + CASE WHEN @hasPvtat = 1 THEN N', PVTAT = ROUND(@pPVTA * @pCTD, 4)' ELSE N'' END
      + CASE WHEN @hasUpdatedAt = 1 THEN N', UPDATED_AT = GETDATE()' ELSE N'' END
      + N' WHERE IDFOL = @pIDFOL AND ART = @pART;';

    EXEC sys.sp_executesql
      @sql,
      N'@pPVTA DECIMAL(18,4), @pCTD DECIMAL(18,4), @pIDFOL NVARCHAR(255), @pART NVARCHAR(255)',
      @pPVTA = @PVTA,
      @pCTD = @lineCtd,
      @pIDFOL = @idfolNorm,
      @pART = @artNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      ID,
      IDFOL,
      ART,
      UPC,
      DES,
      ORD,
      TRY_CONVERT(DECIMAL(18,4), CTD) AS CTD,
      TRY_CONVERT(DECIMAL(18,4), PVTA) AS PVTA,
      TRY_CONVERT(DECIMAL(18,4), PVTAT) AS PVTAT,
      ROUND(ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0) * ISNULL(TRY_CONVERT(DECIMAL(18,4), CTD), 0), 4) AS TOTAL
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_ticket_delete_line
  @IDFOL NVARCHAR(255),
  @ART NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @artNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@ART, '')));

  IF @idfolNorm = '' OR @artNorm = ''
    THROW 57060, 'IDFOL y ART son requeridos', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    DELETE FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm
      AND ART = @artNorm;

    IF @@ROWCOUNT = 0
      THROW 57061, 'La linea de ticket no existe', 1;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT @idfolNorm AS IDFOL, @artNorm AS ART, CAST(1 AS BIT) AS DELETED;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_procesar
  @IDFOL NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @serviceType CHAR(2);
  DECLARE @total DECIMAL(18, 4);
  DECLARE @isCashOut BIT = 0;
  DECLARE @hasNonCashForm BIT = 0;

  IF @idfolNorm = ''
    THROW 57070, 'IDFOL es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL = @idfolNorm)
      THROW 57071, 'El ticket no contiene renglones', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm
        AND LTRIM(RTRIM(ISNULL(ORD, ''))) = ''
    )
      THROW 57072, 'Todas las lineas deben tener referencia asignada (ORD)', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm
        AND TRY_CONVERT(DECIMAL(18,4), PVTA) IS NULL
    )
      THROW 57073, 'Todas las lineas deben tener PVTA capturado', 1;

    SELECT TOP 1 @serviceType = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    SELECT @total = ROUND(SUM(
      ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0)
      * ISNULL(TRY_CONVERT(DECIMAL(18,4), CTD), 0)
    ), 4)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    IF @total IS NULL OR @total <= 0
      THROW 57074, 'El total del ticket no es valido para procesar', 1;

    IF @serviceType IN ('DG', 'DC')
      SET @isCashOut = 1;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET
      IMPT = CASE WHEN @isCashOut = 1 THEN (@total * -1) ELSE @total END,
      FCNM = GETDATE()
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS IDFOL,
      @serviceType AS SERVICE_TYPE,
      @total AS TOTAL,
      CASE WHEN @isCashOut = 1 THEN (@total * -1) ELSE @total END AS IMPT,
      CAST(NULL AS NVARCHAR(40)) AS FPGO,
      CAST(1 AS BIT) AS GO_TO_PAGO;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_ps_form_summary
  @IDFOL NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @total DECIMAL(18, 4);
  DECLARE @pagado DECIMAL(18, 4) = 0;
  DECLARE @restante DECIMAL(18, 4) = 0;
  DECLARE @cambio DECIMAL(18, 4) = 0;
  DECLARE @ivaIntegrado INT = NULL;
  DECLARE @suc NVARCHAR(10);
  DECLARE @esta NVARCHAR(40);
  DECLARE @formasJson NVARCHAR(MAX) = '[]';
  DECLARE @formTableName NVARCHAR(128) = NULL;
  DECLARE @sql NVARCHAR(MAX);

  IF @idfolNorm = ''
    THROW 57080, 'IDFOL es requerido', 1;

  SELECT TOP 1
    @total = ABS(TRY_CONVERT(DECIMAL(18,4), IMPT)),
    @suc = LTRIM(RTRIM(ISNULL(SUC, ''))),
    @esta = LTRIM(RTRIM(ISNULL(ESTA, '')))
  FROM dbo.PV_CTR_FOL_ASVR
  WHERE IDFOL = @idfolNorm;

  IF @total IS NULL OR @total <= 0
  BEGIN
    SELECT @total = ROUND(SUM(
      ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0)
      * ISNULL(TRY_CONVERT(DECIMAL(18,4), CTD), 0)
    ), 4)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;
  END

  IF @total IS NULL SET @total = 0;

  IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
    SET @formTableName = N'dbo.PV_CTR_FOL_FORM';
  ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORMTMP', 'U') IS NOT NULL
    SET @formTableName = N'dbo.PV_CTR_FOL_FORMTMP';

  IF @formTableName IS NOT NULL
  BEGIN
    SET @sql = N'
      SELECT @pPagado = ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), IMPP), 0)), 4)
      FROM ' + @formTableName + N'
      WHERE IDFOL = @pIDFOL;';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pPagado DECIMAL(18,4) OUTPUT',
      @pIDFOL = @idfolNorm,
      @pPagado = @pagado OUTPUT;

    SET @pagado = ISNULL(@pagado, 0);

    SET @sql = N'
      SELECT @pJson = ISNULL((
        SELECT
          IDF,
          IDFOL,
          FORM,
          TRY_CONVERT(DECIMAL(18,4), IMPP) AS IMPP,
          AUT,
          FCN
        FROM ' + @formTableName + N'
        WHERE IDFOL = @pIDFOL
        ORDER BY FCN, IDF
        FOR JSON PATH
      ), ''[]'');';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pJson NVARCHAR(MAX) OUTPUT',
      @pIDFOL = @idfolNorm,
      @pJson = @formasJson OUTPUT;
  END

  IF @pagado >= @total
  BEGIN
    SET @restante = 0;
    SET @cambio = ROUND(@pagado - @total, 4);
  END
  ELSE
  BEGIN
    SET @restante = ROUND(@total - @pagado, 4);
    SET @cambio = 0;
  END

  IF @suc IS NOT NULL AND @suc <> ''
  BEGIN
    SELECT TOP 1 @ivaIntegrado = TRY_CONVERT(INT, IVA_INTEGRADO)
    FROM dbo.DAT_SUC
    WHERE SUC = @suc;
  END

  SELECT
    @idfolNorm AS IDFOL,
    @suc AS SUC,
    @esta AS ESTA,
    @total AS TOTAL,
    @pagado AS PAGADO,
    @restante AS RESTANTE,
    @cambio AS CAMBIO,
    @ivaIntegrado AS IVA_INTEGRADO,
    @formasJson AS FORMAS_JSON;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_form_add
  @IDFOL NVARCHAR(255),
  @FORM NVARCHAR(40),
  @IMPP DECIMAL(18, 4),
  @AUT NVARCHAR(255) = NULL,
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @formNorm NVARCHAR(40) = UPPER(LTRIM(RTRIM(ISNULL(@FORM, ''))));
  DECLARE @autNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@AUT, ''))), '');
  DECLARE @total DECIMAL(18, 4);
  DECLARE @pagado DECIMAL(18, 4);
  DECLARE @restante DECIMAL(18, 4);
  DECLARE @epsilon DECIMAL(18, 6) = 0.0001;
  DECLARE @formTableName NVARCHAR(128) = NULL;
  DECLARE @formTableObjId INT = NULL;
  DECLARE @formNeedsAut BIT = 0;
  DECLARE @hasIdf BIT = 0;
  DECLARE @idfIsIdentity BIT = 0;
  DECLARE @hasAut BIT = 0;
  DECLARE @hasFcn BIT = 0;
  DECLARE @sql NVARCHAR(MAX);
  DECLARE @newFormaId NVARCHAR(36);

  IF @idfolNorm = '' OR @formNorm = ''
    THROW 57090, 'IDFOL y FORM son requeridos', 1;

  IF @IMPP IS NULL OR @IMPP <= 0
    THROW 57091, 'IMPP debe ser mayor a 0', 1;

  IF @formNorm IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
    SET @formNeedsAut = 1;

  IF OBJECT_ID('dbo.PV_CTR_FOL_FORMTMP', 'U') IS NOT NULL
  BEGIN
    SET @formTableName = N'dbo.PV_CTR_FOL_FORMTMP';
    SET @formTableObjId = OBJECT_ID('dbo.PV_CTR_FOL_FORMTMP');
  END
  ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
  BEGIN
    SET @formTableName = N'dbo.PV_CTR_FOL_FORM';
    SET @formTableObjId = OBJECT_ID('dbo.PV_CTR_FOL_FORM');
  END

  IF @formTableObjId IS NULL
    THROW 57092, 'No existe tabla de formas de pago (PV_CTR_FOL_FORMTMP/PV_CTR_FOL_FORM)', 1;

  IF @formNeedsAut = 1 AND (@autNorm IS NULL OR @autNorm = '')
    THROW 57093, 'La forma seleccionada requiere autorizacion/referencia', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1 @total = ABS(TRY_CONVERT(DECIMAL(18,4), IMPT))
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm;

    IF @total IS NULL OR @total <= 0
    BEGIN
      SELECT @total = ROUND(SUM(
        ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0)
        * ISNULL(TRY_CONVERT(DECIMAL(18,4), CTD), 0)
      ), 4)
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm;
    END

    SET @total = ISNULL(@total, 0);

    SET @sql = N'
      SELECT @pPagado = ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), IMPP), 0)), 4)
      FROM ' + @formTableName + N'
      WHERE IDFOL = @pIDFOL;';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pPagado DECIMAL(18,4) OUTPUT',
      @pIDFOL = @idfolNorm,
      @pPagado = @pagado OUTPUT;

    SET @pagado = ISNULL(@pagado, 0);
    SET @restante = CASE WHEN @total > @pagado THEN ROUND(@total - @pagado, 4) ELSE 0 END;

    IF @formNorm <> 'EFECTIVO' AND @IMPP > (@restante + @epsilon)
      THROW 57094, 'El importe de la forma excede el restante por pagar', 1;

    SELECT
      @hasIdf = MAX(CASE WHEN UPPER(name) = 'IDF' THEN 1 ELSE 0 END),
      @hasAut = MAX(CASE WHEN UPPER(name) = 'AUT' THEN 1 ELSE 0 END),
      @hasFcn = MAX(CASE WHEN UPPER(name) = 'FCN' THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = @formTableObjId;

    IF @hasIdf = 1
      SET @idfIsIdentity = CASE WHEN COLUMNPROPERTY(@formTableObjId, 'IDF', 'IsIdentity') = 1 THEN 1 ELSE 0 END;

    SET @sql = N'INSERT INTO ' + @formTableName + N' ('
      + CASE WHEN @hasIdf = 1 AND @idfIsIdentity = 0 THEN N'IDF, ' ELSE N'' END
      + N'IDFOL, FORM, IMPP'
      + CASE WHEN @hasAut = 1 THEN N', AUT' ELSE N'' END
      + CASE WHEN @hasFcn = 1 THEN N', FCN' ELSE N'' END
      + N') VALUES ('
      + CASE WHEN @hasIdf = 1 AND @idfIsIdentity = 0 THEN N'@pIDF, ' ELSE N'' END
      + N'@pIDFOL, @pFORM, @pIMPP'
      + CASE WHEN @hasAut = 1 THEN N', @pAUT' ELSE N'' END
      + CASE WHEN @hasFcn = 1 THEN N', GETDATE()' ELSE N'' END
      + N');';

    SET @newFormaId = CONVERT(NVARCHAR(36), NEWID());

    EXEC sys.sp_executesql
      @sql,
      N'@pIDF NVARCHAR(36), @pIDFOL NVARCHAR(255), @pFORM NVARCHAR(40), @pIMPP DECIMAL(18,4), @pAUT NVARCHAR(255)',
      @pIDF = @newFormaId,
      @pIDFOL = @idfolNorm,
      @pFORM = @formNorm,
      @pIMPP = @IMPP,
      @pAUT = @autNorm;

    SET @sql = N'
      SELECT @pPagado = ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), IMPP), 0)), 4)
      FROM ' + @formTableName + N'
      WHERE IDFOL = @pIDFOL;';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pPagado DECIMAL(18,4) OUTPUT',
      @pIDFOL = @idfolNorm,
      @pPagado = @pagado OUTPUT;

    SET @pagado = ISNULL(@pagado, 0);

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET
      ESTA = CASE WHEN @pagado + @epsilon >= @total AND @total > 0 THEN 'PAGADO' ELSE ESTA END,
      IMPP = @pagado,
      FCNM = GETDATE()
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    EXEC dbo.sp_ps_form_summary @IDFOL = @idfolNorm;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_form_delete
  @IDFOL NVARCHAR(255),
  @IDF NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @idfNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDF, '')));
  DECLARE @total DECIMAL(18, 4);
  DECLARE @pagado DECIMAL(18, 4);
  DECLARE @epsilon DECIMAL(18, 6) = 0.0001;
  DECLARE @formTableName NVARCHAR(128) = NULL;
  DECLARE @sql NVARCHAR(MAX);

  IF @idfolNorm = '' OR @idfNorm = ''
    THROW 57100, 'IDFOL e IDF son requeridos', 1;

  IF OBJECT_ID('dbo.PV_CTR_FOL_FORMTMP', 'U') IS NOT NULL
    SET @formTableName = N'dbo.PV_CTR_FOL_FORMTMP';
  ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
    SET @formTableName = N'dbo.PV_CTR_FOL_FORM';

  IF @formTableName IS NULL
    THROW 57101, 'No existe tabla de formas de pago (PV_CTR_FOL_FORMTMP/PV_CTR_FOL_FORM)', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SET @sql = N'
      DELETE FROM ' + @formTableName + N'
      WHERE IDFOL = @pIDFOL
        AND UPPER(LTRIM(RTRIM(CAST(IDF AS NVARCHAR(255))))) = UPPER(@pIDF);';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pIDF NVARCHAR(255)',
      @pIDFOL = @idfolNorm,
      @pIDF = @idfNorm;

    IF @@ROWCOUNT = 0
      THROW 57102, 'La forma de pago no existe para el folio', 1;

    SELECT TOP 1 @total = ABS(TRY_CONVERT(DECIMAL(18,4), IMPT))
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm;

    SET @total = ISNULL(@total, 0);

    SET @sql = N'
      SELECT @pPagado = ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18,4), IMPP), 0)), 4)
      FROM ' + @formTableName + N'
      WHERE IDFOL = @pIDFOL;';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255), @pPagado DECIMAL(18,4) OUTPUT',
      @pIDFOL = @idfolNorm,
      @pPagado = @pagado OUTPUT;

    SET @pagado = ISNULL(@pagado, 0);

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET
      ESTA = CASE WHEN @total <= 0 OR @pagado + @epsilon < @total THEN 'PENDIENTE' ELSE ESTA END,
      IMPP = @pagado,
      FCNM = GETDATE()
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    EXEC dbo.sp_ps_form_summary @IDFOL = @idfolNorm;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_pago_finalize
  @IDFOL NVARCHAR(255),
  @FORMAS_JSON NVARCHAR(MAX),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @idfolActual NVARCHAR(255);
  DECLARE @idfolInicial NVARCHAR(255);
  DECLARE @idfolVisibleNuevo NVARCHAR(255);
  DECLARE @folioConsecNuevo INT = NULL;
  DECLARE @traActual NVARCHAR(255);
  DECLARE @traVisibleNuevo NVARCHAR(255);
  DECLARE @origenAut VARCHAR(2);
  DECLARE @tipoVisibleFinal VARCHAR(2);
  DECLARE @folioActualUpper NVARCHAR(255);
  DECLARE @formasJsonNorm NVARCHAR(MAX) = LTRIM(RTRIM(ISNULL(@FORMAS_JSON, '')));
  DECLARE @userNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@USER, ''))), '');
  DECLARE @fechaProceso DATETIME = GETDATE();
  DECLARE @fechaProcesoDate DATE = CONVERT(DATE, GETDATE());
  DECLARE @sucDb NVARCHAR(20);
  DECLARE @opvDb NVARCHAR(255);
  DECLARE @clien FLOAT;
  DECLARE @estado NVARCHAR(40);
  DECLARE @serviceType CHAR(2);
  DECLARE @isCashOut BIT = 0;
  DECLARE @hasNonCashForm BIT = 0;
  DECLARE @total DECIMAL(18, 4);
  DECLARE @sumPagos DECIMAL(18, 4);
  DECLARE @cambio DECIMAL(18, 4) = 0;
  DECLARE @cambioPendiente DECIMAL(18, 4) = 0;
  DECLARE @epsilon DECIMAL(18, 6) = 0.0001;
  DECLARE @efectivoCambioAsignado BIT = 0;
  DECLARE @folFormTable NVARCHAR(128) = NULL;
  DECLARE @folFormObjId INT = NULL;
  DECLARE @hasIDF BIT = 0;
  DECLARE @idfIsIdentity BIT = 0;
  DECLARE @hasFCN BIT = 0;
  DECLARE @hasIMPA BIT = 0;
  DECLARE @hasIMPC BIT = 0;
  DECLARE @hasIMPD BIT = 0;
  DECLARE @hasAUT BIT = 0;
  DECLARE @hasESTA BIT = 0;
  DECLARE @hasESTAF BIT = 0;
  DECLARE @sql NVARCHAR(MAX);
  DECLARE @execIdf NVARCHAR(255);
  DECLARE @formaForm NVARCHAR(40);
  DECLARE @formaImpp DECIMAL(18, 4);
  DECLARE @formaAut NVARCHAR(255);
  DECLARE @impc DECIMAL(18, 4);
  DECLARE @impd DECIMAL(18, 4);
  DECLARE @ctrlObjId INT = NULL;
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
  DECLARE @ctrlClassCol NVARCHAR(10) = NULL;
  DECLARE @datCmovObjId INT = OBJECT_ID('dbo.DAT_CMOV');
  DECLARE @datCmovHasRelacion BIT = 0;
  DECLARE @datCmovHasCmov BIT = 0;
  DECLARE @datCmovHasTipo BIT = 0;
  DECLARE @lineTipps NVARCHAR(10);
  DECLARE @lineOrd NVARCHAR(255);
  DECLARE @lineTotal DECIMAL(18, 4);
  DECLARE @movClass INT;
  DECLARE @cta NVARCHAR(255);
  DECLARE @lineImpt DECIMAL(18, 4);
  DECLARE @lineIdFol NVARCHAR(255);
  DECLARE @rtxt NVARCHAR(255);
  DECLARE @ndoc NVARCHAR(255);
  DECLARE @opvAudit NVARCHAR(255);
  DECLARE @movErr NVARCHAR(255);

  DECLARE @FORMAS TABLE (
    ROW_ID INT IDENTITY(1,1) PRIMARY KEY,
    FORM NVARCHAR(40) NOT NULL,
    IMPP DECIMAL(18,4) NOT NULL,
    AUT NVARCHAR(255) NULL
  );

  DECLARE @LINES TABLE (
    ROW_ID INT IDENTITY(1,1) PRIMARY KEY,
    UPC NVARCHAR(10) NOT NULL,
    ORD NVARCHAR(255) NULL,
    LINE_TOTAL DECIMAL(18,4) NOT NULL
  );

  IF @idfolNorm = ''
    THROW 57120, 'IDFOL es requerido', 1;

  IF @formasJsonNorm = ''
    THROW 57121, 'FORMAS_JSON es requerido', 1;

  INSERT INTO @FORMAS (FORM, IMPP, AUT)
  SELECT
    UPPER(LTRIM(RTRIM(ISNULL(j.FORM, '')))) AS FORM,
    TRY_CONVERT(DECIMAL(18,4), j.IMPP) AS IMPP,
    NULLIF(LTRIM(RTRIM(ISNULL(j.AUT, ''))), '') AS AUT
  FROM OPENJSON(@formasJsonNorm)
  WITH (
    FORM NVARCHAR(40) '$.form',
    IMPP NVARCHAR(64) '$.impp',
    AUT NVARCHAR(255) '$.aut'
  ) j;

  IF NOT EXISTS (SELECT 1 FROM @FORMAS)
    THROW 57122, 'Debe enviar al menos una forma de pago', 1;

  IF EXISTS (
    SELECT 1
    FROM @FORMAS
    WHERE FORM = ''
      OR IMPP IS NULL
      OR IMPP <= 0
  )
    THROW 57123, 'Las formas enviadas no son válidas', 1;

  IF EXISTS (
    SELECT 1
    FROM @FORMAS
    WHERE FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
      AND (AUT IS NULL OR AUT = '')
  )
    THROW 57124, 'Las formas no efectivo requieren autorización/referencia', 1;

  SET @hasNonCashForm = CASE WHEN EXISTS (SELECT 1 FROM @FORMAS WHERE FORM <> 'EFECTIVO') THEN 1 ELSE 0 END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1
      @idfolActual = LTRIM(RTRIM(ISNULL(IDFOL, ''))),
      @idfolInicial = ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(IDFOLINICIAL, ''))), ''), LTRIM(RTRIM(ISNULL(IDFOL, '')))),
      @traActual = LTRIM(RTRIM(ISNULL(TRA, ''))),
      @origenAut = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, '')))) IN ('CA', 'VF')
          THEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, ''))))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(AUT, '')))) IN ('DVF', 'VF')
          THEN 'VF'
        ELSE 'CA'
      END,
      @sucDb = LTRIM(RTRIM(ISNULL(SUC, ''))),
      @opvDb = LTRIM(RTRIM(ISNULL(OPV, ''))),
      @clien = TRY_CONVERT(FLOAT, CLIEN),
      @estado = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
    WHERE IDFOL = @idfolNorm
       OR IDFOLINICIAL = @idfolNorm
    ORDER BY CASE WHEN IDFOL = @idfolNorm THEN 0 ELSE 1 END, FCN DESC, FCNM DESC;

    IF ISNULL(@idfolActual, '') = ''
      THROW 57125, 'El folio PS no existe', 1;

    SET @idfolNorm = @idfolActual;
    IF ISNULL(@idfolInicial, '') = ''
      SET @idfolInicial = @idfolActual;
    SET @tipoVisibleFinal = CASE
      WHEN UPPER(ISNULL(@origenAut, 'CA')) = 'VF'
        OR (UPPER(ISNULL(@origenAut, 'CA')) = 'CA' AND @hasNonCashForm = 1)
        THEN 'VF'
      ELSE 'CA'
    END;
    SET @folioActualUpper = UPPER(@idfolActual);
    SET @idfolVisibleNuevo = @idfolActual;
    SET @traVisibleNuevo = NULLIF(@traActual, '');

    IF CHARINDEX('-' + @tipoVisibleFinal + '-', @folioActualUpper) = 0
    BEGIN
      EXEC dbo.sp_pv_next_visible_folio
        @SUC = @sucDb,
        @TIPO_FOLIO = @tipoVisibleFinal,
        @FECHA = @fechaProcesoDate,
        @IDFOL_OUT = @idfolVisibleNuevo OUTPUT,
        @CONSEC_OUT = @folioConsecNuevo OUTPUT;

      IF ISNULL(LTRIM(RTRIM(@idfolVisibleNuevo)), '') = ''
        THROW 57135, 'No se pudo generar folio visible final para PS', 1;

      SET @traVisibleNuevo = CONVERT(NVARCHAR(255), @folioConsecNuevo);
    END;

    IF @estado = 'PAGADO'
      THROW 57126, 'El folio ya se encuentra en estado PAGADO', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL = @idfolNorm)
      THROW 57127, 'El ticket no contiene renglones', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @idfolNorm
        AND (LTRIM(RTRIM(ISNULL(ORD, ''))) = '' OR TRY_CONVERT(DECIMAL(18,4), PVTA) IS NULL)
    )
      THROW 57128, 'Todas las líneas del ticket deben tener referencia y PVTA capturado', 1;

    SELECT TOP 1 @serviceType = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    IF @serviceType IN ('DG', 'DC')
      SET @isCashOut = 1;

    SELECT @total = ROUND(SUM(
      ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0) *
      ISNULL(NULLIF(TRY_CONVERT(DECIMAL(18,4), CTD), 0), 1)
    ), 4)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm;

    IF @total IS NULL OR @total <= 0
      THROW 57129, 'El total del ticket no es válido', 1;

    SELECT @sumPagos = ROUND(SUM(IMPP), 4)
    FROM @FORMAS;

    IF @sumPagos IS NULL OR @sumPagos <= 0
      THROW 57130, 'El total de formas de pago no es válido', 1;

    IF @sumPagos + @epsilon < @total
      THROW 57131, 'El importe de formas no cubre el total del ticket', 1;

    IF @sumPagos > @total + @epsilon
       AND NOT EXISTS (SELECT 1 FROM @FORMAS WHERE FORM = 'EFECTIVO')
      THROW 57132, 'Solo EFECTIVO puede exceder el total para generar cambio', 1;

    IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
      SET @folFormTable = N'dbo.PV_CTR_FOL_FORM';
    ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR', 'U') IS NOT NULL
      SET @folFormTable = N'dbo.PV_CTR_FOL_FORM_SVR';
    ELSE
      THROW 57133, 'No existe tabla de formas de pago (PV_CTR_FOL_FORM/PV_CTR_FOL_FORM_SVR)', 1;

    SET @folFormObjId = OBJECT_ID(@folFormTable);

    SELECT
      @hasIDF = MAX(CASE WHEN UPPER(name) = 'IDF' THEN 1 ELSE 0 END),
      @hasFCN = MAX(CASE WHEN UPPER(name) = 'FCN' THEN 1 ELSE 0 END),
      @hasIMPA = MAX(CASE WHEN UPPER(name) = 'IMPA' THEN 1 ELSE 0 END),
      @hasIMPC = MAX(CASE WHEN UPPER(name) = 'IMPC' THEN 1 ELSE 0 END),
      @hasIMPD = MAX(CASE WHEN UPPER(name) = 'IMPD' THEN 1 ELSE 0 END),
      @hasAUT = MAX(CASE WHEN UPPER(name) = 'AUT' THEN 1 ELSE 0 END),
      @hasESTA = MAX(CASE WHEN UPPER(name) = 'ESTA' THEN 1 ELSE 0 END),
      @hasESTAF = MAX(CASE WHEN UPPER(name) = 'ESTAF' THEN 1 ELSE 0 END)
    FROM sys.columns
    WHERE object_id = @folFormObjId;

    IF @hasIDF = 1
      SET @idfIsIdentity = CASE WHEN COLUMNPROPERTY(@folFormObjId, 'IDF', 'IsIdentity') = 1 THEN 1 ELSE 0 END;

    SET @sql = N'DELETE FROM ' + @folFormTable + N' WHERE IDFOL = @pIDFOL;';
    EXEC sys.sp_executesql
      @sql,
      N'@pIDFOL NVARCHAR(255)',
      @pIDFOL = @idfolNorm;

    SET @cambio = CASE WHEN @sumPagos > @total THEN ROUND(@sumPagos - @total, 4) ELSE 0 END;
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
      END;

      SET @impd = ROUND(@formaImpp - @impc, 4);
      SET @execIdf = CONVERT(NVARCHAR(255), NEWID());

      SET @sql = N'INSERT INTO ' + @folFormTable + N' (' +
        CASE WHEN @hasIDF = 1 AND @idfIsIdentity = 0 THEN N'IDF, ' ELSE N'' END +
        N'IDFOL' +
        CASE WHEN @hasFCN = 1 THEN N', FCN' ELSE N'' END +
        N', FORM' +
        CASE WHEN @hasIMPA = 1 THEN N', IMPA' ELSE N'' END +
        N', IMPP' +
        CASE WHEN @hasIMPC = 1 THEN N', IMPC' ELSE N'' END +
        CASE WHEN @hasIMPD = 1 THEN N', IMPD' ELSE N'' END +
        CASE WHEN @hasAUT = 1 THEN N', AUT' ELSE N'' END +
        CASE WHEN @hasESTA = 1 THEN N', ESTA' ELSE N'' END +
        CASE WHEN @hasESTAF = 1 THEN N', ESTAF' ELSE N'' END +
        N') VALUES (' +
        CASE WHEN @hasIDF = 1 AND @idfIsIdentity = 0 THEN N'@pIDF, ' ELSE N'' END +
        N'@pIDFOL' +
        CASE WHEN @hasFCN = 1 THEN N', @pNOW' ELSE N'' END +
        N', @pFORM' +
        CASE WHEN @hasIMPA = 1 THEN N', NULL' ELSE N'' END +
        N', @pIMPP' +
        CASE WHEN @hasIMPC = 1 THEN N', @pIMPC' ELSE N'' END +
        CASE WHEN @hasIMPD = 1 THEN N', @pIMPD' ELSE N'' END +
        CASE WHEN @hasAUT = 1 THEN N', @pAUT' ELSE N'' END +
        CASE WHEN @hasESTA = 1 THEN N', NULL' ELSE N'' END +
        CASE WHEN @hasESTAF = 1 THEN N', NULL' ELSE N'' END +
        N');';

      EXEC sys.sp_executesql
        @sql,
        N'@pIDF NVARCHAR(255), @pIDFOL NVARCHAR(255), @pNOW DATETIME, @pFORM NVARCHAR(40), @pIMPP DECIMAL(18,4), @pIMPC DECIMAL(18,4), @pIMPD DECIMAL(18,4), @pAUT NVARCHAR(255)',
        @pIDF = @execIdf,
        @pIDFOL = @idfolVisibleNuevo,
        @pNOW = @fechaProceso,
        @pFORM = @formaForm,
        @pIMPP = @formaImpp,
        @pIMPC = @impc,
        @pIMPD = @impd,
        @pAUT = @formaAut;

      FETCH NEXT FROM forma_cursor INTO @formaForm, @formaImpp, @formaAut;
    END;
    CLOSE forma_cursor;
    DEALLOCATE forma_cursor;

    SET @ctrlObjId = OBJECT_ID('dbo.DAT_CTRL_CTAS');
    IF @ctrlObjId IS NOT NULL
    BEGIN
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

      IF @datCmovObjId IS NOT NULL
      BEGIN
        SELECT
          @datCmovHasRelacion = MAX(CASE WHEN UPPER(name) = 'RELACION' THEN 1 ELSE 0 END),
          @datCmovHasCmov = MAX(CASE WHEN UPPER(name) = 'CMOV' THEN 1 ELSE 0 END),
          @datCmovHasTipo = MAX(CASE WHEN UPPER(name) = 'TIPO' THEN 1 ELSE 0 END)
        FROM sys.columns
        WHERE object_id = @datCmovObjId;
      END

      IF @ctrlHasCTA = 1 AND @ctrlHasCLIENT = 1 AND @ctrlHasIMPT = 1 AND @ctrlHasIDFOL = 1 AND @ctrlClassCol IS NOT NULL
      BEGIN
        INSERT INTO @LINES (UPC, ORD, LINE_TOTAL)
        SELECT
          UPPER(LTRIM(RTRIM(ISNULL(UPC, '')))) AS UPC,
          LTRIM(RTRIM(ISNULL(ORD, ''))) AS ORD,
          ROUND(
            ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0)
            * ISNULL(NULLIF(TRY_CONVERT(DECIMAL(18,4), CTD), 0), 1),
            4
          ) AS LINE_TOTAL
        FROM dbo.PV_TICKET_LOG
        WHERE IDFOL = @idfolNorm;

        DECLARE line_cursor CURSOR LOCAL FAST_FORWARD FOR
          SELECT UPC, ORD, LINE_TOTAL
          FROM @LINES
          ORDER BY ROW_ID;

        OPEN line_cursor;
        FETCH NEXT FROM line_cursor INTO @lineTipps, @lineOrd, @lineTotal;
        WHILE @@FETCH_STATUS = 0
        BEGIN
          SET @movClass = NULL;
          SET @cta = NULL;
          SET @lineImpt = ABS(ISNULL(@lineTotal, 0));
          SET @lineIdFol = @idfolVisibleNuevo;
          SET @rtxt = 'Abono a cliente ticket ' + @idfolVisibleNuevo;

          IF @datCmovObjId IS NOT NULL
             AND @datCmovHasRelacion = 1
             AND @datCmovHasCmov = 1
          BEGIN
            IF @datCmovHasTipo = 1
            BEGIN
              SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
              FROM dbo.DAT_CMOV
              WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps
                AND UPPER(LTRIM(RTRIM(ISNULL(TIPO, '')))) = 'ABONO'
              ORDER BY CMOV;
            END
            ELSE
            BEGIN
              SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
              FROM dbo.DAT_CMOV
              WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps
              ORDER BY CMOV;
            END
          END
          ELSE
          BEGIN
            IF @lineTipps = 'DG'
            BEGIN
              IF OBJECT_ID('dbo.DAT_CMOV_C', 'U') IS NOT NULL
                 AND COL_LENGTH('dbo.DAT_CMOV_C', 'RELACION') IS NOT NULL
                 AND COL_LENGTH('dbo.DAT_CMOV_C', 'CMOV') IS NOT NULL
              BEGIN
                SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
                FROM dbo.DAT_CMOV_C
                WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps;
              END
            END
            ELSE
            BEGIN
              IF OBJECT_ID('dbo.DAT_CMOV_A', 'U') IS NOT NULL
                 AND COL_LENGTH('dbo.DAT_CMOV_A', 'RELACION') IS NOT NULL
                 AND COL_LENGTH('dbo.DAT_CMOV_A', 'CMOV') IS NOT NULL
              BEGIN
                SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
                FROM dbo.DAT_CMOV_A
                WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps;
              END
            END
          END;

          IF @lineTipps = 'DG'
          BEGIN
            SET @lineImpt = -ABS(ISNULL(@lineTotal, 0));
            SET @lineIdFol = @idfolVisibleNuevo;
            SET @rtxt = LTRIM(RTRIM(ISNULL(@lineOrd, ''))) + ' ticket ' + @idfolVisibleNuevo;
          END
          ELSE IF @lineTipps = 'DC'
          BEGIN
            SET @lineImpt = ABS(ISNULL(@lineTotal, 0));
            SET @lineIdFol = @idfolVisibleNuevo;
            SET @rtxt = LTRIM(RTRIM(ISNULL(@lineOrd, ''))) + ' ticket ' + @idfolVisibleNuevo;
          END
          ELSE
          BEGIN
            SET @lineImpt = ABS(ISNULL(@lineTotal, 0));
            SET @lineIdFol = CASE
              WHEN LTRIM(RTRIM(ISNULL(@lineOrd, ''))) = '' THEN @idfolVisibleNuevo
              ELSE @lineOrd
            END;
            SET @rtxt = 'Abono a cliente ticket ' + @idfolVisibleNuevo;
          END;

          IF @movClass IS NULL
          BEGIN
            SET @movErr = N'No se encontró CLSD (CMOV) para RELACION '
              + ISNULL(@lineTipps, N'')
              + N' con TIPO=ABONO.';
            THROW 57134, @movErr, 1;
          END;

          IF OBJECT_ID('dbo.DAT_CAT_CTAS', 'U') IS NOT NULL
             AND COL_LENGTH('dbo.DAT_CAT_CTAS', 'CTA') IS NOT NULL
             AND COL_LENGTH('dbo.DAT_CAT_CTAS', 'RELACION') IS NOT NULL
          BEGIN
            SELECT TOP 1
              @cta = LTRIM(RTRIM(ISNULL(CTA, '')))
            FROM dbo.DAT_CAT_CTAS
            WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps
              AND (
                COL_LENGTH('dbo.DAT_CAT_CTAS', 'SUC') IS NULL
                OR UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = UPPER(ISNULL(@sucDb, ''))
                OR LTRIM(RTRIM(ISNULL(SUC, ''))) = ''
              )
            ORDER BY CASE
              WHEN COL_LENGTH('dbo.DAT_CAT_CTAS', 'SUC') IS NULL THEN 0
              WHEN UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = UPPER(ISNULL(@sucDb, '')) THEN 0
              ELSE 1
            END;
          END;

          IF @cta IS NOT NULL AND LTRIM(RTRIM(@cta)) <> ''
          BEGIN
            SET @ndoc = CONCAT(
              'PS',
              CONVERT(VARCHAR(8), @fechaProceso, 112),
              REPLACE(CONVERT(VARCHAR(8), @fechaProceso, 108), ':', ''),
              RIGHT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 6)
            );
            SET @opvAudit = COALESCE(@userNorm, @opvDb);

            SET @sql = N'
              INSERT INTO dbo.DAT_CTRL_CTAS (
                CTA,
                CLIENT,
                ' + @ctrlClassCol + N',
                IMPT' +
                CASE WHEN @ctrlHasNDOC = 1 THEN N', NDOC' ELSE N'' END +
                N', IDFOL' +
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
                @pIMPT' +
                CASE WHEN @ctrlHasNDOC = 1 THEN N', @pNDOC' ELSE N'' END +
                N', @pIDFOL' +
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
              N'@pCTA NVARCHAR(255), @pCLIENT FLOAT, @pCLSD INT, @pIMPT DECIMAL(18,4), @pNDOC NVARCHAR(255), @pIDFOL NVARCHAR(255), @pSUC NVARCHAR(20), @pOPV NVARCHAR(255), @pTIPO NVARCHAR(10), @pRTXT NVARCHAR(255), @pNOW DATETIME',
              @pCTA = @cta,
              @pCLIENT = @clien,
              @pCLSD = @movClass,
              @pIMPT = @lineImpt,
              @pNDOC = @ndoc,
              @pIDFOL = @lineIdFol,
              @pSUC = @sucDb,
              @pOPV = @opvAudit,
              @pTIPO = @lineTipps,
              @pRTXT = @rtxt,
              @pNOW = @fechaProceso;
          END;

          FETCH NEXT FROM line_cursor INTO @lineTipps, @lineOrd, @lineTotal;
        END;
        CLOSE line_cursor;
        DEALLOCATE line_cursor;
      END;
    END;

    IF UPPER(ISNULL(@idfolVisibleNuevo, '')) <> UPPER(ISNULL(@idfolNorm, ''))
    BEGIN
      UPDATE dbo.PV_TICKET_LOG
      SET IDFOL = @idfolVisibleNuevo
      WHERE IDFOL = @idfolNorm;
    END;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET
      IDFOL = @idfolVisibleNuevo,
      TRA = COALESCE(NULLIF(@traVisibleNuevo, ''), TRA),
      ESTA = 'PAGADO',
      IMPT = CASE WHEN @isCashOut = 1 THEN (@total * -1) ELSE @total END,
      IMPP = @sumPagos,
      FPGO = 'FINALIZADO',
      FCNM = @fechaProceso,
      OPVM = COALESCE(@userNorm, OPVM),
      IDFOLINICIAL = ISNULL(NULLIF(LTRIM(RTRIM(IDFOLINICIAL)), ''), @idfolInicial),
      ORIGEN_AUT = @tipoVisibleFinal
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolVisibleNuevo AS IDFOL,
      'PAGADO' AS ESTA,
      @total AS TOTAL,
      @sumPagos AS PAGADO,
      @cambio AS CAMBIO;
  END TRY
  BEGIN CATCH
    IF CURSOR_STATUS('local', 'forma_cursor') >= -1
    BEGIN
      CLOSE forma_cursor;
      DEALLOCATE forma_cursor;
    END

    IF CURSOR_STATUS('local', 'line_cursor') >= -1
    BEGIN
      CLOSE line_cursor;
      DEALLOCATE line_cursor;
    END

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ps_terminar
  @IDFOL NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));

  IF @idfolNorm = ''
    THROW 57110, 'IDFOL es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET ESTA = 'CERRADO_PS',
        FCNM = GETDATE()
    WHERE IDFOL = @idfolNorm;

    IF @@ROWCOUNT = 0
      THROW 57111, 'El folio no existe', 1;

    IF OBJECT_ID('dbo.PV_CTR_FOL_FORMTMP', 'U') IS NOT NULL
    BEGIN
      DELETE FROM dbo.PV_CTR_FOL_FORMTMP
      WHERE IDFOL = @idfolNorm;
    END

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS IDFOL,
      'CERRADO_PS' AS ESTA,
      CAST(1 AS BIT) AS OK;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

