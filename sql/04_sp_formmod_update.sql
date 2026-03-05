SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_formmod_update
  @OPV nvarchar(255),
  @SupervisorId nvarchar(255),
  @IDF nvarchar(255),
  @NewFORM nvarchar(255),
  @NewAUT nvarchar(255) = NULL,
  @ClearAUT bit = 0
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @opvNorm nvarchar(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, N''))));
  DECLARE @supervisorNorm nvarchar(255) = LTRIM(RTRIM(ISNULL(@SupervisorId, N'')));
  DECLARE @idfNorm nvarchar(255) = LTRIM(RTRIM(ISNULL(@IDF, N'')));
  DECLARE @newFormNorm nvarchar(255) = UPPER(LTRIM(RTRIM(ISNULL(@NewFORM, N''))));
  DECLARE @newAutNorm nvarchar(255) = LTRIM(RTRIM(ISNULL(@NewAUT, N'')));

  IF @opvNorm = N''
    THROW 50011, 'El parametro @OPV es obligatorio.', 1;

  IF @supervisorNorm = N''
    THROW 50012, 'El parametro @SupervisorId es obligatorio.', 1;

  IF @idfNorm = N''
    THROW 50013, 'El parametro @IDF es obligatorio.', 1;

  IF @newFormNorm = N''
    THROW 50014, 'El parametro @NewFORM es obligatorio.', 1;

  IF COL_LENGTH('dbo.PV_CTR_FOL_FORM_SVR', 'AUT') IS NULL
    THROW 50015, 'La tabla PV_CTR_FOL_FORM_SVR no tiene columna AUT.', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.VW_PV_FORM_TIPOTRAN_DISTINCT AS V
    WHERE UPPER(LTRIM(RTRIM(ISNULL(V.FORM, N'')))) = @newFormNorm
      AND ISNULL(V.BLOQ, 0) = 0
  )
  BEGIN
    THROW 50016, 'La forma de pago no existe en catalogo permitido o esta bloqueada.', 1;
  END;

  DECLARE @before TABLE (
    FCN date NOT NULL,
    IDFOL nvarchar(255) NOT NULL,
    AUT_ASVR nvarchar(10) NULL,
    TRA nvarchar(255) NULL,
    OPVM nvarchar(255) NULL,
    IDF nvarchar(255) NOT NULL,
    FORM nvarchar(255) NULL,
    IMPD decimal(18, 2) NOT NULL,
    AUT_FORM nvarchar(255) NULL
  );

  BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO @before (FCN, IDFOL, AUT_ASVR, TRA, OPVM, IDF, FORM, IMPD, AUT_FORM)
    SELECT TOP (1)
      CONVERT(date, A.FCN) AS FCN,
      CAST(A.IDFOL AS nvarchar(255)) AS IDFOL,
      CAST(A.AUT AS nvarchar(10)) AS AUT_ASVR,
      CAST(A.TRA AS nvarchar(255)) AS TRA,
      CAST(A.OPVM AS nvarchar(255)) AS OPVM,
      CAST(F.IDF AS nvarchar(255)) AS IDF,
      CAST(F.FORM AS nvarchar(255)) AS FORM,
      CAST(ISNULL(F.IMPD, 0) AS decimal(18, 2)) AS IMPD,
      CAST(F.AUT AS nvarchar(255)) AS AUT_FORM
    FROM dbo.PV_CTR_FOL_FORM_SVR AS F WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.PV_CTR_FOL_ASVR AS A WITH (UPDLOCK, HOLDLOCK)
      ON A.IDFOL = F.IDFOL
    WHERE CAST(F.IDF AS nvarchar(255)) = @idfNorm
      AND CONVERT(date, A.FCN) = CONVERT(date, GETDATE())
      AND A.AUT IN (N'AD', N'AP', N'CR', N'VF')
      AND UPPER(LTRIM(RTRIM(ISNULL(A.OPVM, N'')))) = @opvNorm;

    IF NOT EXISTS (SELECT 1 FROM @before)
    BEGIN
      THROW 50017, 'No existe detalle IDF para el OPV/logica de dia actual o AUT no permitido.', 1;
    END;

    IF EXISTS (
      SELECT 1
      FROM @before
      WHERE UPPER(LTRIM(RTRIM(ISNULL(FORM, N'')))) = @newFormNorm
    )
    BEGIN
      THROW 50018, 'La forma seleccionada es igual a la actual.', 1;
    END;

    DECLARE @beforeForm nvarchar(255) =
      (SELECT TOP (1) UPPER(LTRIM(RTRIM(ISNULL(FORM, N'')))) FROM @before);
    DECLARE @beforeAut nvarchar(255) =
      (SELECT TOP (1) LTRIM(RTRIM(ISNULL(AUT_FORM, N''))) FROM @before);

    IF @beforeForm = N'EFECTIVO' AND @newFormNorm <> N'EFECTIVO' AND @newAutNorm = N''
    BEGIN
      THROW 50019, 'Debe generar/asignar referencia para cambio de EFECTIVO a forma no efectivo.', 1;
    END;

    DECLARE @hasCloseFlag bit = 0;
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'ESTA') IS NOT NULL SET @hasCloseFlag = 1;
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'TIMBRADO') IS NOT NULL SET @hasCloseFlag = 1;
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'FACTURADO') IS NOT NULL SET @hasCloseFlag = 1;
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'CERRADO') IS NOT NULL SET @hasCloseFlag = 1;

    DECLARE @isLockedByStatus bit = 0;
    DECLARE @lockSql nvarchar(max) = N'
      SELECT @isLockedByStatusOut =
        CASE WHEN 1 = 0';

    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'ESTA') IS NOT NULL
      SET @lockSql += N'
        OR UPPER(LTRIM(RTRIM(ISNULL(CONVERT(nvarchar(255), A.ESTA), '''')))) IN (''FACTURADO'', ''TIMBRADO'', ''CERRADO'', ''TRANSMITIR'')';
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'TIMBRADO') IS NOT NULL
      SET @lockSql += N'
        OR ISNULL(CONVERT(int, A.TIMBRADO), 0) <> 0';
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'FACTURADO') IS NOT NULL
      SET @lockSql += N'
        OR ISNULL(CONVERT(int, A.FACTURADO), 0) <> 0';
    IF COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'CERRADO') IS NOT NULL
      SET @lockSql += N'
        OR ISNULL(CONVERT(int, A.CERRADO), 0) <> 0';

    SET @lockSql += N'
        THEN 1
        ELSE 0
      END
      FROM dbo.PV_CTR_FOL_ASVR AS A
      INNER JOIN dbo.PV_CTR_FOL_FORM_SVR AS F
        ON F.IDFOL = A.IDFOL
      WHERE CAST(F.IDF AS nvarchar(255)) = @idfNormIn;';

    EXEC sys.sp_executesql
      @lockSql,
      N'@idfNormIn nvarchar(255), @isLockedByStatusOut bit OUTPUT',
      @idfNormIn = @idfNorm,
      @isLockedByStatusOut = @isLockedByStatus OUTPUT;

    IF @isLockedByStatus = 1
    BEGIN
      THROW 50020, 'El folio ya fue facturado/timbrado/cerrado y no permite cambio de forma.', 1;
    END;

    IF @hasCloseFlag = 0
    BEGIN
      -- TODO: agregar validacion de facturado/timbrado/cerrado segun bandera real del esquema destino.
      -- Placeholder consciente para ambientes legacy sin columnas de estatus final.
      PRINT 'TODO: validar bandera de facturado/timbrado/cerrado en esquema destino.';
    END;

    DECLARE @nextAut nvarchar(255) = NULL;
    IF @newFormNorm = N'EFECTIVO' OR @ClearAUT = 1
      SET @nextAut = NULL;
    ELSE IF @newAutNorm <> N''
      SET @nextAut = @newAutNorm;
    ELSE IF @beforeAut <> N''
      SET @nextAut = @beforeAut;

    UPDATE F
      SET F.FORM = @newFormNorm,
          F.AUT = @nextAut
    FROM dbo.PV_CTR_FOL_FORM_SVR AS F
    INNER JOIN @before AS B
      ON B.IDF = CAST(F.IDF AS nvarchar(255));

    IF @@ROWCOUNT = 0
    BEGIN
      THROW 50021, 'No se pudo actualizar la forma de pago.', 1;
    END;

    DECLARE @updatedAtUtc datetime2(0) = SYSUTCDATETIME();

    SELECT
      B.FCN,
      B.IDFOL,
      B.AUT_ASVR,
      B.TRA,
      B.OPVM,
      B.IDF,
      B.FORM AS BEFORE_FORM,
      B.AUT_FORM AS BEFORE_AUT,
      CAST(F.FORM AS nvarchar(255)) AS AFTER_FORM,
      CAST(F.AUT AS nvarchar(255)) AS AFTER_AUT,
      B.IMPD,
      @supervisorNorm AS SUPERVISOR_ID,
      @updatedAtUtc AS UPDATED_AT_UTC
    FROM @before AS B
    INNER JOIN dbo.PV_CTR_FOL_FORM_SVR AS F
      ON CAST(F.IDF AS nvarchar(255)) = B.IDF;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
