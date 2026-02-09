CREATE OR ALTER PROCEDURE dbo.sp_dat_mb52_resumen
  @sucs NVARCHAR(MAX) = NULL,
  @almacenes NVARCHAR(MAX) = NULL,
  @arts NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    SUC,
    ART,
    ALMACEN,
    SUM(ISNULL(CTDA, 0)) AS STOCK_TOTAL_CTDA,
    SUM(ISNULL(CTOT, 0)) AS COSTO_TOTAL_CTOT
  FROM dbo.DAT_MB51
  WHERE (
      @sucs IS NULL OR EXISTS (
        SELECT 1
        FROM string_split(@sucs, ',') s
        WHERE LTRIM(RTRIM(s.value)) = SUC
      )
    )
    AND (
      @almacenes IS NULL OR EXISTS (
        SELECT 1
        FROM string_split(@almacenes, ',') s
        WHERE LTRIM(RTRIM(s.value)) = ALMACEN
      )
    )
    AND (
      @arts IS NULL OR EXISTS (
        SELECT 1
        FROM string_split(@arts, ',') s
        WHERE LTRIM(RTRIM(s.value)) = ART
      )
    )
  GROUP BY SUC, ART, ALMACEN
  ORDER BY SUC ASC, ART ASC, ALMACEN ASC;
END;
GO
