CREATE OR ALTER PROCEDURE dbo.sp_ctrlctas_resumen_transaccion
  @Sucs dbo.StringList255 READONLY,
  @Ctas dbo.StringList255 READONLY,
  @Clients dbo.StringList255 READONLY,
  @Clsds dbo.StringList255 READONLY,
  @IdFols dbo.StringList255 READONLY,
  @Opvs dbo.StringList255 READONLY,
  @FecIni datetime = NULL,
  @FecFin datetime = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    ctas.CLIENT,
    cli.RazonSocialReceptor,
    ctas.CTA,
    ctas.IDFOL,
    SUM(ISNULL(ctas.IMPT, 0)) AS TOTAL
  FROM dbo.DAT_CTRL_CTAS ctas
  LEFT JOIN dbo.FACT_CLIENT_SHP cli
    ON cli.IDC = ctas.CLIENT
  WHERE
    (NOT EXISTS(SELECT 1 FROM @Sucs) OR ctas.SUC IN (SELECT Value FROM @Sucs))
    AND (NOT EXISTS(SELECT 1 FROM @Ctas) OR ctas.CTA IN (SELECT Value FROM @Ctas))
    AND (NOT EXISTS(SELECT 1 FROM @Clsds) OR ctas.CLSD IN (SELECT Value FROM @Clsds))
    AND (NOT EXISTS(SELECT 1 FROM @IdFols) OR ctas.IDFOL IN (SELECT Value FROM @IdFols))
    AND (NOT EXISTS(SELECT 1 FROM @Clients) OR CAST(ctas.CLIENT AS nvarchar(255)) IN (SELECT Value FROM @Clients))
    AND (@FecIni IS NULL OR ctas.FCND >= @FecIni)
    AND (@FecFin IS NULL OR ctas.FCND < DATEADD(day, 1, @FecFin))
    AND (
      COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
      OR NOT EXISTS(SELECT 1 FROM @Opvs)
      OR EXISTS (
        SELECT 1
        FROM OPENJSON((SELECT ctas.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) opv
        WHERE opv.[key] = 'IDOPV'
          AND LTRIM(RTRIM(CONVERT(nvarchar(255), opv.[value]))) IN (SELECT Value FROM @Opvs)
      )
    )
  GROUP BY ctas.CLIENT, cli.RazonSocialReceptor, ctas.CTA, ctas.IDFOL
  ORDER BY ctas.CLIENT, ctas.CTA, ctas.IDFOL;
END;
GO
