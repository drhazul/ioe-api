/* Ejecutor exclusivo del desarrollo autorizado. Default: preflight sin DDL/DML.
 * --apply requiere backup verificado de esta integracion y destino exacto.
 */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),sql=require(path.join(root,'node_modules/mssql'));
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const evidenceDir=path.resolve(root,'../outputs/integracion_creditos_dev_20261020');
const expectedTables=['DAT_CFG_DEF','EMPRESA_CFG','EMPRESA_CFG_AUDIT','PV_CRED_FECHA_AUDIT','PV_CRED_ABONO_REL'];
(async()=>{let pool;try{
 if(env.DB_HOST!=='172.16.100.40'||Number(env.DB_PORT)!==1434)throw Error('Host/puerto cambiaron; revisar antes de operar');
 pool=await new sql.ConnectionPool({server:'172.16.100.40',port:1434,database:'IOEDESARROLLO',user:env.DB_USER,password:env.DB_PASS,
  requestTimeout:60000,options:{encrypt:false,trustServerCertificate:true,appName:'DEV_CREDITOS_INSTALL'}}).connect();
 const pre=(await pool.request().query(`IF DB_NAME()<>'IOEDESARROLLO' OR @@SERVERNAME<>'dd7842d7ba7e' THROW 53301,'Destino no autorizado',1;
 SELECT COL_LENGTH('dbo.PV_CTR_FOL_ASVR','FCNPGOCRED') fecha,COL_LENGTH('dbo.DAT_SUC','IDEMPRESA') empresa,
 COL_LENGTH('dbo.DAT_SUC','CRED_PAGO_PARCIAL') parcial,COL_LENGTH('dbo.DAT_SUC','CFG_VERSION') version;
 SELECT name FROM sys.tables WHERE name IN('DAT_CFG_DEF','EMPRESA_CFG','EMPRESA_CFG_AUDIT','PV_CRED_FECHA_AUDIT','PV_CRED_ABONO_REL');
 SELECT OBJECT_NAME(c.object_id) tabla,c.name columna,t.name tipo,c.scale,c.is_nullable FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id
 WHERE (c.object_id=OBJECT_ID('dbo.PV_CTR_FOL_ASVR') AND c.name='FCNPGOCRED')
 OR(c.object_id=OBJECT_ID('dbo.DAT_SUC') AND c.name IN('IDEMPRESA','CRED_PAGO_PARCIAL','CFG_VERSION'));`)).recordsets;
 const fields=Object.values(pre[0][0]),present=fields.filter(x=>x!==null).length;
 const fresh=present===0&&pre[1].length===0,complete=present===4&&pre[1].length===expectedTables.length;
 if(!fresh&&!complete)throw Error('Esquema parcial; generar delta revisado, sin DROP ni recreacion');
 if(complete){const types=new Map(pre[2].map(x=>[x.columna,x]));
 if(types.get('FCNPGOCRED').tipo!=='datetime2'||types.get('FCNPGOCRED').scale!==3||!types.get('FCNPGOCRED').is_nullable
  ||types.get('IDEMPRESA').tipo!=='int'||types.get('CRED_PAGO_PARCIAL').tipo!=='bit'||types.get('CFG_VERSION').tipo!=='timestamp')
  throw Error('Tipos existentes no coinciden con perfil de desarrollo');}
 console.log(JSON.stringify({server:'172.16.100.40,1434',database:'IOEDESARROLLO',schema:fresh?'CREAR':'CONSERVAR',apply:process.argv.includes('--apply')}));
 if(!process.argv.includes('--apply'))return;
 const backup=JSON.parse(fs.readFileSync(path.join(evidenceDir,'backup.json')));
 if(!backup.verified||!backup.file.startsWith('/var/opt/mssql/data/IOEDESARROLLO_pre_creditos_'))throw Error('Backup de desarrollo no verificado');
 const b=(await pool.request().input('file',sql.NVarChar(4000),backup.file).query(`SELECT * FROM sys.dm_os_file_exists(@file);
 SELECT TOP(1)b.database_name,b.has_backup_checksums,b.is_copy_only FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily f ON f.media_set_id=b.media_set_id
 WHERE f.physical_device_name=@file ORDER BY b.backup_finish_date DESC;`)).recordsets;
 if(!b[0][0].file_exists||b[1][0]?.database_name!=='IOEDESARROLLO'||!b[1][0].has_backup_checksums)throw Error('Backup inexistente/no coincide en servidor');
 if(fresh){const s=fs.readFileSync(path.join(__dirname,'01_esquema.sql'),'utf8').replace('DECLARE @Aplicar bit=0,@ServidorEsperado nvarchar(128)=NULL,',
 "DECLARE @Aplicar bit=1,@ServidorEsperado nvarchar(128)=N'dd7842d7ba7e',");await pool.request().query(s);}
 const tx=new sql.Transaction(pool);await tx.begin();try{
 for(const f of ['02_configuracion.sql','03_creditos_cierre.sql','04_sp_ps_pago_finalize.sql','05_datos_iniciales.sql'])
  for(const s of fs.readFileSync(path.join(__dirname,f),'utf8').split(/^GO\s*$/mi).filter(x=>x.trim()))await new sql.Request(tx).query(s);
 await tx.commit();}catch(e){try{await tx.rollback();}catch{}throw e;}
 console.log('Integracion SQL instalada; historico requiere preflight separado con aplicar-historico-dev.cjs.');
}catch(e){console.error(String(e.message).replaceAll(env.DB_PASS||'__NONE__','[REDACTED]'));process.exitCode=1;}finally{if(pool)await pool.close();}})();
