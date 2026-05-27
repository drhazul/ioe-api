SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
      ISNULL(d.CTD, 0),
      ISNULL(d.CTD, 0) * ISNULL(TRY_CONVERT(FLOAT, d.CTO), 0),
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

-- Ajuste correctivo para movimientos históricos de merma
UPDATE m
SET m.ALMACEN = '001'
FROM dbo.DAT_MB51 m
WHERE UPPER(LTRIM(RTRIM(ISNULL(m.ALMACEN, '')))) = 'MERMA'
  AND UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'MERMA DOC %';
GO
