SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Patch puntual para consulta de adeudos PS:
-- - agrega filtro opcional por folio (@FOLIO)
-- - incluye FCNM y ORIGEN_AUT desde PV_CTR_FOL_ASVR
-- - agrupa por CLIENT/FCNM/IDFOL/ORIGEN_AUT
-- - conserva adeudosRes (solo adeudos negativos)

CREATE OR ALTER PROCEDURE dbo.sp_ps_adeudos_cliente
  @CLIENT BIGINT,
  @FOLIO NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @jsonR NVARCHAR(MAX) = '[]';
  DECLARE @jsonRes NVARCHAR(MAX) = '[]';
  DECLARE @folioNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@FOLIO, ''))));

  IF OBJECT_ID('dbo.DAT_CTRL_CTAS', 'U') IS NULL
    THROW 57026, 'No existe DAT_CTRL_CTAS para consultar adeudos de cliente', 1;

  IF OBJECT_ID('dbo.PV_CTR_FOL_ASVR', 'U') IS NULL
    THROW 57044, 'No existe PV_CTR_FOL_ASVR para consultar adeudos de cliente', 1;

  ;WITH q AS (
    SELECT
      TRY_CONVERT(BIGINT, c.CLIENT) AS CLIENT,
      p.FCNM,
      LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))) AS IDFOL,
      UPPER(LTRIM(RTRIM(ISNULL(CAST(p.ORIGEN_AUT AS NVARCHAR(10)), '')))) AS ORIGEN_AUT,
      ISNULL(
        CASE
          WHEN COUNT(DISTINCT NULLIF(rel.RELACION, '')) = 1
            THEN MAX(NULLIF(rel.RELACION, ''))
          ELSE 'MIXTA'
        END,
        '-'
      ) AS RELACION,
      ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18, 4), c.IMPT), 0)), 4) AS ADEUDO
    FROM dbo.DAT_CTRL_CTAS c
    INNER JOIN dbo.PV_CTR_FOL_ASVR p
      ON UPPER(LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), ''))))
       = UPPER(LTRIM(RTRIM(ISNULL(CAST(p.IDFOL AS NVARCHAR(255)), ''))))
    OUTER APPLY (
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(x.RELACION, '')))) AS RELACION
      FROM dbo.DAT_CAT_CTAS x
      WHERE UPPER(LTRIM(RTRIM(ISNULL(x.CTA, ''))))
          = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.CTA AS NVARCHAR(50)), ''))))
        AND (
          UPPER(LTRIM(RTRIM(ISNULL(x.SUC, ''))))
            = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
          OR LTRIM(RTRIM(ISNULL(x.SUC, ''))) = ''
        )
      ORDER BY CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(x.SUC, ''))))
           = UPPER(LTRIM(RTRIM(ISNULL(CAST(c.SUC AS NVARCHAR(10)), ''))))
          THEN 0
        ELSE 1
      END
    ) rel
    WHERE TRY_CONVERT(BIGINT, c.CLIENT) = @CLIENT
      AND (
        @folioNorm = ''
        OR UPPER(LTRIM(RTRIM(ISNULL(CAST(c.IDFOL AS NVARCHAR(255)), '')))) LIKE '%' + @folioNorm + '%'
      )
    GROUP BY
      c.CLIENT,
      p.FCNM,
      c.IDFOL,
      p.ORIGEN_AUT
    HAVING ROUND(SUM(ISNULL(TRY_CONVERT(DECIMAL(18, 4), c.IMPT), 0)), 4) <> 0
  )
  SELECT
    @jsonR = ISNULL((
      SELECT CLIENT, FCNM, IDFOL, ORIGEN_AUT, RELACION, ADEUDO AS SumaDeIMPT, ADEUDO
      FROM q
      ORDER BY FCNM
      FOR JSON PATH
    ), '[]'),
    @jsonRes = ISNULL((
      SELECT CLIENT, FCNM, IDFOL, ORIGEN_AUT, RELACION, ADEUDO AS SumaDeIMPT, ADEUDO
      FROM q
      WHERE ADEUDO < 0
      ORDER BY FCNM
      FOR JSON PATH
    ), '[]');

  SELECT
    @jsonR AS ADEUDOS_R_JSON,
    @jsonRes AS ADEUDOS_RES_JSON;
END;
GO

