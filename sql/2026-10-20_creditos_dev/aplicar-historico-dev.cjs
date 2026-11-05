/* Lote desarrollo autorizado. Prueba primero un credito, revierte, luego lote.
   --apply es obligatorio para DML; sin flag solamente emite diagnostico renovado. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),sql=require(path.join(root,'node_modules/mssql'));
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const dir=path.resolve(root,'../outputs/integracion_creditos_dev_20261020');
const config={server:'172.16.100.40',port:1434,database:'IOEDESARROLLO',user:env.DB_USER,password:env.DB_PASS,
  connectionTimeout:15000,requestTimeout:120000,options:{encrypt:false,trustServerCertificate:true,appName:'DEV_CREDITOS_HISTORICO'}};
const quote=x=>"N'"+String(x).replaceAll("'","''")+"'";
async function execute(source){const p=await new sql.ConnectionPool(config).connect();try{
 await p.request().query("IF DB_NAME()<>'IOEDESARROLLO' OR @@SERVERNAME<>'dd7842d7ba7e' THROW 53301,'Destino no autorizado',1;");
 return (await p.request().query(source)).recordsets;
}finally{await p.close();}}
const hist=fs.readFileSync(path.join(__dirname,'06_historico_dev.sql'),'utf8');
const rev=fs.readFileSync(path.join(__dirname,'07_revertir_historico_dev.sql'),'utf8');
function historical(folios,apply=false,approval=null){let s=hist.replace("DECLARE @PoliticaFecha varchar(20) = 'PENDIENTE';","DECLARE @PoliticaFecha varchar(20) = 'REGISTRO';");
 if(folios)s=s.replace('DECLARE @FoliosJson nvarchar(max) = NULL;','DECLARE @FoliosJson nvarchar(max) = '+quote(JSON.stringify(folios))+';');
 if(apply){s=s.replace('DECLARE @Aplicar bit = 0;','DECLARE @Aplicar bit = 1;')
 .replace('DECLARE @ServidorEsperado nvarchar(128) = NULL;',"DECLARE @ServidorEsperado nvarchar(128) = N'dd7842d7ba7e';")
 .replace('DECLARE @HashAprobado varchar(64) = NULL;','DECLARE @HashAprobado varchar(64) = '+quote(approval.HASH)+';')
 .replace('DECLARE @ConteoAprobado int = NULL;','DECLARE @ConteoAprobado int = '+Number(approval.CANDIDATOS)+';');}
 return s;}
function reversal(batch,apply=false,approval=null){let s=rev.replace('@BatchOrigen uniqueidentifier=NULL','@BatchOrigen uniqueidentifier='+quote(batch));
 if(apply)s=s.replace('@Aplicar bit=0','@Aplicar bit=1').replace('@HashEsperado varchar(64)=NULL','@HashEsperado varchar(64)='+quote(approval.HASH))
 .replace('@ConteoEsperado int=NULL','@ConteoEsperado int='+Number(approval.CONTEO));return s;}
function save(name,data){fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2));}
(async()=>{try{
 const evidence={utc:new Date().toISOString(),policy:'REGISTRO',legacyOriginExcluded:true,phases:[]};
 const r=await execute(historical(null));save('historico_validacion_dev.json',r);console.log(JSON.stringify({preflight:r[0],classes:r[1]}));
 if(!process.argv.includes('--apply'))return;
 if(!JSON.parse(fs.readFileSync(path.join(dir,'backup.json'))).verified)throw Error('Falta backup verificado');
 const fingerprint="SELECT COUNT_BIG(*) movimientos,CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.DAT_CTRL_CTAS ORDER BY NDOC FOR JSON PATH,INCLUDE_NULL_VALUES)),2) hash FROM dbo.DAT_CTRL_CTAS;";
 const before=await execute(fingerprint);evidence.ledgerBefore=before;
 const eligible=r[3].filter(x=>x.CLASIFICACION==='APTO_ESTRUCTURAL');
 if(!eligible.length)throw Error('Sin candidatos nuevos; no reaplicar lote anterior.');
 const pilot=eligible.find(x=>x.EVENTOS_PARCIALES>0)||eligible[0];
 const pilotPlan=await execute(historical([pilot.IDFOL]));save('piloto_preflight.json',pilotPlan);
 const pilotApply=await execute(historical([pilot.IDFOL],true,pilotPlan[0][0]));save('piloto_aplicacion.json',pilotApply);
 const batch=pilotApply.at(-1)[0].BATCH_APLICADO;
 const rp=await execute(reversal(batch));save('piloto_reversa_preflight.json',rp);
 const rr=await execute(reversal(batch,true,rp[0][0]));save('piloto_reversa_aplicada.json',rr);
 evidence.phases.push({pilot:pilot.IDFOL,batch,reverted:true});
 const all=eligible.map(x=>x.IDFOL);
 const plan=await execute(historical(all));save('lote_preflight.json',plan);
 if(plan[0][0].CANDIDATOS!==all.length)throw Error('Lote cambio durante prueba piloto');
 const applied=await execute(historical(all,true,plan[0][0]));save('lote_aplicado.json',applied);
 evidence.batch=applied.at(-1)[0];
 const after=await execute(fingerprint);evidence.ledgerAfter=after;
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Huella de movimientos contables cambio; revisar inmediatamente.');
 const post=await execute(`SELECT COUNT(*) fechas FROM dbo.PV_CTR_FOL_ASVR WHERE FCNPGOCRED IS NOT NULL;
 SELECT POLITICA_FECHA,COUNT(*) filas FROM dbo.PV_CRED_FECHA_AUDIT GROUP BY POLITICA_FECHA;
 SELECT COUNT(*) discrepancias FROM dbo.PV_CRED_FECHA_AUDIT a JOIN dbo.PV_CTR_FOL_ASVR p ON p.IDFOL=a.IDFOL
 WHERE a.BATCH_ID=${quote(evidence.batch.BATCH_APLICADO)} AND (p.FCNPGOCRED IS NULL OR p.FCNPGOCRED<>a.FECHA_DESPUES);`);
 evidence.postflight=post;save('historico_resultado.json',evidence);
 console.log(JSON.stringify(evidence));
}catch(e){console.error(JSON.stringify({code:e.code,number:e.number,message:String(e.message).replaceAll(env.DB_PASS||'__NONE__','[REDACTED]')}));process.exitCode=1;}})();
