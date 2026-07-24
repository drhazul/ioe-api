SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*
  DAT_MB51 representa el inventario acumulado mediante SUM(CTDA).
  Por ello, las salidas deben persistirse con CTDA/CTOT negativos:
    - transferencia, movimiento 121, en la sucursal origen;
    - merma, en la sucursal que contabiliza el documento.
  Las cantidades capturadas en las tablas de detalle se conservan positivas.
*/

CREATE OR ALTER PROCEDURE dbo.sp_trans_transito
  @DOC NVARCHAR(255),
  @USER NVARCHAR(100),
  @EMP NVARCHAR(120) = NULL,
  @NUM_GUIA NVARCHAR(120) = NULL,
  @RESP NVARCHAR(120) = NULL,
  @TXT NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @sucSal NVARCHAR(20), @estatus NVARCHAR(30), @docBase BIGINT;
    SELECT
      @sucSal = LTRIM(RTRIM(ISNULL(SUC_SAL, ALM_SAL))),
      @estatus = UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, ''))))
    FROM dbo.TRAN_CTR_DOCPRE WITH (UPDLOCK, HOLDLOCK)
    WHERE DOC = @DOC;

    IF @estatus IS NULL THROW 59150, 'Documento no existe.', 1;
    IF @estatus <> 'PREPARACION' THROW 59151, 'Solo se puede enviar a transito desde PREPARACION.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.DAT_CMOV WHERE CMOV = 121)
      THROW 59152, 'DAT_CMOV no tiene configurado el movimiento 121.', 1;

    SELECT @docBase = TRY_CONVERT(BIGINT, NDOC)
    FROM dbo.DAT_CMOV WITH (UPDLOCK, HOLDLOCK)
    WHERE CMOV = 121;
    IF @docBase IS NULL SET @docBase = 121000000;
    SET @docBase = @docBase + 1;
    UPDATE dbo.DAT_CMOV SET NDOC = @docBase WHERE CMOV = 121;

    INSERT INTO dbo.DAT_MB51
      (IDPD, [USER], CLSM, DOCP, ART, CTDA, CTOT, FCND, FCNC, TXT, ALMACEN, VTAESP, SUC)
    SELECT
      CONVERT(NVARCHAR(36), NEWID()), @USER, 121, @DOC, d.ART,
      -ABS(ISNULL(d.CTD_LIB, 0)),
      -ABS(ISNULL(d.CTD_LIB, 0)) * ISNULL(a.CTOP, 0),
      GETDATE(), GETDATE(), CONCAT('TRANSFERENCIA SALIDA DOC ', @DOC),
      '001', 0, @sucSal
    FROM dbo.TRAN_DET_ART d
    LEFT JOIN dbo.DAT_ART a
      ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @sucSal
     AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
    WHERE d.DOC = @DOC
      AND ISNULL(d.BLOQ, 0) <> -1
      AND ISNULL(d.CTD_LIB, 0) > 0;

    UPDATE a
    SET a.STOCK = ISNULL(a.STOCK, 0) - ISNULL(d.CTD_LIB, 0)
    FROM dbo.DAT_ART a
    JOIN dbo.TRAN_DET_ART d
      ON LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
     AND LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @sucSal
    WHERE d.DOC = @DOC
      AND ISNULL(d.BLOQ, 0) <> -1;

    INSERT INTO dbo.TRAN_PAQ_ENV (DOC, EMP, NUM_GUIA, FENV, RESP, TXT, USR)
    VALUES (@DOC, @EMP, @NUM_GUIA, GETDATE(), @RESP, @TXT, @USER);

    UPDATE dbo.TRAN_CTR_DOCPRE
    SET ESTATUS = 'TRANSITO',
        DOC_MB51_SAL = CONVERT(NVARCHAR(50), @docBase),
        USR_E = @USER,
        FCNM = GETDATE()
    WHERE DOC = @DOC;

    COMMIT TRANSACTION;
    SELECT DOC, ESTATUS, DOC_MB51_SAL FROM dbo.TRAN_CTR_DOCPRE WHERE DOC = @DOC;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_merma_contabilizar
  @DOCMER NVARCHAR(50),
  @USER NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @docEst INT;
    DECLARE @docSuc NVARCHAR(50);
    DECLARE @docFND DATETIME;

    SELECT TOP 1
      @docEst = ISNULL(ID_ESTATUS, CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(ESTATS, '')))) IN ('PENDIENTE', 'AUTORIZADO') THEN 2 ELSE -1 END),
      @docSuc = LTRIM(RTRIM(ISNULL(SUC, ''))),
      @docFND = FCND
    FROM dbo.DOC_CTRL_MERMA WITH (UPDLOCK, HOLDLOCK)
    WHERE DOCMER = @DOCMER;

    IF @docEst IS NULL
      THROW 59040, 'Documento no existe.', 1;

    IF @docEst <> 2
      THROW 59041, 'Solo se puede contabilizar un documento PENDIENTE.', 1;

    IF NOT EXISTS (
      SELECT 1 FROM dbo.DET_ART_MERMA
      WHERE DOCMER = @DOCMER
        AND ISNULL(BLOQ, 0) <> -1
    )
      THROW 59042, 'Documento sin articulos activos.', 1;

    DECLARE @clsm FLOAT;
    SELECT TOP 1 @clsm = CMOV
    FROM dbo.DAT_CMOV
    WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = 'MERMA'
      AND UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) = 'INVENTARIO'
      AND UPPER(LTRIM(RTRIM(ISNULL(TIPO, '')))) = 'CARGO'
    ORDER BY CMOV ASC;

    IF @clsm IS NULL
      SET @clsm = 555;

    DECLARE @docMb51 BIGINT;
    SELECT @docMb51 = TRY_CONVERT(BIGINT, NDOC)
    FROM dbo.DAT_CMOV WITH (UPDLOCK, HOLDLOCK)
    WHERE CMOV = @clsm;

    IF @docMb51 IS NULL SET @docMb51 = 300000000;
    SET @docMb51 = @docMb51 + 1;

    UPDATE dbo.DAT_CMOV
    SET NDOC = @docMb51
    WHERE CMOV = @clsm;

    INSERT INTO dbo.DAT_MB51
      (IDPD, [USER], CLSM, DOCP, ART, CTDA, CTOT, FCND, FCNC, TXT, ALMACEN, VTAESP, SUC)
    SELECT
      CONVERT(NVARCHAR(36), NEWID()),
      @USER,
      @clsm,
      @DOCMER,
      LTRIM(RTRIM(ISNULL(d.ART, ''))),
      -ABS(ISNULL(d.CTD, 0)),
      -ABS(ISNULL(d.CTD, 0)) * ISNULL(TRY_CONVERT(FLOAT, d.CTO), 0),
      ISNULL(@docFND, GETDATE()),
      GETDATE(),
      CONCAT('MERMA DOC ', @DOCMER),
      '001',
      0,
      @docSuc
    FROM dbo.DET_ART_MERMA d
    WHERE d.DOCMER = @DOCMER
      AND ISNULL(d.BLOQ, 0) <> -1;

    UPDATE a
    SET a.STOCK = ISNULL(a.STOCK, 0) - ISNULL(d.CTD, 0)
    FROM dbo.DAT_ART a
    JOIN dbo.DET_ART_MERMA d
      ON LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
     AND LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @docSuc
    WHERE d.DOCMER = @DOCMER
      AND ISNULL(d.BLOQ, 0) <> -1;

    UPDATE m
    SET m.NARTS = agg.narts,
        m.TOTAL = agg.total,
        m.ESTATS = 'CONTABILIZADO',
        m.ID_ESTATUS = 5,
        m.FCNC = GETDATE(),
        m.USER_A = @USER,
        m.DOC_MB51 = CONVERT(NVARCHAR(50), @docMb51),
        m.FCNM = GETDATE()
    FROM dbo.DOC_CTRL_MERMA m
    CROSS APPLY (
      SELECT
        SUM(CASE WHEN ISNULL(x.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(x.CTD, 0) END) AS narts,
        SUM(CASE WHEN ISNULL(x.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(x.CTD, 0) * ISNULL(x.CTO, 0) END) AS total
      FROM dbo.DET_ART_MERMA x
      WHERE x.DOCMER = m.DOCMER
    ) agg
    WHERE m.DOCMER = @DOCMER;

    DECLARE @negativos INT;
    SELECT @negativos = COUNT(1)
    FROM dbo.DAT_ART a
    JOIN dbo.DET_ART_MERMA d
      ON LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
     AND LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @docSuc
    WHERE d.DOCMER = @DOCMER
      AND ISNULL(d.BLOQ, 0) <> -1
      AND ISNULL(a.STOCK, 0) < 0;

    COMMIT TRANSACTION;

    SELECT
      DOCMER,
      ESTATS,
      ID_ESTATUS,
      DOC_MB51,
      NARTS,
      TOTAL,
      FCNC,
      ISNULL(@negativos, 0) AS STOCK_NEGATIVO_ITEMS
    FROM dbo.DOC_CTRL_MERMA
    WHERE DOCMER = @DOCMER;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
