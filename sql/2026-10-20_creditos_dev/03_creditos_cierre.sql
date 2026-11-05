/* Helpers internos del cierre; requieren transaccion del caller. No conceder EXECUTE publico. */
CREATE OR ALTER PROCEDURE dbo.sp_ps_creditos_preparar
  @IDFOL_PS nvarchar(255),@CLIENT float,@SUC_COBRO nvarchar(20),@CONTEXTO nvarchar(max) OUTPUT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  SET @CONTEXTO=N'[]';
  IF @@TRANCOUNT=0 OR XACT_STATE()<>1 THROW 53500,'Creditos requiere transaccion activa.',1;
  IF NOT EXISTS(SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL=@IDFOL_PS AND UPPER(LTRIM(RTRIM(UPC)))='CR') RETURN;
  DECLARE @lock int,@empresaCobro int;
  EXEC @lock=sys.sp_getapplock @Resource=N'PS_CREDITOS_CONFIG_V1',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
  IF @lock<0 THROW 53501,'Credito/configuracion ocupados; reintente.',1;
  SELECT @empresaCobro=IDEMPRESA FROM dbo.DAT_SUC WITH(UPDLOCK,HOLDLOCK) WHERE SUC=@SUC_COBRO;
  IF @empresaCobro IS NULL THROW 53502,'Sucursal cobradora sin empresa configurada.',1;
  IF NOT EXISTS(SELECT 1 FROM dbo.DAT_CMOV WHERE RELACION='CR' AND TIPO='ABONO' AND CMOV=601)
    OR NOT EXISTS(SELECT 1 FROM dbo.DAT_CAT_CTAS WHERE RELACION='CR' AND CTA='101001002')
    OR EXISTS(SELECT 1 FROM dbo.DAT_CAT_CTAS WHERE RELACION='CR' AND (CTA IS NULL OR CTA<>'101001002'))
    THROW 53503,'Mapeo contable CR incompatible.',1;
  IF EXISTS(SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL=@IDFOL_PS AND UPPER(LTRIM(RTRIM(UPC)))='CR'
      AND (NULLIF(LTRIM(RTRIM(ORD)),'') IS NULL OR PVTA IS NULL OR PVTA<=0 OR CTD IS NULL OR CTD<=0))
    THROW 53504,'Referencia, cantidad e importe CR deben ser positivos.',1;

  DECLARE @raw table(REF nvarchar(255) PRIMARY KEY,ABONO decimal(19,4) NOT NULL,IDFOL nvarchar(255) NULL);
  INSERT @raw(REF,ABONO) SELECT LTRIM(RTRIM(ORD)),SUM(ROUND(CONVERT(decimal(19,4),PVTA)*CONVERT(decimal(19,4),CTD),4))
    FROM dbo.PV_TICKET_LOG WITH(UPDLOCK,HOLDLOCK) WHERE IDFOL=@IDFOL_PS AND UPPER(LTRIM(RTRIM(UPC)))='CR' GROUP BY LTRIM(RTRIM(ORD));
  /* Una referencia exacta domina sobre aliases; si no existe, alias debe ser unico. */
  UPDATE r SET IDFOL=p.IDFOL FROM @raw r JOIN dbo.PV_CTR_FOL_ASVR p WITH(UPDLOCK,HOLDLOCK) ON p.IDFOL=r.REF;
  IF EXISTS(SELECT 1 FROM @raw r WHERE r.IDFOL IS NULL AND
      (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_ASVR p WITH(UPDLOCK,HOLDLOCK) WHERE p.IDFOLINICIAL=r.REF)<>1)
    THROW 53505,'Referencia de credito inexistente o ambigua.',1;
  UPDATE r SET IDFOL=p.IDFOL FROM @raw r JOIN dbo.PV_CTR_FOL_ASVR p WITH(UPDLOCK,HOLDLOCK)
    ON p.IDFOLINICIAL=r.REF WHERE r.IDFOL IS NULL;
  DECLARE @ctx table(IDFOL nvarchar(255) PRIMARY KEY,CLIENT float,CTA nvarchar(255),ABONO decimal(19,4),
    SALDO_ANTES decimal(19,4),SUC_ORIGEN nvarchar(10),IDEMPRESA int,PERMITIR bit);
  INSERT @ctx(IDFOL,CLIENT,CTA,ABONO) SELECT IDFOL,@CLIENT,N'101001002',SUM(ABONO) FROM @raw GROUP BY IDFOL;
  DECLARE @id nvarchar(255),@abono decimal(19,4),@saldo decimal(19,4),@cli float,@suc nvarchar(255),
    @empresa int,@permitir bit,@estado nvarchar(255),@invalidos int,@cargos int;
  DECLARE credit_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT IDFOL,ABONO FROM @ctx ORDER BY IDFOL;
  OPEN credit_cursor; FETCH NEXT FROM credit_cursor INTO @id,@abono;
  WHILE @@FETCH_STATUS=0
  BEGIN
    SELECT @cli=CLIEN,@suc=SUC,@estado=ESTA FROM dbo.PV_CTR_FOL_ASVR WITH(UPDLOCK,HOLDLOCK) WHERE IDFOL=@id;
    IF @id=@IDFOL_PS OR @cli IS NULL OR @cli<>@CLIENT THROW 53506,'Credito y pago pertenecen a clientes distintos o referencia invalida.',1;
    IF @estado IS NULL OR @estado IN('ANULADO','ANULADA','CANCELADO','PENDIENTE','EDITANDO') THROW 53507,'Credito origen no concretado.',1;
    IF NOT EXISTS(SELECT 1 FROM dbo.PV_CTR_FOL_FORM WHERE IDFOL=@id AND UPPER(LTRIM(RTRIM(FORM)))='CREDITO' AND IMPP>0)
      THROW 53508,'Origen sin forma CREDITO verificable.',1;
    SET @empresa=NULL; SET @permitir=NULL;
    SELECT @empresa=IDEMPRESA FROM dbo.DAT_SUC WITH(UPDLOCK,HOLDLOCK) WHERE SUC=@suc;
    SELECT @permitir=PERMITIR_PARCIAL FROM dbo.fn_creditos_config_efectiva(CONVERT(nvarchar(10),@suc));
    IF @empresa IS NULL OR @permitir IS NULL THROW 53509,'Credito sin configuracion de empresa/sucursal.',1;
    IF @empresa<>@empresaCobro THROW 53510,'No se permite cobrar credito de otra empresa.',1;
    IF EXISTS(SELECT 1 FROM dbo.DAT_CTRL_CTAS WITH(UPDLOCK,HOLDLOCK) WHERE IDFOL=@id AND CTA='101001002' AND (CLIENT IS NULL OR CLIENT<>@CLIENT))
      THROW 53511,'Credito contable con cliente inconsistente.',1;
    SELECT @saldo=SUM(CONVERT(decimal(19,4),IMPT)),
      @invalidos=SUM(CASE WHEN (CLSD='602' AND IMPT<0) OR (CLSD='601' AND IMPT>0) THEN 0 ELSE 1 END),
      @cargos=SUM(CASE WHEN CLSD='602' AND IMPT<0 THEN 1 ELSE 0 END)
      FROM dbo.DAT_CTRL_CTAS WITH(UPDLOCK,HOLDLOCK) WHERE IDFOL=@id AND CLIENT=@CLIENT AND CTA='101001002';
    IF @saldo IS NULL OR @saldo>=0 OR @cargos=0 OR @invalidos>0 THROW 53512,'Credito sin deuda valida pendiente.',1;
    /* FCNPGOCRED es historica y permanente: una deuda posterior no invalida esa fecha. */
    IF @abono<=0 OR @abono>-@saldo THROW 53514,'Abono excede saldo pendiente del credito.',1;
    IF @permitir=0 AND @abono<>-@saldo THROW 53515,'Parcialidades desactivadas: liquide saldo completo del credito.',1;
    UPDATE @ctx SET SALDO_ANTES=@saldo,SUC_ORIGEN=CONVERT(nvarchar(10),@suc),IDEMPRESA=@empresa,PERMITIR=@permitir WHERE IDFOL=@id;
    FETCH NEXT FROM credit_cursor INTO @id,@abono;
  END;
  CLOSE credit_cursor; DEALLOCATE credit_cursor;
  UPDATE t SET ORD=r.IDFOL FROM dbo.PV_TICKET_LOG t JOIN @raw r ON r.REF=LTRIM(RTRIM(t.ORD))
    WHERE t.IDFOL=@IDFOL_PS AND UPPER(LTRIM(RTRIM(t.UPC)))='CR' AND t.ORD<>r.IDFOL;
  SET @CONTEXTO=(SELECT * FROM @ctx ORDER BY IDFOL FOR JSON PATH);
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_ps_creditos_confirmar
  @IDFOL_PS nvarchar(255),@CONTEXTO nvarchar(max),@MOVIMIENTOS nvarchar(max),@FECHA_PAGO datetime,@ACTOR nvarchar(255)=NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @@TRANCOUNT=0 OR XACT_STATE()<>1 THROW 53520,'Confirmacion requiere transaccion activa.',1;
  IF ISJSON(@CONTEXTO)<>1 OR ISJSON(@MOVIMIENTOS)<>1 THROW 53521,'Contexto de credito invalido.',1;
  IF @CONTEXTO=N'[]' RETURN;
  DECLARE @ctx table(IDFOL nvarchar(255) PRIMARY KEY,CLIENT float,CTA nvarchar(255),ABONO decimal(19,4),SALDO_ANTES decimal(19,4));
  INSERT @ctx SELECT IDFOL,CLIENT,CTA,ABONO,SALDO_ANTES FROM OPENJSON(@CONTEXTO) WITH(
    IDFOL nvarchar(255),CLIENT float,CTA nvarchar(255),ABONO decimal(19,4),SALDO_ANTES decimal(19,4));
  DECLARE @mov table(NDOC nvarchar(255) PRIMARY KEY,IDFOL nvarchar(255),IMPORTE decimal(19,4));
  INSERT @mov SELECT NDOC,IDFOL,IMPORTE FROM OPENJSON(@MOVIMIENTOS) WITH(NDOC nvarchar(255),IDFOL nvarchar(255),IMPORTE decimal(19,4));
  IF @FECHA_PAGO IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL=@IDFOL_PS AND ESTA='PAGADO')
    THROW 53522,'Pago PS no confirmado.',1;
  IF NOT EXISTS(SELECT 1 FROM @mov) OR EXISTS(SELECT 1 FROM @ctx c OUTER APPLY(
      SELECT SUM(m.IMPORTE) TOTAL FROM @mov m WHERE m.IDFOL=c.IDFOL)x WHERE x.TOTAL IS NULL OR x.TOTAL<>c.ABONO)
    OR EXISTS(SELECT 1 FROM @mov m WHERE NOT EXISTS(SELECT 1 FROM @ctx c WHERE c.IDFOL=m.IDFOL))
    THROW 53523,'Abonos generados no concilian con creditos.',1;
  IF EXISTS(SELECT 1 FROM @mov m JOIN @ctx c ON c.IDFOL=m.IDFOL
      LEFT JOIN dbo.DAT_CTRL_CTAS d ON d.NDOC=m.NDOC
      WHERE d.NDOC IS NULL OR d.IDFOL<>c.IDFOL OR d.CLIENT IS NULL OR d.CLIENT<>c.CLIENT
        OR d.CTA IS NULL OR d.CTA<>c.CTA OR d.CLSD IS NULL OR d.CLSD<>'601'
        OR d.IMPT IS NULL OR d.IMPT<>m.IMPORTE OR d.FCND IS NULL OR d.FCND<>@FECHA_PAGO)
    THROW 53524,'Movimiento contable generado inconsistente.',1;
  DECLARE @saldos table(IDFOL nvarchar(255) PRIMARY KEY,SALDO decimal(19,4));
  INSERT @saldos SELECT c.IDFOL,SUM(CONVERT(decimal(19,4),d.IMPT)) FROM @ctx c
    JOIN dbo.DAT_CTRL_CTAS d WITH(UPDLOCK,HOLDLOCK) ON d.IDFOL=c.IDFOL AND d.CLIENT=c.CLIENT AND d.CTA=c.CTA GROUP BY c.IDFOL;
  IF EXISTS(SELECT 1 FROM @ctx c LEFT JOIN @saldos s ON s.IDFOL=c.IDFOL
      WHERE s.SALDO IS NULL OR s.SALDO<>c.SALDO_ANTES+c.ABONO OR s.SALDO>0)
    THROW 53525,'Saldo posterior no coincide con abono.',1;
  INSERT dbo.PV_CRED_ABONO_REL(NDOC,IDFOL_PS,IDFOL_CREDITO,CLIENT,CTA,IMPORTE,FECHA_PAGO)
    SELECT m.NDOC,@IDFOL_PS,c.IDFOL,c.CLIENT,c.CTA,m.IMPORTE,@FECHA_PAGO FROM @mov m JOIN @ctx c ON c.IDFOL=m.IDFOL;
  DECLARE @batch uniqueidentifier=NEWID();
  INSERT dbo.PV_CRED_FECHA_AUDIT(BATCH_ID,IDFOL,CLIENT,CTA,FECHA_ANTES,FECHA_DESPUES,FECHA_REGISTRO,POLITICA_FECHA,IDFOL_PS,ACTOR,FCNR_UTC)
    SELECT @batch,c.IDFOL,c.CLIENT,c.CTA,p.FCNPGOCRED,@FECHA_PAGO,@FECHA_PAGO,'MEXICO_CIERRE',@IDFOL_PS,
      COALESCE(NULLIF(@ACTOR,''),ORIGINAL_LOGIN()),SYSUTCDATETIME()
    FROM @ctx c JOIN @saldos s ON s.IDFOL=c.IDFOL JOIN dbo.PV_CTR_FOL_ASVR p ON p.IDFOL=c.IDFOL
    WHERE s.SALDO=0 AND p.FCNPGOCRED IS NULL;
  /* Una vez fincada, conservar incluso tras devolucion parcial/total y otros abonos. */
  UPDATE p SET FCNPGOCRED=@FECHA_PAGO FROM dbo.PV_CTR_FOL_ASVR p JOIN @saldos s ON s.IDFOL=p.IDFOL
    WHERE s.SALDO=0 AND p.FCNPGOCRED IS NULL;
END;
