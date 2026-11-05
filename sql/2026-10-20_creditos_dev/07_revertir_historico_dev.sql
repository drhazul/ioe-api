/* Recuperacion TECNICA por batch de migracion erronea, no flujo comercial.
   Fecha fincada no se revierte por devolucion parcial/total ni reapertura.
   VALIDAR por defecto. Exclusivo desarrollo; no invocar por devoluciones. */
IF DB_NAME()<>N'IOEDESARROLLO' OR @@SERVERNAME<>N'dd7842d7ba7e' THROW 53301,'Destino no autorizado.',1;
SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 5000;
DECLARE @Aplicar bit=0,@BatchOrigen uniqueidentifier=NULL,@HashEsperado varchar(64)=NULL,@ConteoEsperado int=NULL;
IF @BatchOrigen IS NULL THROW 53600,'Batch origen requerido.',1;
IF @@TRANCOUNT<>0 THROW 53601,'Ejecutar sin transaccion externa.',1;
BEGIN TRY
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  BEGIN TRAN;
  DECLARE @lock int;
  EXEC @lock=sys.sp_getapplock @Resource=N'PS_CREDITOS_CONFIG_V1',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
  IF @lock<0 THROW 53602,'Credito ocupado.',1;
  SELECT a.*,p.FCNPGOCRED ACTUAL INTO #Rev FROM dbo.PV_CRED_FECHA_AUDIT a
    JOIN dbo.PV_CTR_FOL_ASVR p WITH(UPDLOCK,HOLDLOCK) ON p.IDFOL=a.IDFOL WHERE a.BATCH_ID=@BatchOrigen;
  IF NOT EXISTS(SELECT 1 FROM #Rev) OR EXISTS(SELECT 1 FROM #Rev WHERE POLITICA_FECHA NOT IN('REGISTRO','UTC_A_MEXICO')
      OR FECHA_DESPUES IS NULL OR ACTUAL IS NULL OR ACTUAL<>FECHA_DESPUES)
    THROW 53603,'Batch no historico, inexistente o fecha cambio despues.',1;
  IF EXISTS(SELECT 1 FROM #Rev a JOIN dbo.PV_CRED_FECHA_AUDIT x ON x.IDFOL=a.IDFOL AND x.ID>a.ID)
    OR EXISTS(SELECT 1 FROM #Rev a JOIN dbo.PV_CRED_ABONO_REL r ON r.IDFOL_CREDITO=a.IDFOL AND r.FCNR_UTC>a.FCNR_UTC)
    THROW 53604,'Credito tiene actividad/auditoria posterior.',1;
  IF EXISTS(SELECT 1 FROM #Rev a OUTER APPLY(SELECT SUM(CONVERT(decimal(19,4),c.IMPT)) SALDO
      FROM dbo.DAT_CTRL_CTAS c WITH(UPDLOCK,HOLDLOCK) WHERE c.IDFOL=a.IDFOL AND c.CLIENT=a.CLIENT AND c.CTA=a.CTA)s
      WHERE s.SALDO IS NULL OR s.SALDO<>0) THROW 53605,'Saldo del credito cambio.',1;
  DECLARE @json nvarchar(max)=(SELECT
    JSON_QUERY((SELECT * FROM #Rev ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)) fechas,
    JSON_QUERY((SELECT c.* FROM dbo.DAT_CTRL_CTAS c WHERE EXISTS(SELECT 1 FROM #Rev a WHERE a.IDFOL=c.IDFOL AND a.CLIENT=c.CLIENT AND a.CTA=c.CTA)
      ORDER BY c.NDOC FOR JSON PATH,INCLUDE_NULL_VALUES)) movimientos FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
  DECLARE @hash varchar(64)=CONVERT(varchar(64),HASHBYTES('SHA2_256',@json),2),@n int=(SELECT COUNT(*) FROM #Rev),@nuevo uniqueidentifier=NEWID();
  SELECT @hash HASH,@n CONTEO,@BatchOrigen BATCH_ORIGEN;
  IF @Aplicar=1
  BEGIN
    IF @HashEsperado IS NULL OR @ConteoEsperado IS NULL OR @HashEsperado<>@hash OR @ConteoEsperado<>@n
      THROW 53606,'Conteo/hash de reversa desactualizados.',1;
    INSERT dbo.PV_CRED_FECHA_AUDIT(BATCH_ID,IDFOL,CLIENT,CTA,FECHA_ANTES,FECHA_DESPUES,FECHA_REGISTRO,POLITICA_FECHA,IDFOL_PS,HASH_FUENTE,FCNR_UTC)
      SELECT @nuevo,IDFOL,CLIENT,CTA,ACTUAL,FECHA_ANTES,FECHA_REGISTRO,'REVERSA_DEV',IDFOL_PS,CONVERT(varbinary(32),@hash,2),SYSUTCDATETIME() FROM #Rev;
    UPDATE p SET FCNPGOCRED=a.FECHA_ANTES FROM dbo.PV_CTR_FOL_ASVR p JOIN #Rev a ON a.IDFOL=p.IDFOL WHERE p.FCNPGOCRED=a.ACTUAL;
    IF @@ROWCOUNT<>@n THROW 53607,'Conteo de reversa incorrecto.',1;
    SELECT @nuevo BATCH_REVERSA,@n FILAS;
  END;
  COMMIT;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  THROW;
END CATCH;
