

CREATE   PROCEDURE dbo.sp_ps_ticket_set_reference_folio

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


