/* Pruebas SQL reales, solo IOEDESARROLLO. Cada fixture se revierte por ROLLBACK. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const sql=require(path.join(root,'node_modules/mssql'));
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const output=path.resolve(root,'../outputs/integracion_creditos_dev_20261020/tests_sql.json');
let pool,activeTx;const results=[];
let relationBaseline=0;
const req=()=>activeTx?new sql.Request(activeTx):pool.request();
const run=q=>req().query(q);
const quote=x=>"N'"+String(x).replaceAll("'","''")+"'";
const assert=(condition,message)=>{if(!condition)throw Error(message);};
function fixture(extra=''){
 const token='QADEVCR-'+crypto.randomUUID(),credit=token+'-CRED',ps=token+'-PS';
 return {credit,ps,sql:`
 DECLARE @now datetime=CONVERT(datetime,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
 INSERT dbo.PV_CTR_FOL_ASVR(IDFOL,IDFOLINICIAL,CLIEN,SUC,ESTA,AUT,ORIGEN_AUT,IMPT,IMPP,FPGO,FCN,FCNM)
 VALUES(${quote(credit)},${quote(credit)},350295,'DF01','MB51PROCES','CA','CA',100,100,'FINALIZADO',@now,@now),
 (${quote(ps)},${quote(ps)},350295,'DF01','PENDIENTE','PS','CA',40,0,NULL,@now,@now);
 INSERT dbo.PV_CTR_FOL_FORM(IDF,IDFOL,FORM,IMPP,IMPC,IMPD,FCN)
 VALUES(CONVERT(nvarchar(255),NEWID()),${quote(credit)},'CREDITO',100,0,100,@now);
 INSERT dbo.DAT_CTRL_CTAS(NDOC,CTA,CLIENT,FCND,CLSD,IDFOL,RTXT,IMPT,SUC)
 VALUES(${quote(token+'-CARGO')},'101001002',350295,@now,'602',${quote(credit)},'Fixture desarrollo',-100,'DF01');
 INSERT dbo.PV_TICKET_LOG(ID,IDFOL,UPC,ART,DES,CTD,PVTA,PVTAT,ORD)
 VALUES(CONVERT(nvarchar(255),NEWID()),${quote(ps)},'CR','CR-QA','Fixture CR',1,40,40,${quote(credit)});
 ${extra}`};
}
async function config(mode,value,branch=null){
 await run(`DECLARE @v binary(8)=(SELECT VERSION FROM dbo.EMPRESA_CFG WHERE IDEMPRESA=1 AND CLAVE='CRED_PERMITIR_PARCIALIDADES');
 EXEC dbo.sp_creditos_config_set 1,${quote(mode)},${value},@v,N'QA_DEV';`);
 if(branch!==null)await run(`DECLARE @v binary(8)=(SELECT CFG_VERSION FROM dbo.DAT_SUC WHERE SUC='DF01');
 EXEC dbo.sp_creditos_config_sucursal_set @IDEMPRESA=1,@SUC='DF01',@PERMITIR=${branch},@VERSION_ESPERADA=@v,@ACTOR=N'QA_DEV';`);
}
async function pay(ps,amount=40,form='EFECTIVO'){
 return (await req().input('p',sql.NVarChar(255),ps).input('f',sql.NVarChar(sql.MAX),JSON.stringify([{form,impp:amount,aut:form==='EFECTIVO'?null:'QA-REF'}]))
 .query("EXEC dbo.sp_ps_pago_finalize @IDFOL=@p,@FORMAS_JSON=@f,@USER=N'QA_DEV';")).recordset[0];
}
async function balance(credit){return (await req().input('id',sql.NVarChar(255),credit).query(`SELECT p.FCNPGOCRED,
 (SELECT SUM(IMPT) FROM dbo.DAT_CTRL_CTAS WHERE IDFOL=p.IDFOL AND CTA='101001002') saldo,
 (SELECT COUNT(*) FROM dbo.PV_CRED_ABONO_REL WHERE IDFOL_CREDITO=p.IDFOL) relaciones
 FROM dbo.PV_CTR_FOL_ASVR p WHERE p.IDFOL=@id;`)).recordset[0];}
async function test(name,fn,expectedError){
 activeTx=new sql.Transaction(pool);await activeTx.begin();let error;
 try{await fn();}catch(e){error=e;}
 finally{try{await activeTx.rollback();}catch(e){if(!['ENOTBEGUN','EABORT'].includes(e.code))throw e;}activeTx=null;}
 const ok=expectedError?error?.number===expectedError:!error;
 const result={name,ok,...(error?{number:error.number,message:String(error.message).replaceAll(env.DB_PASS||'__NONE__','[REDACTED]')}:{}),expectedError};
 results.push(result);fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify(result));
 if(!ok)throw error||Error('No rechazo esperado: '+name);
}
(async()=>{try{
 pool=await sql.connect({server:'172.16.100.40',port:1434,database:'IOEDESARROLLO',user:env.DB_USER,password:env.DB_PASS,
   connectionTimeout:15000,requestTimeout:30000,pool:{max:1,min:0},options:{encrypt:false,trustServerCertificate:true,appName:'QA_DEV_CREDITOS'}});
 await run("IF DB_NAME()<>'IOEDESARROLLO' OR @@SERVERNAME<>'dd7842d7ba7e' THROW 53301,'Destino no autorizado',1;");
 relationBaseline=(await run('SELECT COUNT(*) n FROM dbo.PV_CRED_ABONO_REL;')).recordset[0].n;
 await test('parcial permitido no fija fecha',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',1);await pay(f.ps);const b=await balance(f.credit);assert(b.saldo===-60&&!b.FCNPGOCRED&&b.relaciones===1,'Parcial incorrecto');});
 await test('pago total fija fecha Mexico y concilia formas',async()=>{const f=fixture();await run(f.sql);await run(`UPDATE dbo.PV_TICKET_LOG SET PVTA=100,PVTAT=100 WHERE IDFOL=${quote(f.ps)};`);const p=await pay(f.ps,100);const b=await balance(f.credit);assert(b.saldo===0&&b.FCNPGOCRED&&b.relaciones===1,'Total incorrecto');const dates=(await run(`SELECT DATEDIFF(second,p.FCNPGOCRED,CONVERT(datetime,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)')) edad FROM dbo.PV_CTR_FOL_ASVR p WHERE p.IDFOL=${quote(f.credit)} AND p.FCNPGOCRED=CONVERT(datetime2(3),(SELECT MIN(FCN) FROM dbo.PV_CTR_FOL_FORM WHERE IDFOL=${quote(p.IDFOL)}));`)).recordset;assert(dates.length===1&&Math.abs(dates[0].edad)<60,'Fecha no coincide con formas/Mexico');});
 await test('dos parciales fecha solo al ultimo',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',1);await pay(f.ps,40);assert(!(await balance(f.credit)).FCNPGOCRED,'Primer abono fijo fecha');const second=f.ps+'-2';await run(`INSERT dbo.PV_CTR_FOL_ASVR(IDFOL,IDFOLINICIAL,CLIEN,SUC,ESTA,AUT,ORIGEN_AUT) VALUES(${quote(second)},${quote(second)},350295,'DF01','PENDIENTE','PS','CA'); INSERT dbo.PV_TICKET_LOG(ID,IDFOL,UPC,ART,CTD,PVTA,PVTAT,ORD) VALUES(CONVERT(nvarchar(255),NEWID()),${quote(second)},'CR','CR-QA',1,60,60,${quote(f.credit)});`);await pay(second,60);const b=await balance(f.credit);assert(b.saldo===0&&b.FCNPGOCRED&&b.relaciones===2,'Segunda parcialidad no liquido');});
 await test('empresa desactiva pago parcial',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',0);await pay(f.ps);},53515);
 await test('fecha fincada se conserva al abonar deuda posterior',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',1);
 await run(`UPDATE dbo.PV_CTR_FOL_ASVR SET FCNPGOCRED='2025-01-02T12:34:56.123' WHERE IDFOL=${quote(f.credit)};`);
 await pay(f.ps,40);const b=await balance(f.credit);
 assert(b.saldo===-60&&b.FCNPGOCRED.toISOString()==='2025-01-02T12:34:56.123Z','Parcial cambio fecha');
 assert((await run(`SELECT COUNT(*) n FROM dbo.PV_CRED_FECHA_AUDIT WHERE IDFOL=${quote(f.credit)};`)).recordset[0].n===0,'Auditoria de fecha sin cambio');});
 await test('nueva liquidacion conserva fecha anterior y registra abono',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',0);
 await run(`UPDATE dbo.PV_CTR_FOL_ASVR SET FCNPGOCRED='2025-01-02T12:34:56.123' WHERE IDFOL=${quote(f.credit)};
 UPDATE dbo.PV_TICKET_LOG SET PVTA=100,PVTAT=100 WHERE IDFOL=${quote(f.ps)};`);
 await pay(f.ps,100);const b=await balance(f.credit);
 assert(b.saldo===0&&b.FCNPGOCRED.toISOString()==='2025-01-02T12:34:56.123Z'&&b.relaciones===1,'No conservo primera fecha/abono');
 assert((await run(`SELECT COUNT(*) n FROM dbo.PV_CRED_FECHA_AUDIT WHERE IDFOL=${quote(f.credit)};`)).recordset[0].n===0,'Audito reemplazo inexistente');});
 await test('empresa desactivada acepta saldo completo',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',0);await run(`UPDATE dbo.PV_TICKET_LOG SET PVTA=100,PVTAT=100 WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps,100);assert((await balance(f.credit)).saldo===0,'No liquido con parcialidad apagada');});
 await test('sucursal permite sobre empresa apagada',async()=>{const f=fixture();await run(f.sql);await config('SUCURSAL',0,1);await pay(f.ps);assert((await balance(f.credit)).saldo===-60,'Override no aplicado');});
 await test('sucursal bloquea sobre empresa encendida',async()=>{const f=fixture();await run(f.sql);await config('SUCURSAL',1,0);await pay(f.ps);},53515);
 await test('varias lineas suman total de mismo credito',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',0);await run(`UPDATE dbo.PV_TICKET_LOG SET PVTA=50,PVTAT=50 WHERE IDFOL=${quote(f.ps)};INSERT dbo.PV_TICKET_LOG(ID,IDFOL,UPC,ART,CTD,PVTA,PVTAT,ORD) VALUES(CONVERT(nvarchar(255),NEWID()),${quote(f.ps)},'CR','CR-QA-2',1,50,50,${quote(f.credit)});`);await pay(f.ps,100);const b=await balance(f.credit);assert(b.saldo===0&&b.relaciones===2,'No agrupo multiples lineas');});
 await test('sobrepago bloqueado',async()=>{const f=fixture();await run(f.sql);await run(`UPDATE dbo.PV_TICKET_LOG SET PVTA=101,PVTAT=101 WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps,101);},53514);
 await test('cliente incorrecto bloqueado',async()=>{const f=fixture();await run(f.sql);await run(`UPDATE dbo.PV_CTR_FOL_ASVR SET CLIEN=350296 WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps);},53506);
 await test('reintento de cierre rechazado',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',1);const first=await pay(f.ps);await pay(first.IDFOL);},57126);
 await test('alias unico se normaliza al credito',async()=>{const f=fixture();await run(f.sql);const alias=f.credit+'-ALIAS';await run(`UPDATE dbo.PV_CTR_FOL_ASVR SET IDFOLINICIAL=${quote(alias)} WHERE IDFOL=${quote(f.credit)}; UPDATE dbo.PV_TICKET_LOG SET ORD=${quote(alias)} WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps);assert((await balance(f.credit)).saldo===-60,'Alias no aplicado');});
 await test('residuo 0.0001 no fija fecha',async()=>{const f=fixture();await run(f.sql);await config('EMPRESA',1);await run(`UPDATE dbo.PV_TICKET_LOG SET PVTA=99.9999,PVTAT=99.9999 WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps,99.9999);const b=await balance(f.credit);assert(b.saldo===-0.0001&&!b.FCNPGOCRED,'Se perdono saldo real');});
 await test('credito de otra empresa bloqueado',async()=>{const f=fixture();await run(f.sql);await run(`INSERT dbo.EMPRESA(razon_social,correo) VALUES(N'QA_DEV_EMPRESA',N'@qa-dev.invalid');
 DECLARE @e int=SCOPE_IDENTITY();INSERT dbo.EMPRESA_CFG(IDEMPRESA,CLAVE,MODO,VALOR_BIT,MODIFICADO_POR) VALUES(@e,'CRED_PERMITIR_PARCIALIDADES','EMPRESA',1,N'QA_DEV');
 UPDATE dbo.DAT_SUC SET IDEMPRESA=@e WHERE SUC='DF01';UPDATE dbo.PV_CTR_FOL_ASVR SET SUC='DF04' WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps);},53510);
 await test('alias ambiguo bloqueado',async()=>{const f=fixture();await run(f.sql);const alias=f.credit+'-ALIAS';await run(`UPDATE dbo.PV_CTR_FOL_ASVR SET IDFOLINICIAL=${quote(alias)} WHERE IDFOL=${quote(f.credit)};
 INSERT dbo.PV_CTR_FOL_ASVR(IDFOL,IDFOLINICIAL,CLIEN,SUC,ESTA,AUT,ORIGEN_AUT) VALUES(${quote(f.credit+'-DUP')},${quote(alias)},350295,'DF01','MB51PROCES','CA','CA');
 UPDATE dbo.PV_TICKET_LOG SET ORD=${quote(alias)} WHERE IDFOL=${quote(f.ps)};`);await pay(f.ps);},53505);
 await test('fallo posterior al abono revierte cierre completo',async()=>{const f=fixture();await run(f.sql);await run(`EXEC(N'CREATE TRIGGER dbo.QA_DEV_CR_FAIL ON dbo.PV_CRED_ABONO_REL AFTER INSERT AS BEGIN SET NOCOUNT ON; THROW 53699,''Fallo inyectado QA desarrollo'',1; END;');`);await pay(f.ps);},53699);
 await test('lock compartido serializa administracion y cobro',async()=>{const other=await new sql.ConnectionPool({server:'172.16.100.40',port:1434,database:'IOEDESARROLLO',user:env.DB_USER,password:env.DB_PASS,options:{encrypt:false,trustServerCertificate:true}}).connect();
 const t=new sql.Transaction(other);await t.begin();try{await new sql.Request(t).query("DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource=N'PS_CREDITOS_CONFIG_V1',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=1000;IF @r<0 THROW 53690,'No obtuvo lock de prueba',1;");
 await run("DECLARE @v binary(8)=(SELECT VERSION FROM dbo.EMPRESA_CFG WHERE IDEMPRESA=1 AND CLAVE='CRED_PERMITIR_PARCIALIDADES');EXEC dbo.sp_creditos_config_set 1,'EMPRESA',0,@v;");
 }finally{await t.rollback();await other.close();}},53402);
 await test('version administrativa desactualizada rechazada',async()=>{await run("EXEC dbo.sp_creditos_config_set @IDEMPRESA=1,@MODO='EMPRESA',@PERMITIR=0,@VERSION_ESPERADA=0x0000000000000000;");},53403);
 await test('override ajeno a empresa rechazado',async()=>{await config('SUCURSAL',1);await run("DECLARE @v binary(8)=(SELECT CFG_VERSION FROM dbo.DAT_SUC WHERE SUC='DF01');EXEC dbo.sp_creditos_config_sucursal_set @IDEMPRESA=2,@SUC='DF01',@PERMITIR=0,@VERSION_ESPERADA=@v;");},53405);
 const leftovers=(await run("SELECT (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL LIKE 'QADEVCR-%') cabeceras,(SELECT COUNT(*) FROM dbo.DAT_CTRL_CTAS WHERE NDOC LIKE 'QADEVCR-%') movimientos,(SELECT COUNT(*) FROM dbo.PV_CRED_ABONO_REL) relaciones;")).recordset[0];
 assert(leftovers.cabeceras===0&&leftovers.movimientos===0&&leftovers.relaciones===relationBaseline,'Fixtures persistieron');
 assert((await run("SELECT OBJECT_ID('dbo.QA_DEV_CR_FAIL') id;")).recordset[0].id===null,'Trigger QA persistio');
 console.log(JSON.stringify({passed:results.length,leftovers}));
}catch(e){console.error(String(e.message).replaceAll(env.DB_PASS||'__NONE__','[REDACTED]'));process.exitCode=1;}finally{if(pool)await pool.close();}})();
