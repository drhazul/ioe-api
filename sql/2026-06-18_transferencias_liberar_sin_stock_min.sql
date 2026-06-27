CREATE OR ALTER PROCEDURE dbo.sp_trans_liberar
  @DOC NVARCHAR(255),
  @USER NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @sucSal NVARCHAR(20), @estatus NVARCHAR(30);
    SELECT
      @sucSal = LTRIM(RTRIM(ISNULL(SUC_SAL, ALM_SAL))),
      @estatus = UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, ''))))
    FROM dbo.TRAN_CTR_DOCPRE WITH (UPDLOCK, HOLDLOCK)
    WHERE DOC = @DOC;

    IF @estatus IS NULL THROW 59120, 'Documento no existe.', 1;
    IF @estatus <> 'PENDIENTE' THROW 59121, 'Solo se puede liberar desde PENDIENTE.', 1;

    UPDATE d
    SET d.CTD_LIB = CASE
          WHEN ISNULL(TRY_CONVERT(FLOAT, d.CTD_LIB), 0) <= 0
            THEN ISNULL(TRY_CONVERT(FLOAT, d.CTD), 0)
          ELSE TRY_CONVERT(FLOAT, d.CTD_LIB)
        END,
        d.CTOLIB = CASE
          WHEN ISNULL(TRY_CONVERT(FLOAT, d.CTD_LIB), 0) <= 0
            THEN ISNULL(TRY_CONVERT(FLOAT, d.CTD), 0)
          ELSE TRY_CONVERT(FLOAT, d.CTD_LIB)
        END * ISNULL(a.CTOP, 0),
        d.CTOTAL = ISNULL(TRY_CONVERT(FLOAT, d.CTD), 0) * ISNULL(a.CTOP, 0),
        d.USR_L = @USER
    FROM dbo.TRAN_DET_ART d
    LEFT JOIN dbo.DAT_ART a
      ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @sucSal
     AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
    WHERE d.DOC = @DOC AND ISNULL(d.BLOQ, 0) <> -1;

    IF EXISTS (
      SELECT 1
      FROM dbo.TRAN_DET_ART d
      JOIN dbo.DAT_ART a
        ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @sucSal
       AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      WHERE d.DOC = @DOC
        AND ISNULL(d.BLOQ, 0) <> -1
        AND ISNULL(d.CTD_LIB, 0) < 0
    )
      THROW 59122, 'La cantidad liberada no puede ser negativa.', 1;

    UPDATE h
    SET h.CTD = calc.CTD,
        h.IMP = calc.IMP,
        h.ESTATUS = 'LIBERADA',
        h.USR_L = @USER,
        h.FCNM = GETDATE()
    FROM dbo.TRAN_CTR_DOCPRE h
    CROSS APPLY (
      SELECT
        SUM(CASE WHEN ISNULL(d.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(d.CTD_LIB, 0) END) AS CTD,
        SUM(CASE WHEN ISNULL(d.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(d.CTOLIB, 0) END) AS IMP
      FROM dbo.TRAN_DET_ART d
      WHERE d.DOC = h.DOC
    ) calc
    WHERE h.DOC = @DOC;

    COMMIT TRANSACTION;
    SELECT DOC, ESTATUS FROM dbo.TRAN_CTR_DOCPRE WHERE DOC = @DOC;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
