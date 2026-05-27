/*
  Área responsable por artículo en detalle de merma.
*/
IF COL_LENGTH('dbo.DET_ART_MERMA', 'AREAM') IS NULL
BEGIN
  ALTER TABLE dbo.DET_ART_MERMA
    ADD AREAM NVARCHAR(120) NULL;
END
GO

