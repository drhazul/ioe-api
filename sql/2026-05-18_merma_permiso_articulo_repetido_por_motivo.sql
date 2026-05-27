/*
  2026-05-18
  Regla merma: permitir mismo ART en mismo DOCMER cuando MOT_M sea distinto.
  Solo bloquea duplicado exacto por par (ART, MOT_M) activo.
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_merma_agregar_articulo
  @DOCMER NVARCHAR(50),
  @ART NVARCHAR(100),
  @CTD FLOAT,
  @MOT_M INT,
  @RESP_M NVARCHAR(150) = NULL,
  @OBS_M NVARCHAR(MAX) = NULL,
  @USER NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;

  IF LTRIM(RTRIM(ISNULL(@DOCMER, ''))) = ''
    THROW 59010, 'DOCMER es requerido.', 1;
  IF LTRIM(RTRIM(ISNULL(@ART, ''))) = ''
    THROW 59011, 'ART es requerido.', 1;
  IF ISNULL(@CTD, 0) <= 0
    THROW 59012, 'CTD debe ser mayor a 0.', 1;

  DECLARE @docSuc NVARCHAR(50);
  DECLARE @docEst INT;

  SELECT TOP 1
    @docSuc = LTRIM(RTRIM(ISNULL(SUC, ''))),
    @docEst = ISNULL(ID_ESTATUS, CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(ESTATS, '')))) = 'ABIERTO' THEN 1
      WHEN UPPER(LTRIM(RTRIM(ISNULL(ESTATS, '')))) IN ('REVISION', 'REVISAR') THEN 4
      ELSE -1
    END)
  FROM dbo.DOC_CTRL_MERMA
  WHERE DOCMER = @DOCMER;

  IF @docSuc IS NULL
    THROW 59013, 'Documento no existe.', 1;

  IF @docEst NOT IN (1, 4)
    THROW 59014, 'Solo se pueden agregar articulos en ABIERTO o REVISAR.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.MOT_MERMA WHERE ID = @MOT_M)
    THROW 59015, 'MOT_M no existe en catalogo de motivos.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.DET_ART_MERMA d
    WHERE d.DOCMER = @DOCMER
      AND LTRIM(RTRIM(ISNULL(d.ART, ''))) = LTRIM(RTRIM(ISNULL(@ART, '')))
      AND ISNULL(d.MOT_M, 0) = ISNULL(@MOT_M, 0)
      AND ISNULL(d.BLOQ, 0) <> -1
  )
    THROW 59016, 'No se permite articulo duplicado con el mismo motivo en el mismo documento.', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.DAT_ART a
    WHERE LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @docSuc
      AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(@ART, '')))
  )
    THROW 59017, 'Articulo no existe para la sucursal del documento.', 1;

  DECLARE @cto DECIMAL(18,4);
  DECLARE @mtv NVARCHAR(510);

  SELECT TOP 1 @cto = TRY_CONVERT(DECIMAL(18,4), ISNULL(a.CTOP, 0))
  FROM dbo.DAT_ART a
  WHERE LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @docSuc
    AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(@ART, '')));

  SELECT TOP 1 @mtv = [DESC]
  FROM dbo.MOT_MERMA
  WHERE ID = @MOT_M;

  DECLARE @idpd NVARCHAR(510) = CONVERT(NVARCHAR(36), NEWID());

  INSERT INTO dbo.DET_ART_MERMA
    (SEL, IDPD, DOCMER, ART, CTD, BLOQ, MTVMER, REV, DOCREV, SUC, CTO, MOT_M, RESP_M, OBS_M)
  VALUES
    (0, @idpd, @DOCMER, @ART, @CTD, 0, @mtv, 0, NULL, @docSuc, ISNULL(@cto, 0), @MOT_M, @RESP_M, @OBS_M);

  UPDATE d
  SET d.NARTS = agg.narts,
      d.TOTAL = agg.total,
      d.FCNM = GETDATE()
  FROM dbo.DOC_CTRL_MERMA d
  CROSS APPLY (
    SELECT
      SUM(CASE WHEN ISNULL(x.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(x.CTD, 0) END) AS narts,
      SUM(CASE WHEN ISNULL(x.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(x.CTD, 0) * ISNULL(x.CTO, 0) END) AS total
    FROM dbo.DET_ART_MERMA x
    WHERE x.DOCMER = d.DOCMER
  ) agg
  WHERE d.DOCMER = @DOCMER;

  SELECT TOP 1 *
  FROM dbo.DET_ART_MERMA
  WHERE IDPD = @idpd;
END;
GO
