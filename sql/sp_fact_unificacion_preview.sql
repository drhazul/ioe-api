SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_fact_unificacion_preview
  @IDFOLS_JSON NVARCHAR(MAX),
  @SUC NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @idFolsJson NVARCHAR(MAX) = LTRIM(RTRIM(ISNULL(@IDFOLS_JSON, '')));
  DECLARE @sucNorm NVARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@SUC, ''))));

  IF @idFolsJson = ''
    SET @idFolsJson = '[]';

  IF ISJSON(@idFolsJson) <> 1
    THROW 51110, 'El payload idFols debe ser JSON válido', 1;

  IF OBJECT_ID('tempdb..#SEL_IDS') IS NOT NULL
    DROP TABLE #SEL_IDS;
  CREATE TABLE #SEL_IDS (
    IDFOL NVARCHAR(255) NOT NULL PRIMARY KEY
  );

  INSERT INTO #SEL_IDS (IDFOL)
  SELECT DISTINCT UPPER(LTRIM(RTRIM([value])))
  FROM OPENJSON(@idFolsJson)
  WHERE LTRIM(RTRIM(ISNULL([value], ''))) <> '';

  DECLARE @selectedCount INT = (SELECT COUNT(1) FROM #SEL_IDS);

  IF OBJECT_ID('tempdb..#SEL_DATA') IS NOT NULL
    DROP TABLE #SEL_DATA;
  CREATE TABLE #SEL_DATA (
    IDFOL NVARCHAR(255) NOT NULL,
    CLIEN NVARCHAR(255) NULL,
    FORMAPAGO NVARCHAR(120) NULL,
    TIPOVTA NVARCHAR(120) NULL,
    USOCFDI NVARCHAR(120) NULL,
    RFCEMISOR NVARCHAR(120) NULL,
    METODODEPAGO NVARCHAR(120) NULL,
    RFCRECEPTOR NVARCHAR(120) NULL,
    RAZONSOCIALRECEPTOR NVARCHAR(255) NULL,
    TIPOFACT NVARCHAR(120) NULL,
    SUC NVARCHAR(40) NULL,
    ESTATUS NVARCHAR(120) NULL,
    GRUPMASI NVARCHAR(255) NULL,
    REQF INT NULL,
    FCNS NVARCHAR(40) NULL,
    IMPT DECIMAL(18, 2) NULL
  );

  IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NOT NULL
  BEGIN
    DECLARE @exprClien NVARCHAR(800) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'CLIEN') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(
            CASE
              WHEN TRY_CONVERT(DECIMAL(38,0), F.CLIEN) IS NOT NULL
                THEN CONVERT(NVARCHAR(255), TRY_CONVERT(DECIMAL(38,0), F.CLIEN))
              ELSE TRY_CONVERT(NVARCHAR(255), F.CLIEN)
            END,
          ''''))))'
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'CLIENTE') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(
            CASE
              WHEN TRY_CONVERT(DECIMAL(38,0), F.CLIENTE) IS NOT NULL
                THEN CONVERT(NVARCHAR(255), TRY_CONVERT(DECIMAL(38,0), F.CLIENTE))
              ELSE TRY_CONVERT(NVARCHAR(255), F.CLIENTE)
            END,
          ''''))))'
      ELSE N'''''' END;
    DECLARE @exprFormaPago NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'FormaPago') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.FormaPago), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprTipoVta NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'TIPOVTA') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.TIPOVTA), ''''))))'
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'AUT') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.AUT), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprUsoCfdi NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'UsoCfdi') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.UsoCfdi), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprRfcEmisor NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'RfcEmisor') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.RfcEmisor), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprMetodoPago NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'MetodoDePago') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.MetodoDePago), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprRfcReceptor NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'RfcReceptor') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.RfcReceptor), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprRazonSocial NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'RazonSocialReceptor') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(255), F.RazonSocialReceptor), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprTipoFact NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'Tipofact') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.Tipofact), ''''))))'
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'TIPOFACT') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.TIPOFACT), ''''))))'
      ELSE N'''INDIVIDUAL''' END;
    DECLARE @exprSuc NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'SUC') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(40), F.SUC), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprEstatus NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'ESTATUS') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(120), F.ESTATUS), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprGrupmasi NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'GRUPMASI') IS NOT NULL THEN
        N'UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(255), F.GRUPMASI), ''''))))'
      ELSE N'''''' END;
    DECLARE @exprReqf NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'REQF') IS NOT NULL THEN
        N'TRY_CONVERT(INT, F.REQF)'
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'RQFAC') IS NOT NULL THEN
        N'TRY_CONVERT(INT, F.RQFAC)'
      ELSE N'0' END;
    DECLARE @exprFcns NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'FCNS') IS NOT NULL THEN
        N'LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(40), F.FCNS), '''')))'
      ELSE N'''''' END;
    DECLARE @exprImpt NVARCHAR(400) = CASE
      WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'IMPT') IS NOT NULL THEN
        N'ROUND(ISNULL(TRY_CONVERT(DECIMAL(18,2), F.IMPT), 0), 2)'
      ELSE N'0' END;

    DECLARE @sql NVARCHAR(MAX) = N'
      INSERT INTO #SEL_DATA (
        IDFOL, CLIEN, FORMAPAGO, TIPOVTA, USOCFDI, RFCEMISOR, METODODEPAGO,
        RFCRECEPTOR, RAZONSOCIALRECEPTOR, TIPOFACT, SUC, ESTATUS, GRUPMASI,
        REQF, FCNS, IMPT
      )
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(255), F.IDFOL), '''')))),
        ' + @exprClien + N',
        ' + @exprFormaPago + N',
        ' + @exprTipoVta + N',
        ' + @exprUsoCfdi + N',
        ' + @exprRfcEmisor + N',
        ' + @exprMetodoPago + N',
        ' + @exprRfcReceptor + N',
        ' + @exprRazonSocial + N',
        ' + @exprTipoFact + N',
        ' + @exprSuc + N',
        ' + @exprEstatus + N',
        ' + @exprGrupmasi + N',
        ' + @exprReqf + N',
        ' + @exprFcns + N',
        ' + @exprImpt + N'
      FROM dbo.FAC_SVR_SHAP F
      INNER JOIN #SEL_IDS I
        ON UPPER(LTRIM(RTRIM(ISNULL(TRY_CONVERT(NVARCHAR(255), F.IDFOL), '''')))) = I.IDFOL;';
    EXEC sys.sp_executesql @sql;
  END;

  DECLARE @foundCount INT = (SELECT COUNT(1) FROM #SEL_DATA);
  DECLARE @bloqueos TABLE (MSG NVARCHAR(400) NOT NULL);

  IF @selectedCount < 2
    INSERT INTO @bloqueos (MSG) VALUES (N'Se requieren al menos 2 tickets para unificación');

  IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NULL
    INSERT INTO @bloqueos (MSG) VALUES (N'No existe tabla FAC_SVR_SHAP');

  IF @foundCount <> @selectedCount
    INSERT INTO @bloqueos (MSG) VALUES (N'Uno o más folios seleccionados no existen en FAC_SVR_SHAP');

  IF OBJECT_ID('dbo.FAC_SVR_SHAP', 'U') IS NOT NULL
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM dbo.FAC_SVR_SHAP
      WHERE UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, '')))) = 'EXCEL GEN'
    )
      INSERT INTO @bloqueos (MSG) VALUES (N'Existe facturación en proceso (ESTATUS = EXCEL GEN)');
  END;

  IF OBJECT_ID('dbo.FAC_CTRL_GRUP_MASV', 'U') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM dbo.FAC_CTRL_GRUP_MASV
       WHERE UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, '')))) = 'PROCESANDO'
     )
    INSERT INTO @bloqueos (MSG) VALUES (N'Existe otra unificación en proceso (FAC_CTRL_GRUP_MASV.PROCESANDO)');

  IF @foundCount > 0
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM #SEL_DATA
      WHERE ESTATUS = 'UNIFICADO'
         OR (GRUPMASI <> '' AND LEFT(GRUPMASI, 1) = 'U')
    )
      INSERT INTO @bloqueos (MSG) VALUES (N'Algún ticket ya se encuentra unificado');

    IF EXISTS (
      SELECT 1
      FROM #SEL_DATA
      WHERE ESTATUS = 'ANULADO'
    )
      INSERT INTO @bloqueos (MSG) VALUES (N'Algún ticket está ANULADO');

    IF EXISTS (
      SELECT 1
      FROM #SEL_DATA
      WHERE ESTATUS LIKE '%FACTUR%'
    )
      INSERT INTO @bloqueos (MSG) VALUES (N'Algún ticket ya está FACTURADO o en flujo fiscal');

    IF EXISTS (
      SELECT 1
      FROM #SEL_DATA
      WHERE ESTATUS NOT IN ('PENDIENTE')
    )
      INSERT INTO @bloqueos (MSG) VALUES (N'Algún ticket no está en estado elegible para unificación');

    IF (SELECT COUNT(DISTINCT CLIEN) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben pertenecer al mismo cliente (CLIEN)');

    IF (SELECT COUNT(DISTINCT FORMAPAGO) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener la misma forma de pago');

    IF (SELECT COUNT(DISTINCT USOCFDI) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener el mismo Uso CFDI');

    IF (SELECT COUNT(DISTINCT RFCEMISOR) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener el mismo RFC emisor');

    IF (SELECT COUNT(DISTINCT METODODEPAGO) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener el mismo Método de pago');

    IF (SELECT COUNT(DISTINCT RFCRECEPTOR) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener el mismo RFC receptor');

    IF (SELECT COUNT(DISTINCT RAZONSOCIALRECEPTOR) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener la misma Razón social receptor');

    IF (SELECT COUNT(DISTINCT TIPOFACT) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener el mismo tipo de facturación (Tipofact)');

    IF (SELECT COUNT(DISTINCT TIPOVTA) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben tener el mismo tipo de venta (TIPOVTA)');

    IF (SELECT COUNT(DISTINCT SUC) FROM #SEL_DATA) > 1
      INSERT INTO @bloqueos (MSG) VALUES (N'Los tickets deben pertenecer a la misma sucursal');

    IF @sucNorm <> ''
       AND EXISTS (
         SELECT 1
         FROM #SEL_DATA
         WHERE SUC <> @sucNorm
       )
      INSERT INTO @bloqueos (MSG) VALUES (N'La selección contiene folios fuera de la sucursal autorizada');
  END;

  DECLARE @cantidad INT = ISNULL((SELECT COUNT(1) FROM #SEL_DATA), 0);
  DECLARE @total DECIMAL(18, 2) = ISNULL((SELECT ROUND(SUM(IMPT), 2) FROM #SEL_DATA), 0);
  DECLARE @clien NVARCHAR(255) = (SELECT TOP 1 CLIEN FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @formaPago NVARCHAR(120) = (SELECT TOP 1 FORMAPAGO FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @tipoVta NVARCHAR(120) = (SELECT TOP 1 TIPOVTA FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @usoCfdi NVARCHAR(120) = (SELECT TOP 1 USOCFDI FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @rfcEmisor NVARCHAR(120) = (SELECT TOP 1 RFCEMISOR FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @metodoPago NVARCHAR(120) = (SELECT TOP 1 METODODEPAGO FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @rfcReceptor NVARCHAR(120) = (SELECT TOP 1 RFCRECEPTOR FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @razonSocial NVARCHAR(255) = (SELECT TOP 1 RAZONSOCIALRECEPTOR FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @tipoFact NVARCHAR(120) = (SELECT TOP 1 TIPOFACT FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @sucSel NVARCHAR(40) = (SELECT TOP 1 SUC FROM #SEL_DATA ORDER BY IDFOL);
  DECLARE @reqf INT = ISNULL((SELECT TOP 1 REQF FROM #SEL_DATA ORDER BY IDFOL), 0);
  DECLARE @fcns NVARCHAR(40) = ISNULL((SELECT TOP 1 FCNS FROM #SEL_DATA ORDER BY IDFOL), '');

  DECLARE @valido BIT = CASE WHEN EXISTS (SELECT 1 FROM @bloqueos) THEN 0 ELSE 1 END;
  DECLARE @mensaje NVARCHAR(400) = CASE
    WHEN @valido = 1 THEN N'Validación de unificación correcta'
    WHEN EXISTS (SELECT 1 FROM @bloqueos) THEN (SELECT TOP 1 MSG FROM @bloqueos)
    ELSE N'No fue posible validar la selección'
  END;

  DECLARE @bloqueosJson NVARCHAR(MAX) = N'[]';
  IF EXISTS (SELECT 1 FROM @bloqueos)
  BEGIN
    SELECT @bloqueosJson = N'[' + STUFF((
      SELECT N',"' + STRING_ESCAPE(MSG, 'json') + N'"'
      FROM @bloqueos
      FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)'), 1, 1, N'') + N']';
  END;

  DECLARE @idFolsOut NVARCHAR(MAX) = N'[]';
  IF EXISTS (SELECT 1 FROM #SEL_IDS)
  BEGIN
    SELECT @idFolsOut = N'[' + STUFF((
      SELECT N',"' + STRING_ESCAPE(IDFOL, 'json') + N'"'
      FROM #SEL_IDS
      ORDER BY IDFOL
      FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)'), 1, 1, N'') + N']';
  END;

  SELECT
    @valido AS VALIDO,
    @mensaje AS MENSAJE,
    @cantidad AS CANTIDAD,
    @total AS TOTAL,
    ISNULL(@clien, '') AS CLIEN,
    ISNULL(@formaPago, '') AS FORMAPAGO,
    ISNULL(@tipoVta, '') AS TIPOVTA,
    ISNULL(@usoCfdi, '') AS USOCFDI,
    ISNULL(@rfcEmisor, '') AS RFCEMISOR,
    ISNULL(@metodoPago, '') AS METODODEPAGO,
    ISNULL(@rfcReceptor, '') AS RFCRECEPTOR,
    ISNULL(@razonSocial, '') AS RAZONSOCIALRECEPTOR,
    ISNULL(@tipoFact, '') AS TIPOFACT,
    ISNULL(@sucSel, '') AS SUC,
    @reqf AS REQF,
    ISNULL(@fcns, '') AS FCNS,
    @bloqueosJson AS BLOQUEOS_JSON,
    @idFolsOut AS IDFOLS_JSON;
END;
GO
