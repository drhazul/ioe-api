SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*
  Caja General - Entrega OPV y resumen global
  Migración de lógica heredada Access a SQL Server (SPs idempotentes)
*/

IF OBJECT_ID('dbo.DAT_FORM_FIN', 'U') IS NULL
BEGIN
  RAISERROR('58000: No existe dbo.DAT_FORM_FIN', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_FORM_ENTR_OPV_SVR', 'U') IS NULL
BEGIN
  RAISERROR('58001: No existe dbo.DAT_FORM_ENTR_OPV_SVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.PV_CTR_FOL_ASVR', 'U') IS NULL
BEGIN
  RAISERROR('58002: No existe dbo.PV_CTR_FOL_ASVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NULL
BEGIN
  RAISERROR('58003: No existe dbo.PV_CTR_FOL_FORM', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.PV_TICKET_LOG', 'U') IS NULL
BEGIN
  RAISERROR('58004: No existe dbo.PV_TICKET_LOG', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_FORM', 'U') IS NULL
BEGIN
  RAISERROR('58005: No existe dbo.DAT_FORM', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_RET_CTR_SVR', 'U') IS NULL
BEGIN
  RAISERROR('58006: No existe dbo.DAT_RET_CTR_SVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_RET_DET_SVR', 'U') IS NULL
BEGIN
  RAISERROR('58007: No existe dbo.DAT_RET_DET_SVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_RET_DET_EFEC_SVR', 'U') IS NULL
BEGIN
  RAISERROR('58008: No existe dbo.DAT_RET_DET_EFEC_SVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_ART', 'U') IS NULL
BEGIN
  RAISERROR('58009: No existe dbo.DAT_ART', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.JRQ_DEPA', 'U') IS NULL
BEGIN
  RAISERROR('58010: No existe dbo.JRQ_DEPA', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.JRQ_SUBD', 'U') IS NULL
BEGIN
  RAISERROR('58011: No existe dbo.JRQ_SUBD', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.PV_TIPO_ESTA', 'U') IS NULL
BEGIN
  RAISERROR('58012: No existe dbo.PV_TIPO_ESTA', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_CTR_DOC', 'U') IS NULL
BEGIN
  RAISERROR('58013: No existe dbo.DAT_CTR_DOC', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
BEGIN
  RAISERROR('58014: No existe dbo.DAT_CTRL_CTAS', 16, 1);
  RETURN;
END;
GO

IF EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.PV_CTR_FOL_ASVR')
    AND name = 'IX_CG_PV_CTR_FOL_ASVR_SUC_FCNM_OPV_AUT_ESTA'
)
BEGIN
  DROP INDEX IX_CG_PV_CTR_FOL_ASVR_SUC_FCNM_OPV_AUT_ESTA ON dbo.PV_CTR_FOL_ASVR;
END;

IF EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.PV_CTR_FOL_ASVR')
    AND name = 'IX_CG_PV_CTR_FOL_ASVR_FCNM'
)
BEGIN
  DROP INDEX IX_CG_PV_CTR_FOL_ASVR_FCNM ON dbo.PV_CTR_FOL_ASVR;
END;

CREATE INDEX IX_CG_PV_CTR_FOL_ASVR_FCNM
ON dbo.PV_CTR_FOL_ASVR (FCNM)
INCLUDE (IDFOL, SUC, OPV, OPVM, AUT, ESTA, IMPT);
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.DAT_FORM_FIN')
    AND name = 'IX_CG_DAT_FORM_FIN_SUC_FCN_OPV'
)
BEGIN
  CREATE INDEX IX_CG_DAT_FORM_FIN_SUC_FCN_OPV
  ON dbo.DAT_FORM_FIN (SUC, FCN, OPV, ESTA)
  INCLUDE (IDE, ART, TRN, DIF);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.DAT_FORM_ENTR_OPV_SVR')
    AND name = 'IX_CG_DAT_FORM_ENTR_OPV_SVR_SUC_FCN_OPV'
)
BEGIN
  CREATE INDEX IX_CG_DAT_FORM_ENTR_OPV_SVR_SUC_FCN_OPV
  ON dbo.DAT_FORM_ENTR_OPV_SVR (SUC, FCN, OPV, FORM)
  INCLUDE (IMPT, IMPR, IMPE, DIFD);
END;
GO
CREATE OR ALTER FUNCTION dbo.fn_cg_normalize_forma
(
  @FORM NVARCHAR(255)
)
RETURNS NVARCHAR(255)
AS
BEGIN
  DECLARE @value NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@FORM, ''))));

  IF @value IN ('CHE', 'CHEQUE') SET @value = 'CHEQUE';
  IF @value IN ('CRE', 'CREDITO') SET @value = 'CREDITO';
  IF @value IN ('DEP', 'DEPOSITO 3RO', 'DEPOSITO', 'DEPOSITO 3RO.') SET @value = 'DEPOSITO 3RO';
  IF @value IN ('DEU', 'DEUDOR') SET @value = 'DEUDOR';
  IF @value IN ('EFE', 'EFECTIVO') SET @value = 'EFECTIVO';
  IF @value IN ('TAR', 'TARJETA') SET @value = 'TARJETA';
  IF @value IN ('TRA', 'TRANSFERENCIA') SET @value = 'TRANSFERENCIA';

  RETURN @value;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_validar_opv_para_entrega
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @sucNorm = ''
  BEGIN
    SELECT
      CAST(0 AS bit) AS ok,
      'ERROR' AS [status],
      'SUC es obligatorio.' AS [message],
      0 AS pagadoCount,
      0 AS totalTransacciones;
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    SELECT
      CAST(0 AS bit) AS ok,
      'ERROR' AS [status],
      'OPV es obligatorio.' AS [message],
      0 AS pagadoCount,
      0 AS totalTransacciones;
    RETURN;
  END;

  DECLARE @totalTransacciones INT = 0;
  DECLARE @pagadoCount INT = 0;

  ;WITH FoliosDia AS (
    SELECT
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV_ACT,
      UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) AS ESTA
    FROM dbo.PV_CTR_FOL_ASVR a
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND a.FCNM >= @dtIni
      AND a.FCNM < @dtFin
      AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) NOT IN ('CP', 'CPF', 'VA')
  )
  SELECT
    @totalTransacciones = COUNT(1),
    @pagadoCount = SUM(CASE WHEN ESTA = 'PAGADO' THEN 1 ELSE 0 END)
  FROM FoliosDia
  WHERE OPV_ACT = @opvNorm;

  IF ISNULL(@pagadoCount, 0) > 0
  BEGIN
    SELECT
      CAST(0 AS bit) AS ok,
      'BLOQUEADO' AS [status],
      'No se puede preparar la entrega: existen transacciones PAGADO para el OPV. Primero deben pasar a TERMINADO.' AS [message],
      ISNULL(@pagadoCount, 0) AS pagadoCount,
      ISNULL(@totalTransacciones, 0) AS totalTransacciones;
    RETURN;
  END;

  SELECT
    CAST(1 AS bit) AS ok,
    'OK' AS [status],
    'OPV listo para preparar entrega.' AS [message],
    ISNULL(@pagadoCount, 0) AS pagadoCount,
    ISNULL(@totalTransacciones, 0) AS totalTransacciones;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_sync_entrega_opv_abierta
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58015, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58016, 'OPV es obligatorio', 1;

  DECLARE @serial INT = DATEDIFF(DAY, '1899-12-30', @fcnDate);
  DECLARE @ide NVARCHAR(255) = CONCAT(@serial, @opvNorm);
  DECLARE @estaActual NVARCHAR(20) = NULL;
  DECLARE @terNorm NVARCHAR(255) = NULL;

  SELECT TOP (1)
    @estaActual = UPPER(LTRIM(RTRIM(ISNULL(fin.ESTA, ''))))
  FROM dbo.DAT_FORM_FIN fin
  WHERE fin.IDE = @ide;

  IF @estaActual = 'CERRADO'
  BEGIN
    SELECT
      @ide AS IDE,
      @opvNorm AS OPV,
      @dtIni AS FCN,
      CAST(NULL AS FLOAT) AS ART,
      CAST(NULL AS FLOAT) AS TRN,
      CAST(NULL AS MONEY) AS DIF,
      'CERRADO' AS ESTA,
      @sucNorm AS SUC;
    RETURN;
  END;

  SELECT TOP (1)
    @terNorm = NULLIF(LTRIM(RTRIM(ISNULL(e.TER, ''))), '')
  FROM dbo.DAT_FORM_ENTR_OPV_SVR e
  WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
    AND UPPER(LTRIM(RTRIM(ISNULL(e.OPV, '')))) = @opvNorm
    AND CONVERT(DATE, e.FCN) = @fcnDate;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    DECLARE @formas TABLE (
      FORM NVARCHAR(255) PRIMARY KEY,
      NOM NVARCHAR(255) NULL,
      IMPT MONEY NOT NULL,
      IMPR MONEY NOT NULL,
      IMPE MONEY NOT NULL,
      DIFD MONEY NOT NULL,
      TRECIBIDO MONEY NOT NULL
    );

    ;WITH Folios AS (
      SELECT
        a.IDFOL,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT
      FROM dbo.PV_CTR_FOL_ASVR a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
        AND a.FCNM >= @dtIni
        AND a.FCNM < @dtFin
        AND UPPER(LTRIM(RTRIM(ISNULL(
          CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
            ELSE a.OPV
          END,
        '')))) = @opvNorm
        AND (
          (@tipoNorm = 'GLOBAL' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) NOT IN ('CP', 'CPF', 'VA'))
          OR (@tipoNorm = 'CA' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'CA')
          OR (@tipoNorm = 'VF' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'VF')
        )
    ),
    Cobrado AS (
      SELECT
        dbo.fn_cg_normalize_forma(f.FORM) AS FORM,
        SUM(ISNULL(f.IMPD, 0)) AS IMPT
      FROM dbo.PV_CTR_FOL_FORM f
      INNER JOIN Folios fo ON fo.IDFOL = f.IDFOL
      GROUP BY dbo.fn_cg_normalize_forma(f.FORM)
    ),
    Retiros AS (
      SELECT
        dbo.fn_cg_normalize_forma(d.FORMA) AS FORM,
        SUM(ISNULL(d.IMPF, 0)) AS IMPR
      FROM dbo.DAT_RET_CTR_SVR r
      INNER JOIN dbo.DAT_RET_DET_SVR d ON d.IDRET = r.IDRET
      WHERE UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm
        AND r.FCNR >= @dtIni
        AND r.FCNR < @dtFin
        AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
      GROUP BY dbo.fn_cg_normalize_forma(d.FORMA)
    ),
    EntregadoPrevio AS (
      SELECT
        dbo.fn_cg_normalize_forma(e.FORM) AS FORM,
        SUM(ISNULL(e.IMPE, 0)) AS IMPE
      FROM dbo.DAT_FORM_ENTR_OPV_SVR e
      WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(e.OPV, '')))) = @opvNorm
        AND CONVERT(DATE, e.FCN) = @fcnDate
      GROUP BY dbo.fn_cg_normalize_forma(e.FORM)
    ),
    Catalogo AS (
      SELECT
        dbo.fn_cg_normalize_forma(df.FORM) AS FORM,
        MAX(LTRIM(RTRIM(ISNULL(df.NOM, '')))) AS NOM,
        MAX(CAST(ISNULL(df.ESTADO, 1) AS INT)) AS ESTADO
      FROM dbo.DAT_FORM df
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(df.FORM, ''))), '') IS NOT NULL
      GROUP BY dbo.fn_cg_normalize_forma(df.FORM)
    ),
    Formas AS (
      SELECT FORM FROM Catalogo
      UNION
      SELECT FORM FROM Cobrado
      UNION
      SELECT FORM FROM Retiros
      UNION
      SELECT FORM FROM EntregadoPrevio
    )
    INSERT INTO @formas (FORM, NOM, IMPT, IMPR, IMPE, DIFD, TRECIBIDO)
    SELECT
      f.FORM,
      NULLIF(LTRIM(RTRIM(CASE WHEN LEN(ISNULL(cat.NOM, '')) >= LEN(f.FORM) THEN cat.NOM ELSE f.FORM END)), '') AS NOM,
      ISNULL(c.IMPT, 0) AS IMPT,
      ISNULL(r.IMPR, 0) AS IMPR,
      ISNULL(ep.IMPE, 0) AS IMPE,
      ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) - ISNULL(ep.IMPE, 0) AS DIFD,
      ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) AS TRECIBIDO
    FROM Formas f
    LEFT JOIN Catalogo cat ON cat.FORM = f.FORM
    LEFT JOIN Cobrado c ON c.FORM = f.FORM
    LEFT JOIN Retiros r ON r.FORM = f.FORM
    LEFT JOIN EntregadoPrevio ep ON ep.FORM = f.FORM
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(f.FORM, ''))), '') IS NOT NULL;

    DECLARE @trn FLOAT = 0;
    DECLARE @art FLOAT = 0;

    ;WITH Folios AS (
      SELECT
        a.IDFOL,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT
      FROM dbo.PV_CTR_FOL_ASVR a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
        AND a.FCNM >= @dtIni
        AND a.FCNM < @dtFin
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) NOT IN ('CP', 'CPF', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(
          CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
            ELSE a.OPV
          END,
        '')))) = @opvNorm
        AND (
          @tipoNorm = 'GLOBAL'
          OR (@tipoNorm = 'CA' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'CA')
          OR (@tipoNorm = 'VF' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'VF')
        )
    )
    SELECT
      @trn = COUNT(1),
      @art = SUM(CASE WHEN f.AUT IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END)
    FROM Folios f
    LEFT JOIN dbo.PV_TICKET_LOG t ON t.IDFOL = f.IDFOL;

    DECLARE @difTotal MONEY = ISNULL((SELECT SUM(ISNULL(DIFD, 0)) FROM @formas), 0);

    IF EXISTS (SELECT 1 FROM dbo.DAT_FORM_FIN WITH (UPDLOCK, HOLDLOCK) WHERE IDE = @ide)
    BEGIN
      UPDATE dbo.DAT_FORM_FIN
      SET
        OPV = @opvNorm,
        FCN = @dtIni,
        ART = ISNULL(@art, 0),
        TRN = ISNULL(@trn, 0),
        DIF = @difTotal,
        ESTA = 'ABIERTA',
        SUC = @sucNorm
      WHERE IDE = @ide;
    END
    ELSE
    BEGIN
      INSERT INTO dbo.DAT_FORM_FIN (IDE, OPV, FCN, ART, TRN, DIF, ESTA, SUC)
      VALUES (@ide, @opvNorm, @dtIni, ISNULL(@art, 0), ISNULL(@trn, 0), @difTotal, 'ABIERTA', @sucNorm);
    END;

    DELETE FROM dbo.DAT_FORM_ENTR_OPV_SVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
      AND CONVERT(DATE, FCN) = @fcnDate;

    INSERT INTO dbo.DAT_FORM_ENTR_OPV_SVR (
      IDE,
      FCN,
      OPV,
      TER,
      FORM,
      IMPT,
      IMPR,
      IMPE,
      DIFD,
      SUC
    )
    SELECT
      CONCAT(
        @serial,
        CASE
          WHEN FORM = 'CHEQUE' THEN 'CHE'
          WHEN FORM = 'CREDITO' THEN 'CRE'
          WHEN FORM = 'DEPOSITO 3RO' THEN 'DEP'
          WHEN FORM = 'DEUDOR' THEN 'DEU'
          WHEN FORM = 'EFECTIVO' THEN 'EFE'
          WHEN FORM = 'TARJETA' THEN 'TAR'
          WHEN FORM = 'TRANSFERENCIA' THEN 'TRA'
          ELSE LEFT(REPLACE(FORM, ' ', '') + 'XXX', 3)
        END,
        @opvNorm
      ) AS IDE,
      @dtIni AS FCN,
      @opvNorm AS OPV,
      @terNorm AS TER,
      FORM,
      IMPT,
      IMPR,
      IMPE,
      DIFD,
      @sucNorm AS SUC
    FROM @formas;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @ide AS IDE,
      @opvNorm AS OPV,
      @dtIni AS FCN,
      ISNULL(@art, 0) AS ART,
      ISNULL(@trn, 0) AS TRN,
      @difTotal AS DIF,
      'ABIERTA' AS ESTA,
      @sucNorm AS SUC;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58020, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58021, 'OPV es obligatorio', 1;

  DECLARE @serial INT = DATEDIFF(DAY, '1899-12-30', @fcnDate);
  DECLARE @ide NVARCHAR(255) = CONCAT(@serial, @opvNorm);

  DECLARE @trn FLOAT = 0;
  DECLARE @art FLOAT = 0;
  DECLARE @difCalc MONEY = 0;

  ;WITH FoliosBase AS (
    SELECT
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS TIPO_REF,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV_REF
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.IDFOL,
      fb.AUT,
      fb.TIPO_REF
    FROM FoliosBase fb
    WHERE fb.OPV_REF = @opvNorm
      AND fb.TIPO_REF NOT IN ('CP', 'CPF', 'VA')
      AND (
        @tipoNorm = 'GLOBAL'
        OR (@tipoNorm = 'CA' AND fb.TIPO_REF = 'CA')
        OR (@tipoNorm = 'VF' AND fb.TIPO_REF = 'VF')
      )
    GROUP BY fb.IDFOL, fb.AUT, fb.TIPO_REF
  )
  SELECT
    @trn = COUNT(1),
    @art = SUM(CASE WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END)
  FROM Folios f
  LEFT JOIN dbo.PV_TICKET_LOG t ON t.IDFOL = f.IDFOL;

  SELECT @difCalc = SUM(ISNULL(e.DIFD, 0))
  FROM dbo.DAT_FORM_ENTR_OPV_SVR e
  WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
    AND UPPER(LTRIM(RTRIM(ISNULL(e.OPV, '')))) = @opvNorm
    AND CONVERT(DATE, e.FCN) = @fcnDate;

  DECLARE @opvNombre NVARCHAR(255) = NULL;

  SELECT TOP (1)
    @opvNombre = LTRIM(RTRIM(
      ISNULL(o.NOMB, '') +
      CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(o.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(o.APELP, ''))) END +
      CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(o.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(o.APELM, ''))) END
    ))
  FROM dbo.PV_OPV o
  WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IDOPV, '')))) = @opvNorm;

  SELECT TOP (1)
    @ide AS IDE,
    @opvNorm AS OPV,
    NULLIF(@opvNombre, '') AS OPV_NOMBRE,
    @dtIni AS FCN,
    ISNULL(fin.ART, ISNULL(@art, 0)) AS ART,
    ISNULL(fin.TRN, ISNULL(@trn, 0)) AS TRN,
    ISNULL(fin.DIF, ISNULL(@difCalc, 0)) AS DIF,
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(fin.ESTA, ''))), ''), 'ABIERTA') AS ESTA,
    @sucNorm AS SUC,
    @tipoNorm AS TIPO_CORTE
  FROM (SELECT 1 AS X) AS base
  LEFT JOIN dbo.DAT_FORM_FIN fin
    ON fin.IDE = @ide;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_formas_pago_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58030, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58031, 'OPV es obligatorio', 1;

  ;WITH FoliosBase AS (
    SELECT
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS TIPO_REF,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV_REF
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.IDFOL
    FROM FoliosBase fb
    WHERE fb.OPV_REF = @opvNorm
      AND (
        (@tipoNorm = 'GLOBAL' AND fb.TIPO_REF NOT IN ('CP', 'CPF', 'VA'))
        OR (@tipoNorm = 'CA' AND fb.TIPO_REF = 'CA')
        OR (@tipoNorm = 'VF' AND fb.TIPO_REF = 'VF')
      )
    GROUP BY fb.IDFOL
  ),
  Cobrado AS (
    SELECT
      dbo.fn_cg_normalize_forma(f.FORM) AS FORM,
      SUM(ISNULL(f.IMPD, 0)) AS IMPT
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN Folios fo ON fo.IDFOL = f.IDFOL
    WHERE f.FCN >= @dtIni
      AND f.FCN < @dtFin
    GROUP BY dbo.fn_cg_normalize_forma(f.FORM)
  ),
  Retiros AS (
    SELECT
      dbo.fn_cg_normalize_forma(d.FORMA) AS FORM,
      SUM(ISNULL(d.IMPF, 0)) AS IMPR
    FROM dbo.DAT_RET_CTR_SVR r
    INNER JOIN dbo.DAT_RET_DET_SVR d ON d.IDRET = r.IDRET
    WHERE UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm
      AND r.FCNR >= @dtIni
      AND r.FCNR < @dtFin
      AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
    GROUP BY dbo.fn_cg_normalize_forma(d.FORMA)
  ),
  Entregado AS (
    SELECT
      dbo.fn_cg_normalize_forma(e.FORM) AS FORM,
      SUM(ISNULL(e.IMPE, 0)) AS IMPE
    FROM dbo.DAT_FORM_ENTR_OPV_SVR e
    WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(e.OPV, '')))) = @opvNorm
      AND CONVERT(DATE, e.FCN) = @fcnDate
    GROUP BY dbo.fn_cg_normalize_forma(e.FORM)
  ),
  Catalogo AS (
    SELECT
      dbo.fn_cg_normalize_forma(df.FORM) AS FORM,
      MAX(LTRIM(RTRIM(ISNULL(df.NOM, '')))) AS NOM,
      MAX(CAST(ISNULL(df.ESTADO, 1) AS INT)) AS ESTADO
    FROM dbo.DAT_FORM df
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(df.FORM, ''))), '') IS NOT NULL
    GROUP BY dbo.fn_cg_normalize_forma(df.FORM)
  ),
  Formas AS (
    SELECT FORM FROM Catalogo
    UNION
    SELECT FORM FROM Cobrado
    UNION
    SELECT FORM FROM Retiros
    UNION
    SELECT FORM FROM Entregado
  )
  SELECT
    f.FORM,
    NULLIF(LTRIM(RTRIM(CASE WHEN LEN(ISNULL(cat.NOM, '')) >= LEN(f.FORM) THEN cat.NOM ELSE f.FORM END)), '') AS NOM,
    ISNULL(c.IMPT, 0) AS IMPT,
    ISNULL(r.IMPR, 0) AS IMPR,
    ISNULL(e.IMPE, 0) AS IMPE,
    ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) - ISNULL(e.IMPE, 0) AS DIFD,
    ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) AS TRECIBIDO,
    @tipoNorm AS TIPO_CORTE
  FROM Formas f
  LEFT JOIN Catalogo cat ON cat.FORM = f.FORM
  LEFT JOIN Cobrado c ON c.FORM = f.FORM
  LEFT JOIN Retiros r ON r.FORM = f.FORM
  LEFT JOIN Entregado e ON e.FORM = f.FORM
  WHERE NULLIF(LTRIM(RTRIM(ISNULL(f.FORM, ''))), '') IS NOT NULL
  ORDER BY
    CASE WHEN ISNULL(cat.ESTADO, 1) = 1 THEN 0 ELSE 1 END,
    ISNULL(cat.NOM, f.FORM),
    f.FORM;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_transacciones_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58040, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58041, 'OPV es obligatorio', 1;

  ;WITH FoliosBase AS (
    SELECT
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS TIPO_REF,
      ISNULL(a.IMPT, 0) AS IMPT,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV_REF,
      a.IDFOL
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.TIPO_REF AS AUT,
      fb.IMPT,
      fb.IDFOL
    FROM FoliosBase fb
    WHERE fb.OPV_REF = @opvNorm
      AND fb.TIPO_REF NOT IN ('CP', 'CPF', 'VA')
      AND (
        @tipoNorm = 'GLOBAL'
        OR (@tipoNorm = 'CA' AND fb.TIPO_REF = 'CA')
        OR (@tipoNorm = 'VF' AND fb.TIPO_REF = 'VF')
      )
    GROUP BY fb.TIPO_REF, fb.IMPT, fb.IDFOL
  )
  SELECT
    f.AUT,
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(t.[DESC], ''))), ''), f.AUT) AS [DESC],
    COUNT(1) AS CTA,
    SUM(ISNULL(f.IMPT, 0)) AS TOTAL,
    @tipoNorm AS TIPO_CORTE
  FROM Folios f
  LEFT JOIN dbo.PV_TIPO_ESTA t
    ON UPPER(LTRIM(RTRIM(ISNULL(t.TIPO, '')))) = f.AUT
  GROUP BY
    f.AUT,
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(t.[DESC], ''))), ''), f.AUT)
  ORDER BY f.AUT;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_ventas_departamento_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58050, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58051, 'OPV es obligatorio', 1;

  ;WITH FoliosBase AS (
    SELECT
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS TIPO_REF,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV_REF
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.IDFOL,
      fb.AUT,
      fb.TIPO_REF
    FROM FoliosBase fb
    WHERE fb.OPV_REF = @opvNorm
      AND fb.TIPO_REF NOT IN ('CP', 'CPF', 'VA')
      AND (
        @tipoNorm = 'GLOBAL'
        OR (@tipoNorm = 'CA' AND fb.TIPO_REF = 'CA')
        OR (@tipoNorm = 'VF' AND fb.TIPO_REF = 'VF')
      )
    GROUP BY fb.IDFOL, fb.AUT, fb.TIPO_REF
  )
  SELECT
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(d.DDEPA, ''))), ''), 'SIN DEPARTAMENTO') AS DDEPA,
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(s.DSUBD, ''))), ''), 'SIN SUBDEPARTAMENTO') AS DSUBD,
    SUM(CASE WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END) AS VTAPZS,
    SUM(
      CASE
        WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0)))
        ELSE ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0))
      END
    ) AS VTAPSOS,
    @tipoNorm AS TIPO_CORTE
  FROM Folios f
  INNER JOIN dbo.PV_TICKET_LOG t
    ON t.IDFOL = f.IDFOL
  LEFT JOIN dbo.DAT_ART a
    ON UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(t.ART, ''))))
   AND UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
  LEFT JOIN dbo.JRQ_DEPA d
    ON UPPER(LTRIM(RTRIM(ISNULL(d.DEPA, '')))) = UPPER(LTRIM(RTRIM(ISNULL(a.DEPA, ''))))
  LEFT JOIN dbo.JRQ_SUBD s
    ON UPPER(LTRIM(RTRIM(ISNULL(s.SUBD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(a.SUBD, ''))))
  GROUP BY
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(d.DDEPA, ''))), ''), 'SIN DEPARTAMENTO'),
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(s.DSUBD, ''))), ''), 'SIN SUBDEPARTAMENTO')
  HAVING
    ABS(SUM(CASE WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END)) > 0.000001
    OR ABS(SUM(
      CASE
        WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0)))
        ELSE ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0))
      END
    )) > 0.000001
  ORDER BY DDEPA, DSUBD;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_efectivo_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @sucNorm = ''
    THROW 58060, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58061, 'OPV es obligatorio', 1;

  SELECT
    ISNULL(e.DENO, 0) AS DENO,
    SUM(ISNULL(e.CTDA, 0)) AS CTDA,
    SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0)) AS EFECTIVO,
    SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0)) AS TOTAL
  FROM dbo.DAT_RET_CTR_SVR r
  INNER JOIN dbo.DAT_RET_DET_SVR d
    ON d.IDRET = r.IDRET
  INNER JOIN dbo.DAT_RET_DET_EFEC_SVR e
    ON e.IDFOR = d.ID
  WHERE UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm
    AND r.FCNR >= @dtIni
    AND r.FCNR < @dtFin
    AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
    AND dbo.fn_cg_normalize_forma(d.FORMA) = 'EFECTIVO'
  GROUP BY ISNULL(e.DENO, 0)
  HAVING ABS(SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0))) > 0.000001
  ORDER BY ISNULL(e.DENO, 0) DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_cg_opv_pendientes
  @SUC VARCHAR(25),
  @FCN DATE,
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @serial INT = DATEDIFF(DAY, '1899-12-30', @fcnDate);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58070, 'SUC es obligatorio', 1;

  ;WITH FoliosBase AS (
    SELECT
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS TIPO_REF,
      ISNULL(a.IMPT, 0) AS IMPT
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.IDFOL,
      fb.OPV,
      fb.IMPT
    FROM FoliosBase fb
    WHERE fb.TIPO_REF NOT IN ('CP', 'CPF', 'VA')
      AND (
        @tipoNorm = 'GLOBAL'
        OR (@tipoNorm = 'CA' AND fb.TIPO_REF = 'CA')
        OR (@tipoNorm = 'VF' AND fb.TIPO_REF = 'VF')
      )
    GROUP BY fb.IDFOL, fb.OPV, fb.IMPT
  ),
  Agregado AS (
    SELECT
      fb.OPV,
      COUNT(1) AS TRN,
      SUM(ISNULL(fb.IMPT, 0)) AS TOTAL
    FROM Folios fb
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(fb.OPV, ''))), '') IS NOT NULL
    GROUP BY fb.OPV
  )
  SELECT
    ag.OPV,
    NULLIF(LTRIM(RTRIM(
      ISNULL(o.NOMB, '') +
      CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(o.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(o.APELP, ''))) END +
      CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(o.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(o.APELM, ''))) END
    )), '') AS OPV_NOMBRE,
    ag.TRN,
    ag.TOTAL,
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(fin.ESTA, ''))), ''), 'ABIERTA') AS ESTA_ENTREGA,
    ISNULL(fin.IDE, CONCAT(@serial, ag.OPV)) AS IDE,
    @tipoNorm AS TIPO_CORTE
  FROM Agregado ag
  LEFT JOIN dbo.PV_OPV o
    ON UPPER(LTRIM(RTRIM(ISNULL(o.IDOPV, '')))) = ag.OPV
  LEFT JOIN dbo.DAT_FORM_FIN fin
    ON fin.IDE = CONCAT(@serial, ag.OPV)
  WHERE ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(fin.ESTA, ''))), ''), 'ABIERTA') <> 'CERRADO'
  ORDER BY ag.OPV;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_cg_opv_pendiente_transacciones
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58080, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58081, 'OPV es obligatorio', 1;

  ;WITH FoliosBase AS (
    SELECT
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      '')))) AS OPV,
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS AUT,
      UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) AS ESTA,
      ISNULL(a.IMPT, 0) AS TOTAL,
      a.FCNM
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.OPV,
      fb.IDFOL,
      fb.AUT,
      fb.ESTA,
      fb.TOTAL,
      fb.FCNM
    FROM FoliosBase fb
    WHERE fb.OPV = @opvNorm
      AND fb.AUT NOT IN ('CP', 'CPF', 'VA')
      AND (
        @tipoNorm = 'GLOBAL'
        OR (@tipoNorm = 'CA' AND fb.AUT = 'CA')
        OR (@tipoNorm = 'VF' AND fb.AUT = 'VF')
      )
    GROUP BY fb.OPV, fb.IDFOL, fb.AUT, fb.ESTA, fb.TOTAL, fb.FCNM
  )
  SELECT
    f.OPV,
    f.IDFOL,
    f.AUT,
    ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(t.[DESC], ''))), ''), f.AUT) AS AUT_DESC,
    f.ESTA,
    f.TOTAL,
    f.FCNM,
    @tipoNorm AS TIPO_CORTE
  FROM Folios f
  LEFT JOIN dbo.PV_TIPO_ESTA t
    ON UPPER(LTRIM(RTRIM(ISNULL(t.TIPO, '')))) = f.AUT
  ORDER BY f.FCNM, f.IDFOL;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_cg_cerrar_entrega_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TER NVARCHAR(255) = NULL,
  @USER NVARCHAR(255) = NULL,
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL',
  @ENTREGAS_JSON NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @terNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@TER, ''))), '');
  DECLARE @userNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@USER, ''))), '');
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @fechaProceso DATETIME = GETDATE();

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58100, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58101, 'OPV es obligatorio', 1;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    DECLARE @valid TABLE (
      ok BIT,
      [status] VARCHAR(20),
      [message] NVARCHAR(500),
      pagadoCount INT,
      totalTransacciones INT
    );

    INSERT INTO @valid
    EXEC dbo.sp_cg_validar_opv_para_entrega
      @SUC = @sucNorm,
      @FCN = @fcnDate,
      @OPV = @opvNorm;

    IF EXISTS (SELECT 1 FROM @valid WHERE ok = 0)
    BEGIN
      DECLARE @msgValidacion NVARCHAR(500) = ISNULL((SELECT TOP 1 [message] FROM @valid), 'No se puede preparar entrega OPV');
      THROW 58102, @msgValidacion, 1;
    END;

    DECLARE @serial INT = DATEDIFF(DAY, '1899-12-30', @fcnDate);
    DECLARE @ide NVARCHAR(255) = CONCAT(@serial, @opvNorm);

    IF EXISTS (
      SELECT 1
      FROM dbo.DAT_FORM_FIN WITH (UPDLOCK, HOLDLOCK)
      WHERE IDE = @ide
        AND UPPER(LTRIM(RTRIM(ISNULL(ESTA, '')))) = 'CERRADO'
    )
    BEGIN
      SELECT TOP (1)
        IDE,
        OPV,
        FCN,
        ART,
        TRN,
        DIF,
        ESTA,
        SUC,
        CAST(0 AS MONEY) AS MOV_IMPT,
        CAST(NULL AS NVARCHAR(255)) AS MOV_NDOC
      FROM dbo.DAT_FORM_FIN
      WHERE IDE = @ide;

      IF @startedTran = 1 AND @@TRANCOUNT > 0
        COMMIT TRANSACTION;

      RETURN;
    END;

    DECLARE @entregas TABLE (
      FORM NVARCHAR(255) PRIMARY KEY,
      IMPE MONEY NULL
    );

    IF ISJSON(@ENTREGAS_JSON) = 1
    BEGIN
      INSERT INTO @entregas (FORM, IMPE)
      SELECT
        dbo.fn_cg_normalize_forma(src.form) AS FORM,
        SUM(ISNULL(src.impe, 0)) AS IMPE
      FROM OPENJSON(@ENTREGAS_JSON)
      WITH (
        form NVARCHAR(255) '$.form',
        impe MONEY '$.impe'
      ) src
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(src.form, ''))), '') IS NOT NULL
      GROUP BY dbo.fn_cg_normalize_forma(src.form);
    END;

    DECLARE @formas TABLE (
      FORM NVARCHAR(255) PRIMARY KEY,
      NOM NVARCHAR(255) NULL,
      IMPT MONEY NOT NULL,
      IMPR MONEY NOT NULL,
      IMPE MONEY NOT NULL,
      DIFD MONEY NOT NULL,
      TRECIBIDO MONEY NOT NULL
    );

    ;WITH Folios AS (
      SELECT
        a.IDFOL,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT
      FROM dbo.PV_CTR_FOL_ASVR a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
        AND a.FCNM >= @dtIni
        AND a.FCNM < @dtFin
        AND UPPER(LTRIM(RTRIM(ISNULL(
          CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
            ELSE a.OPV
          END,
        '')))) = @opvNorm
        AND (
          (@tipoNorm = 'GLOBAL' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) NOT IN ('CP', 'CPF', 'VA'))
          OR (@tipoNorm = 'CA' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'CA')
          OR (@tipoNorm = 'VF' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'VF')
        )
    ),
    Cobrado AS (
      SELECT
        dbo.fn_cg_normalize_forma(f.FORM) AS FORM,
        SUM(ISNULL(f.IMPD, 0)) AS IMPT
      FROM dbo.PV_CTR_FOL_FORM f
      INNER JOIN Folios fo ON fo.IDFOL = f.IDFOL
      GROUP BY dbo.fn_cg_normalize_forma(f.FORM)
    ),
    Retiros AS (
      SELECT
        dbo.fn_cg_normalize_forma(d.FORMA) AS FORM,
        SUM(ISNULL(d.IMPF, 0)) AS IMPR
      FROM dbo.DAT_RET_CTR_SVR r
      INNER JOIN dbo.DAT_RET_DET_SVR d ON d.IDRET = r.IDRET
      WHERE UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm
        AND r.FCNR >= @dtIni
        AND r.FCNR < @dtFin
        AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
      GROUP BY dbo.fn_cg_normalize_forma(d.FORMA)
    ),
    EntregadoPrevio AS (
      SELECT
        dbo.fn_cg_normalize_forma(e.FORM) AS FORM,
        SUM(ISNULL(e.IMPE, 0)) AS IMPE
      FROM dbo.DAT_FORM_ENTR_OPV_SVR e
      WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(e.OPV, '')))) = @opvNorm
        AND CONVERT(DATE, e.FCN) = @fcnDate
      GROUP BY dbo.fn_cg_normalize_forma(e.FORM)
    ),
    Catalogo AS (
      SELECT
        dbo.fn_cg_normalize_forma(df.FORM) AS FORM,
        MAX(LTRIM(RTRIM(ISNULL(df.NOM, '')))) AS NOM,
        MAX(CAST(ISNULL(df.ESTADO, 1) AS INT)) AS ESTADO
      FROM dbo.DAT_FORM df
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(df.FORM, ''))), '') IS NOT NULL
      GROUP BY dbo.fn_cg_normalize_forma(df.FORM)
    ),
    Formas AS (
      SELECT FORM FROM Catalogo
      UNION
      SELECT FORM FROM Cobrado
      UNION
      SELECT FORM FROM Retiros
      UNION
      SELECT FORM FROM EntregadoPrevio
      UNION
      SELECT FORM FROM @entregas
    )
    INSERT INTO @formas (FORM, NOM, IMPT, IMPR, IMPE, DIFD, TRECIBIDO)
    SELECT
      f.FORM,
      NULLIF(LTRIM(RTRIM(CASE WHEN LEN(ISNULL(cat.NOM, '')) >= LEN(f.FORM) THEN cat.NOM ELSE f.FORM END)), '') AS NOM,
      ISNULL(c.IMPT, 0) AS IMPT,
      ISNULL(r.IMPR, 0) AS IMPR,
      ISNULL(ej.IMPE, ISNULL(ep.IMPE, 0)) AS IMPE,
      ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) - ISNULL(ej.IMPE, ISNULL(ep.IMPE, 0)) AS DIFD,
      ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) AS TRECIBIDO
    FROM Formas f
    LEFT JOIN Catalogo cat ON cat.FORM = f.FORM
    LEFT JOIN Cobrado c ON c.FORM = f.FORM
    LEFT JOIN Retiros r ON r.FORM = f.FORM
    LEFT JOIN EntregadoPrevio ep ON ep.FORM = f.FORM
    LEFT JOIN @entregas ej ON ej.FORM = f.FORM
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(f.FORM, ''))), '') IS NOT NULL;

    DECLARE @trn FLOAT = 0;
    DECLARE @art FLOAT = 0;

    ;WITH Folios AS (
      SELECT
        a.IDFOL,
        UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT
      FROM dbo.PV_CTR_FOL_ASVR a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
        AND a.FCNM >= @dtIni
        AND a.FCNM < @dtFin
        AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) NOT IN ('CP', 'CPF', 'VA')
        AND UPPER(LTRIM(RTRIM(ISNULL(
          CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
            ELSE a.OPV
          END,
        '')))) = @opvNorm
        AND (
          @tipoNorm = 'GLOBAL'
          OR (@tipoNorm = 'CA' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'CA')
          OR (@tipoNorm = 'VF' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'VF')
        )
    )
    SELECT
      @trn = COUNT(1),
      @art = SUM(CASE WHEN f.AUT IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END)
    FROM Folios f
    LEFT JOIN dbo.PV_TICKET_LOG t ON t.IDFOL = f.IDFOL;

    DECLARE @difTotal MONEY = ISNULL((SELECT SUM(ISNULL(DIFD, 0)) FROM @formas), 0);

    IF EXISTS (SELECT 1 FROM dbo.DAT_FORM_FIN WITH (UPDLOCK, HOLDLOCK) WHERE IDE = @ide)
    BEGIN
      UPDATE dbo.DAT_FORM_FIN
      SET
        OPV = @opvNorm,
        FCN = @dtIni,
        ART = ISNULL(@art, 0),
        TRN = ISNULL(@trn, 0),
        DIF = @difTotal,
        ESTA = 'CERRADO',
        SUC = @sucNorm
      WHERE IDE = @ide;
    END
    ELSE
    BEGIN
      INSERT INTO dbo.DAT_FORM_FIN (IDE, OPV, FCN, ART, TRN, DIF, ESTA, SUC)
      VALUES (@ide, @opvNorm, @dtIni, ISNULL(@art, 0), ISNULL(@trn, 0), @difTotal, 'CERRADO', @sucNorm);
    END;

    DELETE FROM dbo.DAT_FORM_ENTR_OPV_SVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
      AND CONVERT(DATE, FCN) = @fcnDate;

    INSERT INTO dbo.DAT_FORM_ENTR_OPV_SVR (
      IDE,
      FCN,
      OPV,
      TER,
      FORM,
      IMPT,
      IMPR,
      IMPE,
      DIFD,
      SUC
    )
    SELECT
      CONCAT(
        @serial,
        CASE
          WHEN FORM = 'CHEQUE' THEN 'CHE'
          WHEN FORM = 'CREDITO' THEN 'CRE'
          WHEN FORM = 'DEPOSITO 3RO' THEN 'DEP'
          WHEN FORM = 'DEUDOR' THEN 'DEU'
          WHEN FORM = 'EFECTIVO' THEN 'EFE'
          WHEN FORM = 'TARJETA' THEN 'TAR'
          WHEN FORM = 'TRANSFERENCIA' THEN 'TRA'
          ELSE LEFT(REPLACE(FORM, ' ', '') + 'XXX', 3)
        END,
        @opvNorm
      ) AS IDE,
      @dtIni AS FCN,
      @opvNorm AS OPV,
      @terNorm AS TER,
      FORM,
      IMPT,
      IMPR,
      IMPE,
      DIFD,
      @sucNorm AS SUC
    FROM @formas;
    DECLARE @saldoMov MONEY = 0;

    SELECT @saldoMov = ISNULL(SUM(ISNULL(c.IMPT, 0)), 0)
    FROM dbo.DAT_CTRL_CTAS c
    WHERE UPPER(LTRIM(RTRIM(ISNULL(c.CTA, '')))) = '704010003'
      AND UPPER(LTRIM(RTRIM(ISNULL(c.IDFOL, '')))) = UPPER(@ide)
      AND (
        UPPER(LTRIM(RTRIM(ISNULL(c.RTXT, '')))) LIKE UPPER('DIFERENCIA EN ENTREGA OPV REF ' + @ide + '%')
        OR UPPER(LTRIM(RTRIM(ISNULL(c.RTXT, '')))) LIKE UPPER('REVERSA ENTREGA OPV REF ' + @ide + '%')
      );

    DECLARE @deltaMov MONEY = @difTotal - ISNULL(@saldoMov, 0);
    DECLARE @movNdoc NVARCHAR(255) = NULL;

    IF ABS(ISNULL(@deltaMov, 0)) > 0.000001
    BEGIN
      DECLARE @movClase NVARCHAR(10) = CASE WHEN @deltaMov < 0 THEN '901' ELSE '902' END;
      DECLARE @lockResult INT;
      DECLARE @nextNdoc INT;

      EXEC @lockResult = sp_getapplock
        @Resource = 'CG_NDOC_704010003',
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 10000;

      IF @lockResult < 0
        THROW 58103, 'No se pudo obtener lock para generar NDOC de Caja General', 1;

      SELECT @nextNdoc = ISNULL(MAX(TRY_CONVERT(INT, LEFT(NDOC, 8))), 90000000) + 1
      FROM dbo.DAT_CTRL_CTAS WITH (UPDLOCK, HOLDLOCK)
      WHERE NDOC LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]GT%';

      SET @movNdoc = CONCAT(RIGHT(CONCAT('00000000', @nextNdoc), 8), 'GT', @sucNorm);

      INSERT INTO dbo.DAT_CTR_DOC (DOC, CLSMOV, FCND, [USER], STAT)
      VALUES (@movNdoc, @movClase, @fechaProceso, ISNULL(@userNorm, @opvNorm), 'V');

      INSERT INTO dbo.DAT_CTRL_CTAS (
        NDOC,
        CTA,
        CLIENT,
        FCND,
        CLSD,
        IDFOL,
        RTXT,
        IMPT,
        SUC,
        IDOPV
      )
      VALUES (
        @movNdoc,
        '704010003',
        TRY_CONVERT(FLOAT, @opvNorm),
        @fechaProceso,
        @movClase,
        @ide,
        CONCAT('Diferencia en entrega OPV ref ', @ide),
        @deltaMov,
        @sucNorm,
        @opvNorm
      );
    END;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @ide AS IDE,
      @opvNorm AS OPV,
      @dtIni AS FCN,
      ISNULL(@art, 0) AS ART,
      ISNULL(@trn, 0) AS TRN,
      @difTotal AS DIF,
      'CERRADO' AS ESTA,
      @sucNorm AS SUC,
      ISNULL(@deltaMov, 0) AS MOV_IMPT,
      @movNdoc AS MOV_NDOC,
      @tipoNorm AS TIPO_CORTE;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_reactivar_entrega_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TER NVARCHAR(255) = NULL,
  @USER NVARCHAR(255) = NULL,
  @ALLOW_HISTORIC_REACTIVATION BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @terNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@TER, ''))), '');
  DECLARE @userNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@USER, ''))), '');
  DECLARE @allowHistoric BIT = CASE WHEN ISNULL(@ALLOW_HISTORIC_REACTIVATION, 0) = 1 THEN 1 ELSE 0 END;
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @fechaProceso DATETIME = GETDATE();
  DECLARE @today DATE = CONVERT(DATE, GETDATE());

  IF @sucNorm = ''
    THROW 58120, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58121, 'OPV es obligatorio', 1;

  IF @fcnDate <> @today AND @allowHistoric = 0
    THROW 58122, 'Solo se permite reactivar entregas de la fecha operable actual', 1;

  DECLARE @serial INT = DATEDIFF(DAY, '1899-12-30', @fcnDate);
  DECLARE @ide NVARCHAR(255) = CONCAT(@serial, @opvNorm);

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.DAT_FORM_FIN WITH (UPDLOCK, HOLDLOCK) WHERE IDE = @ide)
      THROW 58123, 'No existe entrega OPV para reactivar', 1;

    IF EXISTS (
      SELECT 1
      FROM dbo.DAT_FORM_FIN
      WHERE IDE = @ide
        AND UPPER(LTRIM(RTRIM(ISNULL(ESTA, '')))) <> 'CERRADO'
    )
      THROW 58124, 'La entrega no está cerrada', 1;

    UPDATE dbo.DAT_FORM_FIN
    SET
      ESTA = 'ABIERTA',
      DIF = NULL,
      FCN = @dtIni,
      SUC = @sucNorm,
      OPV = @opvNorm
    WHERE IDE = @ide;

    DELETE FROM dbo.DAT_FORM_ENTR_OPV_SVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
      AND CONVERT(DATE, FCN) = @fcnDate;

    DECLARE @saldoMov MONEY = 0;

    SELECT @saldoMov = ISNULL(SUM(ISNULL(c.IMPT, 0)), 0)
    FROM dbo.DAT_CTRL_CTAS c
    WHERE UPPER(LTRIM(RTRIM(ISNULL(c.CTA, '')))) = '704010003'
      AND UPPER(LTRIM(RTRIM(ISNULL(c.IDFOL, '')))) = UPPER(@ide)
      AND (
        UPPER(LTRIM(RTRIM(ISNULL(c.RTXT, '')))) LIKE UPPER('DIFERENCIA EN ENTREGA OPV REF ' + @ide + '%')
        OR UPPER(LTRIM(RTRIM(ISNULL(c.RTXT, '')))) LIKE UPPER('REVERSA ENTREGA OPV REF ' + @ide + '%')
      );

    DECLARE @deltaMov MONEY = -ISNULL(@saldoMov, 0);
    DECLARE @movNdoc NVARCHAR(255) = NULL;

    IF ABS(ISNULL(@deltaMov, 0)) > 0.000001
    BEGIN
      DECLARE @movClase NVARCHAR(10) = CASE WHEN @deltaMov < 0 THEN '901' ELSE '902' END;
      DECLARE @lockResult INT;
      DECLARE @nextNdoc INT;

      EXEC @lockResult = sp_getapplock
        @Resource = 'CG_NDOC_704010003',
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 10000;

      IF @lockResult < 0
        THROW 58125, 'No se pudo obtener lock para generar NDOC de reversa Caja General', 1;

      SELECT @nextNdoc = ISNULL(MAX(TRY_CONVERT(INT, LEFT(NDOC, 8))), 90000000) + 1
      FROM dbo.DAT_CTRL_CTAS WITH (UPDLOCK, HOLDLOCK)
      WHERE NDOC LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]GT%';

      SET @movNdoc = CONCAT(RIGHT(CONCAT('00000000', @nextNdoc), 8), 'GT', @sucNorm);

      INSERT INTO dbo.DAT_CTR_DOC (DOC, CLSMOV, FCND, [USER], STAT)
      VALUES (@movNdoc, @movClase, @fechaProceso, ISNULL(@userNorm, @opvNorm), 'V');

      INSERT INTO dbo.DAT_CTRL_CTAS (
        NDOC,
        CTA,
        CLIENT,
        FCND,
        CLSD,
        IDFOL,
        RTXT,
        IMPT,
        SUC,
        IDOPV
      )
      VALUES (
        @movNdoc,
        '704010003',
        TRY_CONVERT(FLOAT, @opvNorm),
        @fechaProceso,
        @movClase,
        @ide,
        CONCAT('Reversa entrega OPV ref ', @ide),
        @deltaMov,
        @sucNorm,
        @opvNorm
      );
    END;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    SELECT
      @ide AS IDE,
      @opvNorm AS OPV,
      @dtIni AS FCN,
      CAST(NULL AS FLOAT) AS ART,
      CAST(NULL AS FLOAT) AS TRN,
      CAST(NULL AS MONEY) AS DIF,
      'ABIERTA' AS ESTA,
      @sucNorm AS SUC,
      ISNULL(@deltaMov, 0) AS MOV_IMPT,
      @movNdoc AS MOV_NDOC,
      @terNorm AS TER;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_global_dia
  @SUC VARCHAR(25),
  @FCN DATE,
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL'))));
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), CONVERT(DATE, GETDATE()));
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58140, 'SUC es obligatorio', 1;

  DECLARE @pendientes TABLE (
    OPV NVARCHAR(255),
    OPV_NOMBRE NVARCHAR(255),
    TRN FLOAT,
    TOTAL MONEY,
    ESTA_ENTREGA NVARCHAR(255),
    IDE NVARCHAR(255),
    TIPO_CORTE VARCHAR(10)
  );

  INSERT INTO @pendientes
  EXEC dbo.sp_cg_opv_pendientes
    @SUC = @sucNorm,
    @FCN = @fcnDate,
    @TIPO_CORTE = @tipoNorm;

  ;WITH FoliosBase AS (
    SELECT
      a.IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT,
      UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.ORIGEN_AUT, ''))), '') IS NOT NULL THEN a.ORIGEN_AUT
          ELSE a.AUT
        END,
      '')))) AS TIPO_REF,
      ISNULL(a.IMPT, 0) AS IMPT
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN dbo.PV_CTR_FOL_ASVR a
      ON a.IDFOL = f.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
      AND f.FCN >= @dtIni
      AND f.FCN < @dtFin
  ),
  Folios AS (
    SELECT
      fb.IDFOL,
      fb.AUT,
      fb.TIPO_REF,
      fb.IMPT
    FROM FoliosBase fb
    WHERE fb.TIPO_REF NOT IN ('CP', 'CPF', 'VA')
      AND (
        @tipoNorm = 'GLOBAL'
        OR (@tipoNorm = 'CA' AND fb.TIPO_REF = 'CA')
        OR (@tipoNorm = 'VF' AND fb.TIPO_REF = 'VF')
      )
    GROUP BY fb.IDFOL, fb.AUT, fb.TIPO_REF, fb.IMPT
  ),
  Cobrado AS (
    SELECT
      dbo.fn_cg_normalize_forma(f.FORM) AS FORM,
      SUM(ISNULL(f.IMPD, 0)) AS IMPT
    FROM dbo.PV_CTR_FOL_FORM f
    INNER JOIN Folios fo ON fo.IDFOL = f.IDFOL
    WHERE f.FCN >= @dtIni
      AND f.FCN < @dtFin
    GROUP BY dbo.fn_cg_normalize_forma(f.FORM)
  ),
  Retiros AS (
    SELECT
      dbo.fn_cg_normalize_forma(d.FORMA) AS FORM,
      SUM(ISNULL(d.IMPF, 0)) AS IMPR
    FROM dbo.DAT_RET_CTR_SVR r
    INNER JOIN dbo.DAT_RET_DET_SVR d ON d.IDRET = r.IDRET
    WHERE UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) IN (
      SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(
        CASE
          WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
          ELSE a.OPV
        END,
      ''))))
      FROM dbo.PV_CTR_FOL_ASVR a
      INNER JOIN Folios fo
        ON fo.IDFOL = a.IDFOL
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
    )
      AND r.FCNR >= @dtIni
      AND r.FCNR < @dtFin
      AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
    GROUP BY dbo.fn_cg_normalize_forma(d.FORMA)
  ),
  Entregado AS (
    SELECT
      dbo.fn_cg_normalize_forma(e.FORM) AS FORM,
      SUM(ISNULL(e.IMPE, 0)) AS IMPE
    FROM dbo.DAT_FORM_ENTR_OPV_SVR e
    WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
      AND CONVERT(DATE, e.FCN) = @fcnDate
    GROUP BY dbo.fn_cg_normalize_forma(e.FORM)
  ),
  Catalogo AS (
    SELECT
      dbo.fn_cg_normalize_forma(df.FORM) AS FORM,
      MAX(LTRIM(RTRIM(ISNULL(df.NOM, '')))) AS NOM,
      MAX(CAST(ISNULL(df.ESTADO, 1) AS INT)) AS ESTADO
    FROM dbo.DAT_FORM df
    WHERE NULLIF(LTRIM(RTRIM(ISNULL(df.FORM, ''))), '') IS NOT NULL
    GROUP BY dbo.fn_cg_normalize_forma(df.FORM)
  ),
  Formas AS (
    SELECT FORM FROM Catalogo
    UNION
    SELECT FORM FROM Cobrado
    UNION
    SELECT FORM FROM Retiros
    UNION
    SELECT FORM FROM Entregado
  ),
  Transacciones AS (
    SELECT
      f.TIPO_REF AS AUT,
      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(t.[DESC], ''))), ''), f.TIPO_REF) AS [DESC],
      COUNT(1) AS CTA,
      SUM(ISNULL(f.IMPT, 0)) AS TOTAL
    FROM Folios f
    LEFT JOIN dbo.PV_TIPO_ESTA t
      ON UPPER(LTRIM(RTRIM(ISNULL(t.TIPO, '')))) = f.TIPO_REF
    GROUP BY
      f.TIPO_REF,
      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(t.[DESC], ''))), ''), f.TIPO_REF)
  ),
  Ventas AS (
    SELECT
      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(d.DDEPA, ''))), ''), 'SIN DEPARTAMENTO') AS DDEPA,
      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(s.DSUBD, ''))), ''), 'SIN SUBDEPARTAMENTO') AS DSUBD,
      SUM(CASE WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END) AS VTAPZS,
      SUM(
        CASE
          WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0)))
          ELSE ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0))
        END
      ) AS VTAPSOS
    FROM Folios f
    INNER JOIN dbo.PV_TICKET_LOG t
      ON t.IDFOL = f.IDFOL
    LEFT JOIN dbo.DAT_ART a
      ON UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(t.ART, ''))))
     AND UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
    LEFT JOIN dbo.JRQ_DEPA d
      ON UPPER(LTRIM(RTRIM(ISNULL(d.DEPA, '')))) = UPPER(LTRIM(RTRIM(ISNULL(a.DEPA, ''))))
    LEFT JOIN dbo.JRQ_SUBD s
      ON UPPER(LTRIM(RTRIM(ISNULL(s.SUBD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(a.SUBD, ''))))
    GROUP BY
      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(d.DDEPA, ''))), ''), 'SIN DEPARTAMENTO'),
      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(s.DSUBD, ''))), ''), 'SIN SUBDEPARTAMENTO')
    HAVING
      ABS(SUM(CASE WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.CTD, 0)) ELSE ISNULL(t.CTD, 0) END)) > 0.000001
      OR ABS(SUM(
        CASE
          WHEN f.TIPO_REF IN ('DF', 'CD') THEN -ABS(ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0)))
          ELSE ISNULL(t.PVTAT, ISNULL(t.CTD, 0) * ISNULL(t.PVTA, 0))
        END
      )) > 0.000001
  ),
  Efectivo AS (
    SELECT
      ISNULL(e.DENO, 0) AS DENO,
      SUM(ISNULL(e.CTDA, 0)) AS CTDA,
      SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0)) AS EFECTIVO,
      SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0)) AS TOTAL
    FROM dbo.DAT_RET_CTR_SVR r
    INNER JOIN dbo.DAT_RET_DET_SVR d
      ON d.IDRET = r.IDRET
    INNER JOIN dbo.DAT_RET_DET_EFEC_SVR e
      ON e.IDFOR = d.ID
    WHERE r.FCNR >= @dtIni
      AND r.FCNR < @dtFin
      AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
      AND dbo.fn_cg_normalize_forma(d.FORMA) = 'EFECTIVO'
    GROUP BY ISNULL(e.DENO, 0)
    HAVING ABS(SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0))) > 0.000001
  )
  SELECT
    @sucNorm AS SUC,
    @fcnDate AS FCN,
    @tipoNorm AS TIPO_CORTE,
    ISNULL((
      SELECT
        f.FORM,
        NULLIF(LTRIM(RTRIM(CASE WHEN LEN(ISNULL(cat.NOM, '')) >= LEN(f.FORM) THEN cat.NOM ELSE f.FORM END)), '') AS NOM,
        ISNULL(c.IMPT, 0) AS IMPT,
        ISNULL(r.IMPR, 0) AS IMPR,
        ISNULL(e.IMPE, 0) AS IMPE,
        ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) - ISNULL(e.IMPE, 0) AS DIFD,
        ISNULL(c.IMPT, 0) - ISNULL(r.IMPR, 0) AS TRECIBIDO
      FROM Formas f
      LEFT JOIN Catalogo cat ON cat.FORM = f.FORM
      LEFT JOIN Cobrado c ON c.FORM = f.FORM
      LEFT JOIN Retiros r ON r.FORM = f.FORM
      LEFT JOIN Entregado e ON e.FORM = f.FORM
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(f.FORM, ''))), '') IS NOT NULL
      ORDER BY
        CASE WHEN ISNULL(cat.ESTADO, 1) = 1 THEN 0 ELSE 1 END,
        ISNULL(cat.NOM, f.FORM),
        f.FORM
      FOR JSON PATH
    ), '[]') AS FORMAS_JSON,
    ISNULL((
      SELECT AUT, [DESC], CTA, TOTAL
      FROM Transacciones
      ORDER BY AUT
      FOR JSON PATH
    ), '[]') AS TRANSACCIONES_JSON,
    ISNULL((
      SELECT DDEPA, DSUBD, VTAPZS, VTAPSOS
      FROM Ventas
      ORDER BY DDEPA, DSUBD
      FOR JSON PATH
    ), '[]') AS VENTAS_JSON,
    ISNULL((
      SELECT DENO, CTDA, EFECTIVO, TOTAL
      FROM Efectivo
      ORDER BY DENO DESC
      FOR JSON PATH
    ), '[]') AS EFECTIVO_JSON,
    ISNULL((
      SELECT OPV, OPV_NOMBRE, TRN, TOTAL, ESTA_ENTREGA, IDE
      FROM @pendientes
      ORDER BY OPV
      FOR JSON PATH
    ), '[]') AS OPV_PENDIENTES_JSON,
    CAST(CASE WHEN EXISTS (SELECT 1 FROM @pendientes) THEN 1 ELSE 0 END AS bit) AS HAS_PENDING_OPV;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_cg_reporte_entrega_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255),
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @header TABLE (
    IDE NVARCHAR(255),
    OPV NVARCHAR(255),
    OPV_NOMBRE NVARCHAR(255),
    FCN DATETIME,
    ART FLOAT,
    TRN FLOAT,
    DIF MONEY,
    ESTA NVARCHAR(255),
    SUC VARCHAR(25),
    TIPO_CORTE VARCHAR(10)
  );

  DECLARE @formas TABLE (
    FORM NVARCHAR(255),
    NOM NVARCHAR(255),
    IMPT MONEY,
    IMPR MONEY,
    IMPE MONEY,
    DIFD MONEY,
    TRECIBIDO MONEY,
    TIPO_CORTE VARCHAR(10)
  );

  DECLARE @transacciones TABLE (
    AUT NVARCHAR(255),
    [DESC] NVARCHAR(255),
    CTA FLOAT,
    TOTAL MONEY,
    TIPO_CORTE VARCHAR(10)
  );

  DECLARE @ventas TABLE (
    DDEPA NVARCHAR(255),
    DSUBD NVARCHAR(255),
    VTAPZS FLOAT,
    VTAPSOS MONEY,
    TIPO_CORTE VARCHAR(10)
  );

  DECLARE @efectivo TABLE (
    DENO MONEY,
    CTDA FLOAT,
    EFECTIVO MONEY,
    TOTAL MONEY
  );

  INSERT INTO @header
  EXEC dbo.sp_cg_resumen_opv
    @SUC = @SUC,
    @FCN = @FCN,
    @OPV = @OPV,
    @TIPO_CORTE = @TIPO_CORTE;

  INSERT INTO @formas
  EXEC dbo.sp_cg_resumen_formas_pago_opv
    @SUC = @SUC,
    @FCN = @FCN,
    @OPV = @OPV,
    @TIPO_CORTE = @TIPO_CORTE;

  INSERT INTO @transacciones
  EXEC dbo.sp_cg_resumen_transacciones_opv
    @SUC = @SUC,
    @FCN = @FCN,
    @OPV = @OPV,
    @TIPO_CORTE = @TIPO_CORTE;

  INSERT INTO @ventas
  EXEC dbo.sp_cg_resumen_ventas_departamento_opv
    @SUC = @SUC,
    @FCN = @FCN,
    @OPV = @OPV,
    @TIPO_CORTE = @TIPO_CORTE;

  INSERT INTO @efectivo
  EXEC dbo.sp_cg_resumen_efectivo_opv
    @SUC = @SUC,
    @FCN = @FCN,
    @OPV = @OPV;

  SELECT
    ISNULL((SELECT TOP 1 * FROM @header FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), '{}') AS HEADER_JSON,
    ISNULL((SELECT * FROM @formas ORDER BY FORM FOR JSON PATH), '[]') AS FORMAS_JSON,
    ISNULL((SELECT * FROM @transacciones ORDER BY AUT FOR JSON PATH), '[]') AS TRANSACCIONES_JSON,
    ISNULL((SELECT * FROM @ventas ORDER BY DDEPA, DSUBD FOR JSON PATH), '[]') AS VENTAS_JSON,
    ISNULL((SELECT * FROM @efectivo ORDER BY DENO DESC FOR JSON PATH), '[]') AS EFECTIVO_JSON,
    @SUC AS SUC,
    @FCN AS FCN,
    @OPV AS OPV,
    UPPER(LTRIM(RTRIM(ISNULL(@TIPO_CORTE, 'GLOBAL')))) AS TIPO_CORTE,
    GETDATE() AS GENERATED_AT;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_cg_reporte_entrega_global
  @SUC VARCHAR(25),
  @FCN DATE,
  @TIPO_CORTE VARCHAR(10) = 'GLOBAL'
AS
BEGIN
  SET NOCOUNT ON;
  EXEC dbo.sp_cg_resumen_global_dia
    @SUC = @SUC,
    @FCN = @FCN,
    @TIPO_CORTE = @TIPO_CORTE;
END;
GO
