CREATE OR ALTER PROCEDURE dbo.sp_dat_mb52_resumen
  @sucs NVARCHAR(MAX) = NULL,
  @almacenes NVARCHAR(MAX) = NULL,
  @arts NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    M.SUC,
    M.ART,
    MAX(A.DES) AS DES,
    M.ALMACEN,
    SUM(ISNULL(M.CTDA, 0)) AS STOCK_TOTAL_CTDA,
    SUM(ISNULL(M.CTOT, 0)) AS COSTO_TOTAL_CTOT
  FROM dbo.DAT_MB51 M
  LEFT JOIN (
    SELECT SUC, ART, MAX(DES) AS DES
    FROM dbo.DAT_ART
    GROUP BY SUC, ART
  ) A ON A.SUC = M.SUC AND A.ART = M.ART
  WHERE (
      @sucs IS NULL OR EXISTS (
        SELECT 1
        FROM string_split(@sucs, ',') s
        WHERE LTRIM(RTRIM(s.value)) = M.SUC
      )
    )
    AND (
      @almacenes IS NULL OR EXISTS (
        SELECT 1
        FROM string_split(@almacenes, ',') s
        WHERE LTRIM(RTRIM(s.value)) = M.ALMACEN
      )
    )
    AND (
      @arts IS NULL OR EXISTS (
        SELECT 1
        FROM string_split(@arts, ',') s
        WHERE LTRIM(RTRIM(s.value)) = M.ART
      )
    )
  GROUP BY M.SUC, M.ART, M.ALMACEN
  ORDER BY M.SUC ASC, M.ART ASC, M.ALMACEN ASC;
END;
GO
