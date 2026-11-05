// Isolated development launch. Does not rewrite .env or target IOELOCAL.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const dotenv = require('dotenv');
const sql = require('mssql');
const root = path.resolve(__dirname, '..');
const privateEnv = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
const env = {...process.env, ...privateEnv, DB_HOST:'172.16.100.40', DB_PORT:'1434', DB_NAME:'IOEDESARROLLO', PORT:'3000', ADMS_PORT:'3000', CFDI_EMAIL_WORKER_ENABLED:'false', TZ:'America/Mexico_City'};
(async()=>{
  const pool = new sql.ConnectionPool({server:env.DB_HOST,port:Number(env.DB_PORT),database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASS,connectionTimeout:7000,options:{encrypt:false,trustServerCertificate:true}});
  try {
    await pool.connect();
    const target=(await pool.request().query('SELECT DB_NAME() db')).recordset[0]?.db;
    if(target!=='IOEDESARROLLO')throw new Error('Development target mismatch');
  } finally {await pool.close().catch(()=>{});}
  console.log(JSON.stringify({target:'172.16.100.40:1434/IOEDESARROLLO',port:3000,emailWorker:false,apiUrlConfigured:!!env.RECOMPENSAS_API_URL,apiAccountConfigured:!!(env.RECOMPENSAS_API_USERNAME||env.USER_API_FEDERADA)&&!!(env.RECOMPENSAS_API_PASSWORD||env.PASSWORD_API_FEDERADA)}));
  if(process.argv.includes('--check'))return;
  const child=spawn(process.execPath,['dist/main.js'],{cwd:root,env,stdio:'inherit',windowsHide:true});
  child.on('exit',code=>process.exit(code??1));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
})().catch(e=>{console.error(JSON.stringify({startupFailed:true,code:e.code||e.name}));process.exit(1);});
