CREATE OR ALTER PROCEDURE dbo.sp_dat_mb51_search
  @fecha_doc_desde DATETIME = NULL,
  @fecha_doc_hasta DATETIME = NULL,
  @fecha_cont_desde DATETIME = NULL,
  @fecha_cont_hasta DATETIME = NULL,
  @art NVARCHAR(255) = NULL,
  @docp NVARCHAR(255) = NULL,
  @almacen VARCHAR(255) = NULL,
  @suc VARCHAR(255) = NULL,
  @clsm FLOAT = NULL,
  @vtaesp INT = NULL,
  @user NVARCHAR(255) = NULL,
  @txt NVARCHAR(255) = NULL,
  @arts NVARCHAR(MAX) = NULL,
  @almacenes NVARCHAR(MAX) = NULL,
  @sucs NVARCHAR(MAX) = NULL,
  @clsms NVARCHAR(MAX) = NULL,
  @page INT = 1,
  @limit INT = 50
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    M.IDPD,
    M.[USER],
    M.CLSM,
    M.DOCP,
    M.ART,
    A.DES AS DES,
    M.CTDA,
    M.CTOT,
    M.FCND,
    M.FCNC,
    M.TXT,
    M.ALMACEN,
    M.VTAESP,
    M.SUC,
    COUNT(1) OVER() AS TOTAL_COUNT
  FROM dbo.DAT_MB51 M
  LEFT JOIN (
    SELECT SUC, ART, MAX(DES) AS DES
    FROM dbo.DAT_ART
    GROUP BY SUC, ART
  ) A ON A.SUC = M.SUC AND A.ART = M.ART
  WHERE (@fecha_doc_desde IS NULL OR M.FCND >= @fecha_doc_desde)
    AND (@fecha_doc_hasta IS NULL OR M.FCND <= @fecha_doc_hasta)
    AND (@fecha_cont_desde IS NULL OR M.FCNC >= @fecha_cont_desde)
    AND (@fecha_cont_hasta IS NULL OR M.FCNC <= @fecha_cont_hasta)
    AND (
      (@arts IS NULL AND (@art IS NULL OR M.ART LIKE '%' + @art + '%'))
      OR (@arts IS NOT NULL AND EXISTS (
        SELECT 1 FROM string_split(@arts, ',') s
        WHERE LTRIM(RTRIM(s.value)) = M.ART
      ))
    )
    AND (@docp IS NULL OR M.DOCP LIKE '%' + @docp + '%')
    AND (
      (@almacenes IS NULL AND (@almacen IS NULL OR M.ALMACEN = @almacen))
      OR (@almacenes IS NOT NULL AND EXISTS (
        SELECT 1 FROM string_split(@almacenes, ',') s
        WHERE LTRIM(RTRIM(s.value)) = M.ALMACEN
      ))
    )
    AND (
      (@sucs IS NULL AND (@suc IS NULL OR M.SUC = @suc))
      OR (@sucs IS NOT NULL AND EXISTS (
        SELECT 1 FROM string_split(@sucs, ',') s
        WHERE LTRIM(RTRIM(s.value)) = M.SUC
      ))
    )
    AND (
      (@clsms IS NULL AND (@clsm IS NULL OR M.CLSM = @clsm))
      OR (@clsms IS NOT NULL AND EXISTS (
        SELECT 1 FROM string_split(@clsms, ',') s
        WHERE TRY_CAST(LTRIM(RTRIM(s.value)) AS FLOAT) = M.CLSM
      ))
    )
    AND (@vtaesp IS NULL OR M.VTAESP = @vtaesp)
    AND (@user IS NULL OR M.[USER] LIKE '%' + @user + '%')
    AND (@txt IS NULL OR M.TXT LIKE '%' + @txt + '%')
  ORDER BY M.FCND DESC
  OFFSET CASE WHEN @page IS NULL OR @limit IS NULL OR @page < 1 OR @limit < 1 THEN 0 ELSE (@page - 1) * @limit END ROWS
  FETCH NEXT CASE WHEN @limit IS NULL OR @limit < 1 THEN 2147483647 ELSE @limit END ROWS ONLY;
END;
GO
