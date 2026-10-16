/*
  Migration: 2026-10-16 OPV withdrawals use Mexico business-day boundaries.
  Target: IOELOCAL primary SQL instance (host dd7842d7ba7e; connect through 172.16.100.40:1434).
  Scope: eight Caja General / Retiros stored procedures only.
  Preserve: source DAT_RET_CTR_SVR.FCNR remains UTC; no historical source rows are rewritten.
  The open delivery sync for DF01/5094/2026-10-15 is a separate post-migration operation.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'IOELOCAL' THROW 58250, 'Migration requires IOELOCAL database', 1;
IF CONVERT(nvarchar(128), SERVERPROPERTY('MachineName')) <> N'dd7842d7ba7e' THROW 58251, 'Migration target server identity mismatch', 1;
IF NOT EXISTS (SELECT 1 FROM sys.time_zone_info WHERE name = N'Central Standard Time (Mexico)') THROW 58252, 'Mexico time zone is unavailable on target SQL Server', 1;
BEGIN TRANSACTION;
GO
DECLARE @lockResult int;
EXEC @lockResult = sp_getapplock @Resource=N'IOE_CG_RETIROS_TZ_MEXICO_20261016', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=30000;
IF @lockResult < 0 THROW 58253, 'Could not lock Caja General timezone migration', 1;
CREATE TABLE #expected (name sysname PRIMARY KEY, oldHash varchar(64) NOT NULL, newHash varchar(64) NOT NULL, marker nvarchar(100) NOT NULL);
INSERT INTO #expected (name,oldHash,newHash,marker) VALUES
  (N'sp_cg_sync_entrega_opv_abierta','F78BD591F0235705E46F9ABF22D82D430AB8FF9709B547FD2825DC1BAFD2CB17','B511968EC50F2A9B239DD9AA01B0C865A24336964B0D9AC7977C696DEAF89489',N'@retirosInicioUtc'),
  (N'sp_cg_resumen_formas_pago_opv','70306333482E4BEEEDA441E0E08783E10DA4FEECA06B865486A9F4885DA47E71','15CF24432FC58AE2D5620941984417DFD34378030A50EF58C9EC8BD20C97F9F3',N'@retirosInicioUtc'),
  (N'sp_cg_resumen_efectivo_opv','FA2F3427660E9C0CD612B3C5C9B253151AE00B3457A371709AF7F3D9BC25D15F','2278648E3EFE9E37F5CE80D9F6C22CA6AD53A845DD6365FEC2B62563A8E42CA6',N'@retirosInicioUtc'),
  (N'sp_cg_cerrar_entrega_opv','E6D4D542606C38E7D7CE7D38DF981A1D3D671593C47309383705339EE544E60C','6B82C0F5BF68F5ACF5BC5B9E587F3805FA53D15A0CA0C97E58B8EA9A8CE61F28',N'@retirosInicioUtc'),
  (N'sp_cg_reactivar_entrega_opv','9F651560333E676A4258BCCFF1A24D1CF66E03C5E8719EA43A7E1A72A18A653C','0D55EC16A1A3DA983638DDEF1CCED36B2056B001F026A593996CFD64D67B5EFA',N'@hoyMexico'),
  (N'sp_cg_resumen_global_dia','D892036300F9A573D9C08C4CF28CA5F728B1C9240C0B030349EE39B771420A48','697014F856DAA31755A05F0FA68EBB699B3B4806F5826C9D1BA6DC0EEA031BC5',N'@retirosInicioUtc'),
  (N'sp_ret_create','A487207994549CB1BDB285A6F13869FBC4A892DA55A45673B0BCFA4E7DD01354','4257A7908FE669746D0896FDA4A02ACB3A76205891603B4B1594799FC238B305',N'@retirosInicioUtc'),
  (N'sp_ret_list_today','B0A9D721E8238875D7F0C3E41F76D106247AE3BFEE1310335BA5363299CAA239','D035CC11EDD0A3BA2705B7225CC9480AFA8920EFAF72D42413648670F97F187A',N'@retirosInicioUtc');
IF EXISTS (
  SELECT 1 FROM #expected e
  LEFT JOIN sys.objects o ON o.name=e.name AND o.schema_id=SCHEMA_ID(N'dbo') AND o.type='P'
  LEFT JOIN sys.sql_modules sm ON sm.object_id=o.object_id
  WHERE sm.object_id IS NULL
     OR CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),sm.definition)),2) NOT IN (e.oldHash,e.newHash)
) THROW 58254, 'Stored procedure preflight hash changed; aborting migration', 1;
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
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), @hoyMexico);
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @fcnDate) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @fcnDate)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');

  IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
    SET @tipoNorm = 'GLOBAL';

  IF @sucNorm = ''
    THROW 58015, 'SUC es obligatorio', 1;

  IF @opvNorm = ''
    THROW 58016, 'OPV es obligatorio', 1;

  DECLARE @serial INT = DATEDIFF(DAY, '1899-12-30', @fcnDate);
  DECLARE @ide NVARCHAR(255) = CONCAT(@serial, @opvNorm);

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    DECLARE @lockResource NVARCHAR(255) = CONCAT(
      'CG_ENTREGA_OPV_',
      CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONCAT(@sucNorm, '|', CONVERT(CHAR(8), @fcnDate, 112), '|', @opvNorm)), 2)
    );
    DECLARE @lockResult INT;

    EXEC @lockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 10000;

    IF @lockResult < 0
      THROW 58017, 'No se pudo obtener lock para sincronizar entrega OPV', 1;

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
      IF @startedTran = 1 AND @@TRANCOUNT > 0
        COMMIT TRANSACTION;
      RETURN;
    END;

    SELECT TOP (1)
      @terNorm = NULLIF(LTRIM(RTRIM(ISNULL(e.TER, ''))), '')
    FROM dbo.DAT_FORM_ENTR_OPV_SVR e
    WHERE UPPER(LTRIM(RTRIM(ISNULL(e.SUC, '')))) = @sucNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(e.OPV, '')))) = @opvNorm
      AND CONVERT(DATE, e.FCN) = @fcnDate;

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
        AND r.FCNR >= @retirosInicioUtc
        AND r.FCNR < @retirosFinUtc
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
    WHERE IDE = @ide
      OR (
        UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
        AND CONVERT(DATE, FCN) = @fcnDate
      );

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
          WHEN FORM = 'TARJETA CREDITO' THEN 'TCR'
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
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), @hoyMexico);
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @fcnDate) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @fcnDate)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');

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
      AND r.FCNR >= @retirosInicioUtc
      AND r.FCNR < @retirosFinUtc
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

CREATE OR ALTER PROCEDURE dbo.sp_cg_resumen_efectivo_opv
  @SUC VARCHAR(25),
  @FCN DATE,
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), @hoyMexico);
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @fcnDate) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @fcnDate)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');

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
    AND r.FCNR >= @retirosInicioUtc
    AND r.FCNR < @retirosFinUtc
    AND UPPER(LTRIM(RTRIM(ISNULL(r.ESTA, '')))) NOT IN ('CANCELADO', 'CANCEL', 'ANULADO')
    AND dbo.fn_cg_normalize_forma(d.FORMA) = 'EFECTIVO'
  GROUP BY ISNULL(e.DENO, 0)
  HAVING ABS(SUM(ISNULL(TRY_CONVERT(MONEY, e.TOTAL), 0))) > 0.000001
  ORDER BY ISNULL(e.DENO, 0) DESC;
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
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), @hoyMexico);
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @fcnDate) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @fcnDate)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @fechaProceso DATETIME = CONVERT(DATETIME, CONVERT(DATETIME2(7), SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)'));

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

    DECLARE @lockResource NVARCHAR(255) = CONCAT(
      'CG_ENTREGA_OPV_',
      CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONCAT(@sucNorm, '|', CONVERT(CHAR(8), @fcnDate, 112), '|', @opvNorm)), 2)
    );
    DECLARE @syncLockResult INT;

    EXEC @syncLockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 10000;

    IF @syncLockResult < 0
      THROW 58103, 'No se pudo obtener lock para sincronizar cierre de entrega OPV', 1;

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
        AND r.FCNR >= @retirosInicioUtc
        AND r.FCNR < @retirosFinUtc
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
    WHERE IDE = @ide
      OR (
        UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
        AND CONVERT(DATE, FCN) = @fcnDate
      );

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
          WHEN FORM = 'TARJETA CREDITO' THEN 'TCR'
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
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), @hoyMexico);
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @fechaProceso DATETIME = CONVERT(DATETIME, CONVERT(DATETIME2(7), SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)'));
  DECLARE @today DATE = @hoyMexico;

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

    DECLARE @lockResource NVARCHAR(255) = CONCAT(
      'CG_ENTREGA_OPV_',
      CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONCAT(@sucNorm, '|', CONVERT(CHAR(8), @fcnDate, 112), '|', @opvNorm)), 2)
    );
    DECLARE @syncLockResult INT;

    EXEC @syncLockResult = sp_getapplock
      @Resource = @lockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 10000;

    IF @syncLockResult < 0
      THROW 58126, 'No se pudo obtener lock para reactivar entrega OPV', 1;

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
    WHERE IDE = @ide
      OR (
        UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @sucNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
        AND CONVERT(DATE, FCN) = @fcnDate
      );

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
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @fcnDate DATE = ISNULL(CONVERT(DATE, @FCN), @hoyMexico);
  DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
  DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @fcnDate) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @fcnDate)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');

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
      AND r.FCNR >= @retirosInicioUtc
      AND r.FCNR < @retirosFinUtc
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
    WHERE r.FCNR >= @retirosInicioUtc
      AND r.FCNR < @retirosFinUtc
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

CREATE OR ALTER PROCEDURE dbo.sp_ret_create
  @OPV NVARCHAR(255),
  @TER NVARCHAR(255) = NULL,
  @IDRET NVARCHAR(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @terNorm NVARCHAR(255) = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(@TER, '')))), '');
  DECLARE @terCmp NVARCHAR(255) = ISNULL(@terNorm, '');
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @hoyMexico) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @hoyMexico)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56101: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF EXISTS (
      SELECT 1
      FROM dbo.DAT_RET_CTR_SVR WITH (UPDLOCK, HOLDLOCK)
      WHERE FCNR >= @retirosInicioUtc
        AND FCNR < @retirosFinUtc
        AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(TER, '')))) = @terCmp
        AND UPPER(LTRIM(RTRIM(ISNULL(ESTA, '')))) = 'ABIERTO'
    )
    BEGIN
      RAISERROR('56102: Ya existe un retiro ABIERTO hoy para el OPV y terminal indicados', 16, 1);
    END;

    SET @IDRET = CONVERT(NVARCHAR(36), NEWID());

    INSERT INTO dbo.DAT_RET_CTR_SVR (
      IDRET,
      TER,
      OPV,
      FCNR,
      IMPR,
      ESTA
    )
    VALUES (
      @IDRET,
      @terNorm,
      @opvNorm,
      SYSUTCDATETIME(),
      0,
      'ABIERTO'
    );

    SELECT TOP (1)
      IDRET,
      TER,
      OPV,
      FCNR,
      IMPR,
      ESTA
    FROM dbo.DAT_RET_CTR_SVR
    WHERE IDRET = @IDRET;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_list_today
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @hoyMexico DATE = CONVERT(DATE, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
  DECLARE @retirosInicioUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), @hoyMexico) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');
  DECLARE @retirosFinUtc DATETIME2(7) = CONVERT(DATETIME2(7), (CONVERT(DATETIME2(7), DATEADD(DAY, 1, @hoyMexico)) AT TIME ZONE 'Central Standard Time (Mexico)') AT TIME ZONE 'UTC');

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56201: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT
      r.IDRET,
      r.TER,
      r.OPV,
      r.FCNR,
      r.IMPR,
      r.ESTA,
      ISNULL(d.DET_COUNT, 0) AS DET_COUNT,
      ISNULL(d.DET_TOTAL, 0) AS DET_TOTAL
    FROM dbo.DAT_RET_CTR_SVR r
    OUTER APPLY (
      SELECT
        COUNT(1) AS DET_COUNT,
        ROUND(SUM(ISNULL(IMPF, 0)), 2) AS DET_TOTAL
      FROM dbo.DAT_RET_DET_SVR
      WHERE IDRET = r.IDRET
    ) d
    WHERE r.FCNR >= @retirosInicioUtc
      AND r.FCNR < @retirosFinUtc
      AND UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm
    ORDER BY r.FCNR DESC;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO
IF EXISTS (
  SELECT 1 FROM #expected e
  LEFT JOIN sys.objects o ON o.name=e.name AND o.schema_id=SCHEMA_ID(N'dbo') AND o.type='P'
  LEFT JOIN sys.sql_modules sm ON sm.object_id=o.object_id
  WHERE sm.object_id IS NULL
     OR sm.definition NOT LIKE N'%' + e.marker + N'%'
     OR sm.definition NOT LIKE N'%Central Standard Time (Mexico)%'
     OR (e.name <> N'sp_cg_reactivar_entrega_opv' AND sm.definition NOT LIKE N'%@retirosFinUtc%')
) THROW 58255, 'Postflight stored procedure validation failed', 1;
IF EXISTS (
  SELECT 1
  FROM (VALUES (N'sp_cg_cerrar_entrega_opv'), (N'sp_cg_reactivar_entrega_opv')) e(name)
  LEFT JOIN sys.objects o ON o.name=e.name AND o.schema_id=SCHEMA_ID(N'dbo') AND o.type='P'
  LEFT JOIN sys.sql_modules sm ON sm.object_id=o.object_id
  WHERE sm.object_id IS NULL
     OR sm.definition NOT LIKE N'%@fechaProceso DATETIME = CONVERT(DATETIME, CONVERT(DATETIME2(7), SYSUTCDATETIME() AT TIME ZONE ''UTC'' AT TIME ZONE ''Central Standard Time (Mexico)''))%'
) THROW 58256, 'Generated Caja movement timestamps are not Mexico local', 1;
COMMIT TRANSACTION;
GO
DROP TABLE #expected;
GO
SELECT @@SERVERNAME AS server_name, DB_NAME() AS database_name, SYSUTCDATETIME() AS applied_utc;
