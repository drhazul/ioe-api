/* Delta autorizado: SOLO dos helpers de IOEDESARROLLO; sin DML persistente.
   Default preflight. --apply respalda definiciones y verifica hashes/datos. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const sql=require(path.join(root,'node_modules/mssql'));
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const names=['sp_ps_creditos_preparar','sp_ps_creditos_confirmar'];
const source=fs.readFileSync(path.join(__dirname,'03_creditos_cierre.sql'),'utf8');
const batches=source.split(/^GO\s*$/mi).filter(s=>s.trim());
if(batches.length!==2||names.some((n,i)=>!batches[i].includes('CREATE OR ALTER PROCEDURE dbo.'+n)))throw Error('Delta fuera de whitelist');
const hash=s=>crypto.createHash('sha256').update(s,'utf16le').digest('hex').toUpperCase();
const folder=path.resolve(root,'../outputs/integracion_creditos_dev_20261020/fecha_fija');
fs.mkdirSync(folder,{recursive:true});
const snapshot=`SELECT DB_NAME() base,@@SERVERNAME servidor,
 (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_ASVR) cabeceras,
 (SELECT COUNT(*) FROM dbo.DAT_CTRL_CTAS) movimientos,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.DAT_CTRL_CTAS ORDER BY NDOC FOR JSON PATH,INCLUDE_NULL_VALUES)),2) hashMovimientos,
 (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_ASVR WHERE FCNPGOCRED IS NOT NULL) fechas,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT IDFOL,FCNPGOCRED FROM dbo.PV_CTR_FOL_ASVR WHERE FCNPGOCRED IS NOT NULL ORDER BY IDFOL FOR JSON PATH)),2) hashFechas,
 (SELECT COUNT(*) FROM dbo.PV_CRED_FECHA_AUDIT) auditFechas,
 (SELECT COUNT(*) FROM dbo.PV_CRED_ABONO_REL) relaciones,
 (SELECT COUNT(*) FROM dbo.EMPRESA_CFG_AUDIT) auditConfig;`;
(async()=>{let pool,tx;try{
 pool=await new sql.ConnectionPool({server:'172.16.100.40',port:1434,database:'IOEDESARROLLO',user:env.DB_USER,password:env.DB_PASS,
  requestTimeout:60000,options:{encrypt:false,trustServerCertificate:true,appName:'DEV_CREDITOS_FECHA_FIJA'}}).connect();
 await pool.request().query("IF DB_NAME()<>'IOEDESARROLLO' OR @@SERVERNAME<>'dd7842d7ba7e' THROW 53301,'Destino no autorizado',1;");
 const before=(await pool.request().query(snapshot)).recordset[0];
 const definitions=(await pool.request().query("SELECT OBJECT_NAME(object_id) nombre,definition FROM sys.sql_modules WHERE object_id IN(OBJECT_ID('dbo.sp_ps_creditos_preparar'),OBJECT_ID('dbo.sp_ps_creditos_confirmar')); ")).recordset;
 if(definitions.length!==2||definitions.some(d=>!d.definition))throw Error('Helpers ausentes/encriptados');
 const preflight={utc:new Date().toISOString(),before,helpers:definitions.map(d=>({nombre:d.nombre,hash:hash(d.definition)})),apply:process.argv.includes('--apply')};
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 fs.writeFileSync(path.join(folder,stamp+'-preflight.json'),JSON.stringify(preflight,null,2));
 console.log(JSON.stringify(preflight));
 if(!preflight.apply)return;
 for(const d of definitions)fs.writeFileSync(path.join(folder,stamp+'-'+d.nombre+'.before.sql'),d.definition);
 tx=new sql.Transaction(pool);await tx.begin();
 for(const n of names){const def=definitions.find(d=>d.nombre===n);
  await new sql.Request(tx).input('nombre',sql.NVarChar(255),'dbo.'+n).input('esperado',sql.VarBinary(32),Buffer.from(hash(def.definition),'hex'))
   .query("IF HASHBYTES('SHA2_256',OBJECT_DEFINITION(OBJECT_ID(@nombre)))<>@esperado THROW 53701,'Helper cambio despues de preflight',1;");}
 for(const batch of batches)await new sql.Request(tx).query(batch);
 const after=(await new sql.Request(tx).query(snapshot)).recordset[0];
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Datos cambiaron durante delta; revertir definiciones');
 const deployed=(await new sql.Request(tx).query("SELECT OBJECT_NAME(object_id) nombre,definition FROM sys.sql_modules WHERE object_id IN(OBJECT_ID('dbo.sp_ps_creditos_preparar'),OBJECT_ID('dbo.sp_ps_creditos_confirmar')); ")).recordset;
 if(deployed.find(d=>d.nombre===names[0]).definition.includes('THROW 53513')||
  !deployed.find(d=>d.nombre===names[1]).definition.includes('WHERE s.SALDO=0 AND p.FCNPGOCRED IS NULL;'))throw Error('Contrato fecha fija no instalado');
 await tx.commit();tx=null;
 fs.writeFileSync(path.join(folder,'aplicacion.json'),JSON.stringify({utc:new Date().toISOString(),before,after,backupPrefix:stamp,
  helpers:deployed.map(d=>({nombre:d.nombre,hash:hash(d.definition)})),datosSinCambios:true},null,2));
 console.log(JSON.stringify({applied:true,datosSinCambios:true,fechas:after.fechas,movimientos:after.movimientos}));
}catch(e){if(tx){try{await tx.rollback();}catch{}}console.error(String(e.message).replaceAll(env.DB_PASS||'__NONE__','[REDACTED]'));process.exitCode=1;}
 finally{if(pool)await pool.close();}})();
