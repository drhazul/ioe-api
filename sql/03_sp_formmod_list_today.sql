SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_formmod_list_today
  @OPV nvarchar(255),
  @IDFOL nvarchar(255) = NULL,
  @CLIEN nvarchar(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @opvNorm nvarchar(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, N''))));
  DECLARE @idfolNorm nvarchar(255) = LTRIM(RTRIM(ISNULL(@IDFOL, N'')));
  DECLARE @clienNorm nvarchar(255) = LTRIM(RTRIM(ISNULL(@CLIEN, N'')));

  IF @opvNorm = N''
  BEGIN
    THROW 50001, 'El parametro @OPV es obligatorio.', 1;
  END;

  DECLARE @formAutSelect nvarchar(400) =
    CASE
      WHEN COL_LENGTH('dbo.PV_CTR_FOL_FORM_SVR', 'AUT') IS NULL
        THEN N'CAST(NULL AS nvarchar(255))'
      ELSE N'CAST(F.AUT AS nvarchar(255))'
    END;

  DECLARE @sql nvarchar(max) = N'
    SELECT
      CONVERT(date, A.FCN) AS FCN,
      CAST(A.AUT AS nvarchar(10)) AS AUT_ASVR,
      CAST(A.AUT AS nvarchar(10)) AS AUT,
      CAST(A.IDFOL AS nvarchar(255)) AS IDFOL,
      CAST(A.TRA AS nvarchar(255)) AS TRA,
      CAST(A.OPVM AS nvarchar(255)) AS OPVM,
      CAST(A.SUC AS nvarchar(50)) AS SUC,
      CASE
        WHEN TRY_CONVERT(decimal(19,0), A.CLIEN) IS NOT NULL
          THEN CONVERT(nvarchar(255), CONVERT(decimal(19,0), A.CLIEN))
        ELSE LTRIM(RTRIM(CONVERT(nvarchar(255), A.CLIEN)))
      END AS CLIEN,
      CAST(F.IDF AS nvarchar(255)) AS IDF,
      CAST(F.FORM AS nvarchar(255)) AS FORM,
      CAST(ISNULL(F.IMPD, 0) AS decimal(18, 2)) AS IMPD,
      ' + @formAutSelect + N' AS AUT_FORM
    FROM dbo.PV_CTR_FOL_ASVR AS A WITH (NOLOCK)
    LEFT JOIN dbo.PV_CTR_FOL_FORM_SVR AS F WITH (NOLOCK)
      ON F.IDFOL = A.IDFOL
    WHERE CONVERT(date, A.FCN) = CONVERT(date, GETDATE())
      AND A.AUT IN (N''AD'', N''AP'', N''CR'', N''VF'')
      AND UPPER(LTRIM(RTRIM(ISNULL(A.OPVM, N'''')))) = @opvNorm
  ';

  IF @idfolNorm <> N''
    SET @sql += N' AND CAST(A.IDFOL AS nvarchar(255)) LIKE N''%'' + @idfolNorm + N''%''';

  IF @clienNorm <> N''
    SET @sql += N' AND (
      CASE
        WHEN TRY_CONVERT(decimal(19,0), A.CLIEN) IS NOT NULL
          THEN CONVERT(nvarchar(255), CONVERT(decimal(19,0), A.CLIEN))
        ELSE LTRIM(RTRIM(CONVERT(nvarchar(255), A.CLIEN)))
      END
    ) LIKE N''%'' + @clienNorm + N''%''';

  SET @sql += N' ORDER BY A.FCN DESC, A.IDFOL DESC, F.IDF DESC;';

  EXEC sys.sp_executesql
    @sql,
    N'@opvNorm nvarchar(255), @idfolNorm nvarchar(255), @clienNorm nvarchar(255)',
    @opvNorm = @opvNorm,
    @idfolNorm = @idfolNorm,
    @clienNorm = @clienNorm;
END;
GO
