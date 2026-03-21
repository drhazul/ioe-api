/*
  2026-03-21
  Pago de servicios: la primera referencia ligada define ORIGEN_AUT.
  - Si aún no hay referencias (ORD) en el ticket, se permite cambiar CA <-> VF
    para adoptar el origen de la primera referencia.
  - Si ya existen referencias, se conserva el origen previamente fijado y se
    bloquea la mezcla CA/VF.
*/

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
  DECLARE @origenActual CHAR(2) = 'CA';
  DECLARE @origenRef CHAR(2) = 'CA';
  DECLARE @hasRefs INT = 0;

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

    SELECT TOP 1
      @origenRef = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, '')))) IN ('CA', 'VF')
          THEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, ''))))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(AUT, '')))) IN ('VF', 'DVF')
          THEN 'VF'
        ELSE 'CA'
      END
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolRefNorm)
       OR UPPER(LTRIM(RTRIM(ISNULL(IDFOLINICIAL, '')))) = UPPER(@idfolRefNorm)
    ORDER BY CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolRefNorm) THEN 0 ELSE 1 END;

    IF @origenRef IS NULL OR @origenRef NOT IN ('CA', 'VF')
      SET @origenRef = 'CA';

    SELECT TOP 1
      @origenActual = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, '')))) IN ('CA', 'VF')
          THEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, ''))))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(AUT, '')))) IN ('VF', 'DVF')
          THEN 'VF'
        ELSE 'CA'
      END
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolNorm);

    IF @origenActual IS NULL OR @origenActual NOT IN ('CA', 'VF')
      SET @origenActual = 'CA';

    SELECT
      @hasRefs = COUNT(1)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm
      AND LTRIM(RTRIM(ISNULL(ORD, ''))) <> '';

    IF ISNULL(@hasRefs, 0) > 0 AND @origenActual <> @origenRef
      THROW 57045, 'No se permite mezclar referencias de origen CA con VF en la misma transacción de pago de servicio.', 1;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET ORIGEN_AUT = @origenRef
    WHERE IDFOL = @idfolNorm
      AND ISNULL(ORIGEN_AUT, '') <> @origenRef;

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
      @reqfRef AS REQF_REF,
      @origenRef AS ORIGEN_AUT;
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
  DECLARE @origenActual CHAR(2) = 'CA';
  DECLARE @hasRefs INT = 0;

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

    SELECT TOP 1
      @origenActual = CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, '')))) IN ('CA', 'VF')
          THEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, ''))))
        WHEN UPPER(LTRIM(RTRIM(ISNULL(AUT, '')))) IN ('VF', 'DVF')
          THEN 'VF'
        ELSE 'CA'
      END
    FROM dbo.PV_CTR_FOL_ASVR
    WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(@idfolNorm);

    IF @origenActual IS NULL OR @origenActual NOT IN ('CA', 'VF')
      SET @origenActual = 'CA';

    SELECT
      @hasRefs = COUNT(1)
    FROM dbo.PV_TICKET_LOG
    WHERE IDFOL = @idfolNorm
      AND LTRIM(RTRIM(ISNULL(ORD, ''))) <> '';

    IF ISNULL(@hasRefs, 0) > 0 AND @origenActual = 'VF'
      THROW 57046, 'No se permite mezclar origen VF con referencias de gasto (CA) en la misma transacción.', 1;

    UPDATE dbo.PV_CTR_FOL_ASVR
    SET ORIGEN_AUT = 'CA'
    WHERE IDFOL = @idfolNorm
      AND ISNULL(ORIGEN_AUT, '') <> 'CA';

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
      @resolvedRef AS ORD,
      'CA' AS ORIGEN_AUT;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH
END;
GO
