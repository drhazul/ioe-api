/* Reversa sólo para estructura vacía de IOEDESARROLLO. Modo seguro: no ejecuta. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar bit=0,
        @ServidorEsperado nvarchar(128)=N'dd7842d7ba7e',
        @BaseEsperada sysname=N'IOEDESARROLLO';

IF DB_NAME()<>@BaseEsperada OR @@SERVERNAME<>@ServidorEsperado
  THROW 53420,'Reversa permitida sólo en IOEDESARROLLO del servidor autorizado.',1;
IF OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP',N'U') IS NULL OR
   OBJECT_ID(N'dbo.INT_ODOO_CTA_MAP_AUDIT',N'U') IS NULL
  THROW 53421,'Falta una tabla; no se ejecuta reversa parcial.',1;

SELECT @@SERVERNAME servidor,DB_NAME() base,
  (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP) mapeos,
  (SELECT COUNT_BIG(*) FROM dbo.INT_ODOO_CTA_MAP_AUDIT) auditorias,
  @Aplicar aplicar;
IF @Aplicar=0 RETURN;
IF EXISTS(SELECT 1 FROM dbo.INT_ODOO_CTA_MAP) OR EXISTS(SELECT 1 FROM dbo.INT_ODOO_CTA_MAP_AUDIT)
  THROW 53422,'Hay datos de mapeo/auditoría; conservarlos y preparar reversa específica.',1;

BEGIN TRY
  BEGIN TRAN;
  DROP TABLE dbo.INT_ODOO_CTA_MAP_AUDIT;
  DROP TABLE dbo.INT_ODOO_CTA_MAP;
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
END CATCH;
