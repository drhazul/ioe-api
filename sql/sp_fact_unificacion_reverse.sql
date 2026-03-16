SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_fact_unificacion_reverse
  @GRUPMAS NVARCHAR(255),
  @MOTIVO NVARCHAR(500),
  @USUARIO NVARCHAR(120) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @grupoNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@GRUPMAS, ''))));
  DECLARE @motivoNorm NVARCHAR(500) = NULLIF(LTRIM(RTRIM(ISNULL(@MOTIVO, ''))), '');
  DECLARE @usuarioNorm NVARCHAR(120) = NULLIF(LTRIM(RTRIM(ISNULL(@USUARIO, ''))), '');
  DECLARE @lockResult INT = -1;

  IF @grupoNorm = ''
    THROW 51130, 'GRUPMAS es requerido', 1;
  IF LEFT(@grupoNorm, 1) <> 'U'
    THROW 51130, 'El grupo indicado no corresponde a una unificación válida', 1;
  IF @motivoNorm IS NULL
    THROW 51131, 'El motivo de reversa es obligatorio', 1;

  IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NULL
    THROW 51132, 'No existe tabla FAC_SVR_SHAP', 1;
  IF OBJECT_ID('dbo.FAC_CTRL_GRUP_MASV', 'U') IS NULL
    THROW 51132, 'No existe tabla FAC_CTRL_GRUP_MASV', 1;
  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'IDFOL') IS NULL
    THROW 51132, 'FAC_SVR_SHAP no contiene IDFOL', 1;
  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'ESTATUS') IS NULL
    THROW 51132, 'FAC_SVR_SHAP no contiene ESTATUS', 1;
  IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'GRUPMASI') IS NULL
    THROW 51132, 'FAC_SVR_SHAP no contiene GRUPMASI', 1;

  DECLARE @grupoExists BIT = 0;
  DECLARE @grupoEstatus NVARCHAR(255) = '';
  DECLARE @folioUnificado NVARCHAR(255) = '';
  DECLARE @estatusUnificado NVARCHAR(120) = '';

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    EXEC @lockResult = sp_getapplock
      @Resource = 'FACT_UNIFICACION_MASIVA',
      @LockMode = 'Exclusive',
      @LockOwner = 'Transaction',
      @LockTimeout = 15000;

    IF ISNULL(@lockResult, -1) < 0
      THROW 51133, 'No fue posible adquirir lock para reversa de unificación', 1;

    SELECT TOP 1
      @grupoExists = 1,
      @grupoEstatus = UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, ''))))
    FROM dbo.FAC_CTRL_GRUP_MASV WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE UPPER(LTRIM(RTRIM(ISNULL(GRUPMAS, '')))) = @grupoNorm;

    IF ISNULL(@grupoExists, 0) <> 1
      THROW 51134, 'El grupo de unificación no existe', 1;

    IF @grupoEstatus = 'ANULADO'
      THROW 51135, 'El grupo ya se encuentra ANULADO', 1;

    SELECT TOP 1
      @folioUnificado = UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))),
      @estatusUnificado = UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, ''))))
    FROM dbo.FAC_SVR_SHAP WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = @grupoNorm;

    IF @folioUnificado = ''
      THROW 51136, 'No existe folio unificado para el grupo indicado', 1;

    IF @estatusUnificado = 'ANULADO'
      THROW 51137, 'El folio unificado ya está ANULADO', 1;

    IF @estatusUnificado NOT IN ('PENDIENTE', 'CANCELACION PENDIENTE')
      THROW 51138, 'El folio unificado ya está en estado no reversible', 1;

    IF OBJECT_ID('tempdb..#ORIGINS') IS NOT NULL
      DROP TABLE #ORIGINS;
    CREATE TABLE #ORIGINS (
      IDFOL NVARCHAR(255) NOT NULL PRIMARY KEY
    );

    INSERT INTO #ORIGINS (IDFOL)
    SELECT UPPER(LTRIM(RTRIM(ISNULL(F.IDFOL, ''))))
    FROM dbo.FAC_SVR_SHAP F WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE UPPER(LTRIM(RTRIM(ISNULL(F.GRUPMASI, '')))) = @grupoNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(F.IDFOL, '')))) <> @grupoNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(F.ESTATUS, '')))) = 'UNIFICADO';

    DECLARE @originsCount INT = (SELECT COUNT(1) FROM #ORIGINS);
    IF @originsCount = 0
      THROW 51139, 'No se encontraron tickets origen para restaurar', 1;

    DECLARE @comReverse NVARCHAR(500) = LEFT(
      CONCAT(
        'REVERSA UNIFICACION ',
        ISNULL(@usuarioNorm, 'SYSTEM'),
        ' ',
        CONVERT(NVARCHAR(19), GETDATE(), 120),
        ': ',
        @motivoNorm
      ),
      500
    );

    IF COL_LENGTH('dbo.FAC_SVR_SHAP', 'COM') IS NOT NULL
    BEGIN
      UPDATE F
      SET
        ESTATUS = 'ANULADO',
        GRUPMASI = @grupoNorm,
        COM = @comReverse
      FROM dbo.FAC_SVR_SHAP F
      WHERE UPPER(LTRIM(RTRIM(ISNULL(F.IDFOL, '')))) = @grupoNorm;
    END
    ELSE
    BEGIN
      UPDATE F
      SET
        ESTATUS = 'ANULADO',
        GRUPMASI = @grupoNorm
      FROM dbo.FAC_SVR_SHAP F
      WHERE UPPER(LTRIM(RTRIM(ISNULL(F.IDFOL, '')))) = @grupoNorm;
    END;

    UPDATE F
    SET
      ESTATUS = 'PENDIENTE',
      GRUPMASI = NULL
    FROM dbo.FAC_SVR_SHAP F
    INNER JOIN #ORIGINS O
      ON UPPER(LTRIM(RTRIM(ISNULL(F.IDFOL, '')))) = O.IDFOL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(F.ESTATUS, '')))) = 'UNIFICADO';

    IF @@ROWCOUNT <> @originsCount
      THROW 51140, 'No fue posible restaurar todos los tickets origen', 1;

    IF OBJECT_ID('dbo.FACT_TICKET_SHP', 'U') IS NOT NULL
       AND COL_LENGTH('dbo.FACT_TICKET_SHP', 'FACUNI') IS NOT NULL
       AND COL_LENGTH('dbo.FACT_TICKET_SHP', 'IDFOL') IS NOT NULL
    BEGIN
      -- Modelo nuevo: IDFOL=folio unificado y FACUNI=folio origen.
      UPDATE T
      SET
        IDFOL = UPPER(LTRIM(RTRIM(ISNULL(T.FACUNI, '')))),
        FACUNI = NULL
      FROM dbo.FACT_TICKET_SHP T
      INNER JOIN #ORIGINS O
        ON UPPER(LTRIM(RTRIM(ISNULL(T.FACUNI, '')))) = O.IDFOL
      WHERE UPPER(LTRIM(RTRIM(ISNULL(T.IDFOL, '')))) = @grupoNorm;

      -- Compatibilidad legado: IDFOL=folio origen y FACUNI=grupo.
      UPDATE T
      SET FACUNI = NULL
      FROM dbo.FACT_TICKET_SHP T
      INNER JOIN #ORIGINS O
        ON UPPER(LTRIM(RTRIM(ISNULL(T.IDFOL, '')))) = O.IDFOL
      WHERE UPPER(LTRIM(RTRIM(ISNULL(T.FACUNI, '')))) = @grupoNorm;
    END;

    UPDATE dbo.FAC_CTRL_GRUP_MASV
    SET ESTATUS = 'ANULADO'
    WHERE UPPER(LTRIM(RTRIM(ISNULL(GRUPMAS, '')))) = @grupoNorm;

    IF @startedTran = 1 AND @@TRANCOUNT > 0
      COMMIT TRANSACTION;

    DECLARE @originsJson NVARCHAR(MAX) = N'[]';
    SELECT @originsJson = N'[' + STUFF((
      SELECT N',"' + STRING_ESCAPE(IDFOL, 'json') + N'"'
      FROM #ORIGINS
      ORDER BY IDFOL
      FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)'), 1, 1, N'') + N']';

    SELECT
      @grupoNorm AS GRUPO_ID,
      @folioUnificado AS FOLIO_UNIFICADO,
      @originsCount AS TICKETS_RESTAURADOS,
      @originsJson AS TICKETS_RESTAURADOS_JSON,
      'ANULADO' AS ESTATUS_FINAL;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
