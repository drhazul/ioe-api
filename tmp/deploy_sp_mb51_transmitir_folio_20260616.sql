CREATE OR ALTER PROCEDURE dbo.sp_mb51_transmitir_folio
  @IDFOL NVARCHAR(255),
  @USER NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
  DECLARE @actor NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@USER, ''))), '');
  DECLARE @idfolActual NVARCHAR(255) = '';
  DECLARE @autNorm NVARCHAR(40) = '';
  DECLARE @sucNorm NVARCHAR(20) = '';
  DECLARE @sign FLOAT = -1;
  DECLARE @clsm FLOAT = 201;
  DECLARE @rowsTicket INT = 0;
  DECLARE @rowsInserted INT = 0;
  DECLARE @rowsStock INT = 0;
  DECLARE @rowsStockMissing INT = 0;
  DECLARE @rowsIdConflict INT = 0;
  DECLARE @isSkipped BIT = 0;
  DECLARE @skipReason NVARCHAR(120) = '';
  DECLARE @estaFinal NVARCHAR(40) = '';
  DECLARE @processNow DATETIME = GETDATE();

  IF @idfolNorm = ''
    THROW 57201, 'IDFOL es requerido', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP 1
      @idfolActual = LTRIM(RTRIM(ISNULL(h.IDFOL, ''))),
      @autNorm = UPPER(LTRIM(RTRIM(ISNULL(h.AUT, '')))),
      @sucNorm = LTRIM(RTRIM(ISNULL(h.SUC, '')))
    FROM dbo.PV_CTR_FOL_ASVR h WITH (UPDLOCK, HOLDLOCK)
    WHERE h.IDFOL = @idfolNorm
       OR h.IDFOLINICIAL = @idfolNorm
    ORDER BY CASE WHEN h.IDFOL = @idfolNorm THEN 0 ELSE 1 END, h.FCN DESC, h.FCNM DESC;

    IF @idfolActual = ''
      THROW 57202, 'El folio no existe en PV_CTR_FOL_ASVR', 1;

    SET @idfolNorm = @idfolActual;

    IF @autNorm IN ('AD', 'AP', 'CR', 'DC', 'DG', 'DP')
    BEGIN
      SET @isSkipped = 1;
      SET @skipReason = 'AUT excluido de MB51 (pago de servicios)';
    END;
    ELSE IF UPPER(@sucNorm) = 'DM01'
    BEGIN
      SET @isSkipped = 1;
      SET @skipReason = 'SUC DM01 excluida';
    END;

    IF @isSkipped = 0
    BEGIN
      IF @autNorm IN ('DF', 'DCA', 'DVF', 'APDF')
      BEGIN
        SET @sign = 1;
        SET @clsm = 202;
      END;
      ELSE
      BEGIN
        SET @sign = -1;
        SET @clsm = 201;
      END;

      DECLARE @source TABLE (
        IDPD_FINAL NVARCHAR(510) NOT NULL,
        [USER] NVARCHAR(510) NULL,
        CLSM FLOAT NULL,
        DOCP NVARCHAR(510) NULL,
        ART NVARCHAR(510) NULL,
        CTDA FLOAT NULL,
        CTOT FLOAT NULL,
        FCND DATETIME NULL,
        FCNC DATETIME NULL,
        TXT NVARCHAR(510) NULL,
        ALMACEN VARCHAR(255) NULL,
        SUC VARCHAR(255) NULL,
        ID_CONFLICT BIT NOT NULL,
        ART_KEY NVARCHAR(510) NULL,
        CTD_RAW FLOAT NULL
      );

      ;WITH ticket_base AS (
        SELECT
          ID_BASE = LEFT(
            CASE
              WHEN LTRIM(RTRIM(ISNULL(t.ID, ''))) = ''
                THEN CONCAT('GEN-', CONVERT(NVARCHAR(36), NEWID()))
              ELSE LTRIM(RTRIM(ISNULL(t.ID, '')))
            END,
            510
          ),
          t.ART,
          t.CTD,
          TICKET_REL = LTRIM(RTRIM(ISNULL(t.TICKET_REL, ''))),
          h.FCNM,
          h.SUC,
          CTOP = ISNULL(a.CTOP, 0)
        FROM dbo.PV_CTR_FOL_ASVR h
        INNER JOIN dbo.PV_TICKET_LOG t
          ON t.IDFOL = h.IDFOL
        OUTER APPLY (
          SELECT MAX(ISNULL(da.CTOP, 0)) AS CTOP
          FROM dbo.DAT_ART da
          WHERE da.SUC = h.SUC
            AND da.ART = t.ART
        ) a
        WHERE h.IDFOL = @idfolNorm
      ),
      ticket_resolved AS (
        SELECT
          b.ID_BASE,
          ID_ALT = LEFT(
            b.ID_BASE + '-U' + CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONCAT(b.ID_BASE, '|', @idfolNorm)), 2),
            510
          ),
          b.ART,
          b.CTD,
          b.TICKET_REL,
          b.FCNM,
          b.SUC,
          b.CTOP
        FROM ticket_base b
      ),
      mb51_ready AS (
        SELECT
          IDPD_FINAL = CASE
            WHEN EXISTS (
              SELECT 1
              FROM dbo.DAT_MB51 m
              WHERE m.IDPD = r.ID_BASE
                AND ISNULL(LTRIM(RTRIM(ISNULL(m.DOCP, ''))), '') <> @idfolNorm
            ) THEN r.ID_ALT
            ELSE r.ID_BASE
          END,
          ID_CONFLICT = CASE
            WHEN EXISTS (
              SELECT 1
              FROM dbo.DAT_MB51 m
              WHERE m.IDPD = r.ID_BASE
                AND ISNULL(LTRIM(RTRIM(ISNULL(m.DOCP, ''))), '') <> @idfolNorm
            ) THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
          END,
          [USER] = COALESCE(@actor, 'SYSTEM'),
          CLSM = CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(r.TICKET_REL, ''))), '') IS NOT NULL
              AND ISNULL(r.CTD, 0) < 0 THEN 207
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(r.TICKET_REL, ''))), '') IS NOT NULL
              THEN 206
            ELSE @clsm
          END,
          DOCP = @idfolNorm,
          ART = r.ART,
          CTDA = ISNULL(r.CTD, 0) * @sign,
          CTOT = ISNULL(r.CTD, 0) * ISNULL(r.CTOP, 0) * @sign,
          FCND = r.FCNM,
          FCNC = @processNow,
          TXT = CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(r.TICKET_REL, ''))), '') IS NOT NULL
              AND ISNULL(r.CTD, 0) < 0 THEN 'DESCUENTO TICKET RELACIONADO'
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(r.TICKET_REL, ''))), '') IS NOT NULL
              THEN 'VENTA TICKET RELACIONADO'
            ELSE @idfolNorm
          END,
          ALMACEN = '001',
          SUC = r.SUC,
          ART_KEY = LTRIM(RTRIM(ISNULL(r.ART, ''))),
          CTD_RAW = ISNULL(r.CTD, 0)
        FROM ticket_resolved r
      )
      INSERT INTO @source (
        IDPD_FINAL,
        [USER],
        CLSM,
        DOCP,
        ART,
        CTDA,
        CTOT,
        FCND,
        FCNC,
        TXT,
        ALMACEN,
        SUC,
        ID_CONFLICT,
        ART_KEY,
        CTD_RAW
      )
      SELECT
        s.IDPD_FINAL,
        s.[USER],
        s.CLSM,
        s.DOCP,
        s.ART,
        s.CTDA,
        s.CTOT,
        s.FCND,
        s.FCNC,
        s.TXT,
        s.ALMACEN,
        s.SUC,
        s.ID_CONFLICT,
        s.ART_KEY,
        s.CTD_RAW
      FROM mb51_ready s;

      SELECT
        @rowsTicket = COUNT(1),
        @rowsIdConflict = SUM(CASE WHEN ID_CONFLICT = 1 THEN 1 ELSE 0 END)
      FROM @source;

      DECLARE @insertedMb51 TABLE (
        ART NVARCHAR(510) NULL,
        SUC VARCHAR(255) NULL,
        CTDA FLOAT NULL
      );

      INSERT INTO dbo.DAT_MB51 (
        IDPD,
        [USER],
        CLSM,
        DOCP,
        ART,
        CTDA,
        CTOT,
        FCND,
        FCNC,
        TXT,
        ALMACEN,
        SUC
      )
      OUTPUT
        inserted.ART,
        inserted.SUC,
        inserted.CTDA
      INTO @insertedMb51 (ART, SUC, CTDA)
      SELECT
        pick.IDPD_FINAL,
        pick.[USER],
        pick.CLSM,
        pick.DOCP,
        pick.ART,
        pick.CTDA,
        pick.CTOT,
        pick.FCND,
        pick.FCNC,
        pick.TXT,
        pick.ALMACEN,
        pick.SUC
      FROM (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY s.IDPD_FINAL
            ORDER BY s.IDPD_FINAL, s.ART_KEY, s.CTD_RAW DESC
          ) AS rn
        FROM @source s
      ) pick
      WHERE pick.rn = 1
        AND NOT EXISTS (
        SELECT 1
        FROM dbo.DAT_MB51 m WITH (UPDLOCK, HOLDLOCK)
        WHERE m.IDPD = pick.IDPD_FINAL
      );

      SET @rowsInserted = @@ROWCOUNT;

      DECLARE @stockSummary TABLE (
        SUC VARCHAR(20) NOT NULL,
        ART NVARCHAR(510) NOT NULL,
        DELTA FLOAT NOT NULL
      );

      INSERT INTO @stockSummary (SUC, ART, DELTA)
      SELECT
        LTRIM(RTRIM(ISNULL(i.SUC, @sucNorm))) AS SUC,
        LTRIM(RTRIM(ISNULL(i.ART, ''))) AS ART,
        SUM(ISNULL(i.CTDA, 0)) AS DELTA
      FROM @insertedMb51 i
      WHERE LTRIM(RTRIM(ISNULL(i.ART, ''))) <> ''
      GROUP BY
        LTRIM(RTRIM(ISNULL(i.SUC, @sucNorm))),
        LTRIM(RTRIM(ISNULL(i.ART, '')));

      SELECT @rowsStockMissing = COUNT(1)
      FROM @stockSummary ss
      LEFT JOIN dbo.DAT_ART da
        ON da.SUC = ss.SUC
       AND da.ART = ss.ART
      WHERE da.ART IS NULL;

      ;WITH stockTarget AS (
        SELECT
          da.SUC,
          da.ART,
          da.UPC,
          ROW_NUMBER() OVER (
            PARTITION BY da.SUC, da.ART
            ORDER BY
              CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(da.UPC, ''))), '') IS NULL THEN 1 ELSE 0 END,
              da.UPC
          ) AS rn
        FROM dbo.DAT_ART da
        INNER JOIN @stockSummary ss
          ON ss.SUC = da.SUC
         AND ss.ART = da.ART
      )
      UPDATE da
      SET da.STOCK = ISNULL(da.STOCK, 0) + ss.DELTA
      FROM dbo.DAT_ART da
      INNER JOIN stockTarget st
        ON st.SUC = da.SUC
       AND st.ART = da.ART
       AND st.UPC = da.UPC
       AND st.rn = 1
      INNER JOIN @stockSummary ss
        ON ss.SUC = st.SUC
       AND ss.ART = st.ART;

      SET @rowsStock = @@ROWCOUNT;
    END;

    IF OBJECT_ID('dbo.CTROL_TRAMISIONES', 'U') IS NOT NULL
      AND COL_LENGTH('dbo.CTROL_TRAMISIONES', 'FNCT') IS NOT NULL
      AND COL_LENGTH('dbo.CTROL_TRAMISIONES', 'TIP_TRANS') IS NOT NULL
      AND COL_LENGTH('dbo.CTROL_TRAMISIONES', 'N_REG') IS NOT NULL
    BEGIN
      INSERT INTO dbo.CTROL_TRAMISIONES (FNCT, TIP_TRANS, N_REG)
      VALUES (@processNow, 'MB51', @rowsInserted);
    END;

    SELECT TOP 1
      @estaFinal = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE IDFOL = @idfolNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @idfolNorm AS IDFOL,
      @autNorm AS AUT,
      @sucNorm AS SUC,
      @rowsTicket AS ROWS_TICKET,
      @rowsInserted AS ROWS_MB51_INSERTED,
      @rowsIdConflict AS ROWS_ID_CONFLICT,
      @rowsStock AS ROWS_STOCK_UPDATED,
      @rowsStockMissing AS ROWS_STOCK_MISSING,
      CAST(@isSkipped AS BIT) AS SKIPPED,
      @skipReason AS SKIP_REASON,
      @estaFinal AS ESTA_FINAL;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
