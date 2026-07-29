/*
  Normalizacion EAN-13 para DAT_ART.

  Regla:
  - Sanitizar UPC a digitos.
  - Usar siempre los primeros 12 digitos; completar con ceros a la izquierda
    cuando existan menos de 12.
  - Calcular el digito verificador de forma independiente.
  - Si existe un digito 13 en UPC, reportar si coincide con el calculado.

  Este script no modifica DAT_ART.UPC porque forma parte de su clave primaria.
*/

CREATE OR ALTER FUNCTION dbo.fn_datart_ean13_info
(
    @UPC NVARCHAR(255)
)
RETURNS @Resultado TABLE
(
    UPC_DIGITOS NVARCHAR(255) NOT NULL,
    BASE12 CHAR(12) NOT NULL,
    EAN13 CHAR(13) NOT NULL,
    TIENE_DIGITO_VERIFICADOR BIT NOT NULL,
    DIGITO_VERIFICADOR_VALIDO BIT NULL
)
AS
BEGIN
    DECLARE @Digitos NVARCHAR(255) = N'';
    DECLARE @Posicion INT = 1;
    DECLARE @Longitud INT = LEN(COALESCE(@UPC, N''));

    WHILE @Posicion <= @Longitud
    BEGIN
        DECLARE @Caracter NCHAR(1) = SUBSTRING(@UPC, @Posicion, 1);
        IF @Caracter LIKE N'[0-9]'
            SET @Digitos += @Caracter;
        SET @Posicion += 1;
    END;

    IF LEN(@Digitos) = 0
        RETURN;

    DECLARE @Base12 CHAR(12) =
        CASE
            WHEN LEN(@Digitos) >= 12 THEN LEFT(@Digitos, 12)
            ELSE RIGHT(REPLICATE('0', 12) + @Digitos, 12)
        END;
    DECLARE @Suma INT = 0;
    SET @Posicion = 1;

    WHILE @Posicion <= 12
    BEGIN
        DECLARE @Digito INT = CONVERT(INT, SUBSTRING(@Base12, @Posicion, 1));
        SET @Suma +=
            CASE WHEN @Posicion % 2 = 1 THEN @Digito ELSE @Digito * 3 END;
        SET @Posicion += 1;
    END;

    DECLARE @DigitoCalculado INT = (10 - (@Suma % 10)) % 10;
    DECLARE @TieneDigito BIT = CASE WHEN LEN(@Digitos) >= 13 THEN 1 ELSE 0 END;
    DECLARE @DigitoValido BIT =
        CASE
            WHEN @TieneDigito = 0 THEN NULL
            WHEN CONVERT(INT, SUBSTRING(@Digitos, 13, 1)) = @DigitoCalculado
                THEN 1
            ELSE 0
        END;

    INSERT INTO @Resultado
    (
        UPC_DIGITOS,
        BASE12,
        EAN13,
        TIENE_DIGITO_VERIFICADOR,
        DIGITO_VERIFICADOR_VALIDO
    )
    VALUES
    (
        @Digitos,
        @Base12,
        @Base12 + CONVERT(CHAR(1), @DigitoCalculado),
        @TieneDigito,
        @DigitoValido
    );

    RETURN;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_datart_ean13_auditar
    @SUC NVARCHAR(5) = NULL,
    @ART NVARCHAR(10) = NULL,
    @SoloInvalidos BIT = 0,
    @Resumen BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    IF @Resumen = 1
    BEGIN
        SELECT
            COUNT_BIG(*) AS TOTAL_ARTICULOS,
            SUM(CASE WHEN info.TIENE_DIGITO_VERIFICADOR = 1 THEN 1 ELSE 0 END)
                AS UPC_CON_DIGITO_VERIFICADOR,
            SUM(CASE WHEN info.DIGITO_VERIFICADOR_VALIDO = 1 THEN 1 ELSE 0 END)
                AS DIGITO_VERIFICADOR_VALIDO,
            SUM(CASE WHEN info.DIGITO_VERIFICADOR_VALIDO = 0 THEN 1 ELSE 0 END)
                AS DIGITO_VERIFICADOR_INVALIDO,
            SUM(CASE WHEN info.EAN13 IS NULL THEN 1 ELSE 0 END)
                AS UPC_SIN_DIGITOS
        FROM dbo.DAT_ART AS art
        OUTER APPLY dbo.fn_datart_ean13_info(art.UPC) AS info
        WHERE (@SUC IS NULL OR art.SUC = @SUC)
          AND (@ART IS NULL OR art.ART = @ART);
        RETURN;
    END;

    SELECT
        art.SUC,
        art.ART,
        art.UPC,
        info.UPC_DIGITOS,
        info.BASE12,
        info.EAN13,
        info.TIENE_DIGITO_VERIFICADOR,
        info.DIGITO_VERIFICADOR_VALIDO
    FROM dbo.DAT_ART AS art
    OUTER APPLY dbo.fn_datart_ean13_info(art.UPC) AS info
    WHERE (@SUC IS NULL OR art.SUC = @SUC)
      AND (@ART IS NULL OR art.ART = @ART)
      AND
      (
          @SoloInvalidos = 0
          OR info.DIGITO_VERIFICADOR_VALIDO = 0
      )
    ORDER BY art.SUC, art.ART, art.UPC;
END;
GO
