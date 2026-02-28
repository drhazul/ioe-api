-- Ajuste de CLIEN para soportar IDs grandes (IDC > int32)
-- Ejecutar una sola vez en SQL Server.
IF COL_LENGTH('dbo.PV_CTR_ORDS', 'CLIEN') IS NOT NULL
BEGIN
  ALTER TABLE dbo.PV_CTR_ORDS ALTER COLUMN CLIEN FLOAT NULL;
END;
GO
