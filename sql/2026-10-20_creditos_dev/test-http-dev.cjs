/* HTTP + SQL real, IOEDESARROLLO only. JWT fixture, no user credentials/UAT.
   Imports isolated controllers and strategy; never AppModule or scheduled workers.
   Each write is enclosed in a QueryRunner transaction and rolled back. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'node_modules/reflect-metadata'));
const { Test } = require(path.join(root, 'node_modules/@nestjs/testing'));
const { ValidationPipe } = require(path.join(root, 'node_modules/@nestjs/common'));
const { PassportModule } = require(path.join(root, 'node_modules/@nestjs/passport'));
const { ConfigService } = require(path.join(root, 'node_modules/@nestjs/config'));
const { DataSource } = require(path.join(root, 'node_modules/typeorm'));
const jwt = require(path.join(root, 'node_modules/jsonwebtoken'));
const env = require(path.join(root, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(root, '.env')));
const load = p => require(path.join(root, 'dist/modules', p));
const { CreditosConfigController } = load('empresas/creditos-config.controller');
const { CreditosConfigService } = load('empresas/creditos-config.service');
const { PagosServiciosController } = load('pagos-servicios/pagos-servicios.controller');
const { PagosServiciosService } = load('pagos-servicios/pagos-servicios.service');
const { JwtStrategy } = load('auth/jwt.strategy');
const { UsersService } = load('users/users.service');
const { AuditService } = load('audit/audit.service');
const { PvDevolucionesService } = load('pv-devoluciones/pv-devoluciones.service');
const results = [];
let db, runner, app;
const check = (ok, msg) => { if (!ok) throw Error(msg); };
const snapshotSql = `SELECT (SELECT COUNT(*) FROM dbo.EMPRESA_CFG_AUDIT) configAudit,
 (SELECT COUNT(*) FROM dbo.DAT_CTRL_CTAS) movimientos,
 (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_ASVR WHERE FCNPGOCRED IS NOT NULL) fechas,
 (SELECT COUNT(*) FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL LIKE 'QAHTTPCR-%') fixtures,
 (SELECT MODO,VALOR_BIT FROM dbo.EMPRESA_CFG WHERE IDEMPRESA=1 FOR JSON PATH) config,
 (SELECT SUC,IDEMPRESA,CRED_PAGO_PARCIAL FROM dbo.DAT_SUC ORDER BY SUC FOR JSON PATH,INCLUDE_NULL_VALUES) sucursales;`;
(async () => {
  try {
    db = new DataSource({ type: 'mssql', host: '172.16.100.40', port: 1434, database: 'IOEDESARROLLO',
      username: env.DB_USER, password: env.DB_PASS, synchronize: false, logging: false,
      options: { encrypt: false, trustServerCertificate: true, appName: 'QA_HTTP_DEV_CREDITOS' } });
    await db.initialize();
    await db.query("IF DB_NAME()<>'IOEDESARROLLO' OR @@SERVERNAME<>'dd7842d7ba7e' THROW 53301,'Destino no autorizado',1;");
    const before = (await db.query(snapshotSql))[0];
    const secret = crypto.randomBytes(48).toString('hex');
    const module = await Test.createTestingModule({ imports: [PassportModule],
      controllers: [CreditosConfigController, PagosServiciosController],
      providers: [CreditosConfigService, PagosServiciosService, JwtStrategy,
        { provide: DataSource, useValue: { query: (...args) => runner.query(...args) } },
        { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: secret }) },
        { provide: UsersService, useValue: { findAuthById: async () => ({ ESTATUS: 'ACTIVO' }) } },
        { provide: AuditService, useValue: { log: async () => {} } }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const token = roleId => jwt.sign({ sub: 900001, username: 'QA_HTTP_DEV', roleId, suc: 'DF01' }, secret, { expiresIn: '5m' });
    const call = async (route, role = 1, method = 'GET', body) => {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json',
        ...(role == null ? {} : { Authorization: 'Bearer ' + token(role) }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const test = async (name, fn) => {
      runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
      try { await fn(); results.push({ name, ok: true }); }
      finally { try { if (runner.isTransactionActive) await runner.rollbackTransaction(); }
        catch (e) { if (!/ENOTBEGUN|EABORT|no corresponding BEGIN|not been begun/i.test(String(e.code) + e.message)) throw e; }
        finally { await runner.release(); } }
    };
    const route = '/empresas/1/configuracion/creditos';
    await test('JWT requerido y operador sin acceso a configuración', async () => {
      check((await call(route, null)).status === 401, 'Falta 401');
      check((await call(route, 4)).status === 403, 'Falta 403 GET');
      check((await call(route, 4, 'PATCH', { modo: 'EMPRESA', permitir: false, version: '0000000000000000' })).status === 403, 'Falta 403 PATCH');
    });
    await test('GET obtiene 11 sucursales, false y versiones hex; DTO rechaza omisión/cadena', async () => {
      const got = await call(route); check(got.status === 200 && got.body.sucursales.length === 11, JSON.stringify(got));
      check(/^[0-9A-F]{16}$/.test(got.body.credito.version), 'Versión inválida');
      check((await call(route, 1, 'PATCH', { modo: 'EMPRESA', permitir: 'false', version: got.body.credito.version })).status === 400, 'Cadena aceptada');
      check((await call(route + '/sucursales/DF01', 1, 'PATCH', { version: got.body.sucursales[0].version })).status === 400, 'Omisión aceptada');
      check((await call(route, 1, 'PATCH', { modo: 'EMPRESA', permitir: false, version: got.body.credito.version, actor: 'forged' })).status === 400, 'Actor cliente aceptado');
    });
    await test('Guardar empresa/sucursal, heredar null y releer persistencia con auditoría', async () => {
      const initial = (await call(route)).body;
      check((await call(route, 1, 'PATCH', { modo: 'SUCURSAL', permitir: false, version: initial.credito.version })).status === 200, 'No guardó empresa');
      let got = (await call(route)).body;
      let branch = got.sucursales.find(s => s.suc === 'DF01');
      check(branch.efectivo === false, 'No heredó false');
      check((await call(route + '/sucursales/DF01', 1, 'PATCH', { permitir: true, version: branch.version })).status === 200, 'No guardó override');
      got = (await call(route)).body; branch = got.sucursales.find(s => s.suc === 'DF01');
      check(branch.efectivo === true && branch.permitir === true, 'Override no efectivo');
      check((await call(route + '/sucursales/DF01', 1, 'PATCH', { permitir: null, version: branch.version })).status === 200, 'No limpió override');
      branch = (await call(route)).body.sucursales.find(s => s.suc === 'DF01');
      check(branch.permitir === null && branch.efectivo === false, 'Herencia no persistente');
      const [audit] = await runner.query("SELECT TOP 1 ACTOR FROM dbo.EMPRESA_CFG_AUDIT ORDER BY ID DESC");
      check(audit.ACTOR === '900001:QA_HTTP_DEV', 'Actor no autenticado');
    });
    await test('Versión desactualizada devuelve 409', async () => {
      const config = (await call(route)).body.credito;
      const body = { modo: config.MODO, permitir: config.permitir, version: config.version };
      check((await call(route, 1, 'PATCH', body)).status === 200, 'Primer guardado falló');
      check((await call(route, 1, 'PATCH', body)).status === 409, 'No detectó versión vieja');
    });
    await test('Sucursal ajena devuelve 409 sin insertar configuración', async () => {
      const config = (await call(route)).body.credito;
      await call(route, 1, 'PATCH', { modo: 'SUCURSAL', permitir: true, version: config.version });
      check((await call(route + '/sucursales/NOEXISTE', 1, 'PATCH', { permitir: true, version: '0000000000000000' })).status === 409, 'Sucursal ajena aceptada');
    });
    await test('Contexto PS usa saldo neto y política del origen, conserva alcance de folio', async () => {
      const id = 'QAHTTPCR-' + crypto.randomUUID(), credit = id + '-C', ps = id + '-PS';
      await runner.query(`DECLARE @now datetime=CONVERT(datetime,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
        INSERT dbo.PV_CTR_FOL_ASVR(IDFOL,IDFOLINICIAL,CLIEN,SUC,ESTA,AUT,ORIGEN_AUT,FCN,FCNM)
        VALUES(@0,@0,350295,'DF02','MB51PROCES','CA','CA',@now,@now),(@1,@1,350295,'DF01','PENDIENTE','PS','CA',@now,@now);
        INSERT dbo.DAT_CTRL_CTAS(NDOC,CTA,CLIENT,FCND,CLSD,IDFOL,IMPT,SUC)
        VALUES(@2,'101001002',350295,@now,'602',@0,-100,'DF02'),(@3,'101001002',350295,@now,'601',@0,40,'DF02');
        INSERT dbo.PV_TICKET_LOG(ID,IDFOL,UPC,ART,DES,CTD,PVTA,PVTAT,ORD)
        VALUES(CONVERT(nvarchar(255),NEWID()),@1,'CR','CR-QA','QA',1,10,10,@0);`, [credit, ps, id + '-CARGO', id + '-ABONO']);
      const response = await call('/ps/folios/' + ps + '/creditos/contexto', 4);
      check(response.status === 200, JSON.stringify(response));
      check(response.body.items[0].saldo === '60.0000' && response.body.items[0].suc === 'DF02', 'Saldo/origen incorrecto');
      await runner.query("UPDATE dbo.PV_CTR_FOL_ASVR SET SUC='DF03' WHERE IDFOL=@0", [ps]);
      check((await call('/ps/folios/' + ps + '/creditos/contexto', 4)).status === 403, 'Acceso sucursal ajena');
    });
    // Exercise the production QueryRunner cleanup path after SQL XACT_ABORT.
    for (const amount of [40, 100]) {
      const id = 'QAHTTPCR-' + crypto.randomUUID(), credit = id + '-C', ps = id + '-PS';
      const originalFactory = db.createQueryRunner.bind(db);
      db.createQueryRunner = (...args) => {
        const real = originalFactory(...args), start = real.startTransaction.bind(real);
        real.startTransaction = async (...startArgs) => {
          await start(...startArgs);
          await real.query(`DECLARE @now datetime=CONVERT(datetime,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
            INSERT dbo.PV_CTR_FOL_ASVR(IDFOL,IDFOLINICIAL,CLIEN,SUC,ESTA,AUT,ORIGEN_AUT,FCN,FCNM)
            VALUES(@0,@0,350295,'DF01','MB51PROCES','CA','CA',@now,@now),(@1,@1,350295,'DF01','PENDIENTE','PS','CA',@now,@now);
            INSERT dbo.PV_CTR_FOL_FORM(IDF,IDFOL,FORM,IMPP,IMPC,IMPD,FCN)
            VALUES(CONVERT(nvarchar(255),NEWID()),@0,'CREDITO',100,0,100,@now);
            INSERT dbo.DAT_CTRL_CTAS(NDOC,CTA,CLIENT,FCND,CLSD,IDFOL,IMPT,SUC)
            VALUES(@2,'101001002',350295,@now,'602',@0,-100,'DF01');
            INSERT dbo.PV_TICKET_LOG(ID,IDFOL,UPC,ART,DES,CTD,PVTA,PVTAT,ORD)
            VALUES(CONVERT(nvarchar(255),NEWID()),@1,'CR','CR-QA','QA',1,@3,@3,@0);
            DECLARE @v binary(8)=(SELECT VERSION FROM dbo.EMPRESA_CFG WHERE IDEMPRESA=1 AND CLAVE='CRED_PERMITIR_PARCIALIDADES');
            EXEC dbo.sp_creditos_config_set 1,'EMPRESA',0,@v,'QA_HTTP_DEV';`, [credit, ps, id + '-CARGO', amount]);
        };
        return real;
      };
      let error;
      try {
        const service = new PagosServiciosService(db, { log: async () => {} }, new ConfigService());
        await service.validarCreditosAntesDeProcesar({ IDFOL: ps, CLIEN: 350295, SUC: 'DF01' });
      } catch (e) { error = e; }
      finally { db.createQueryRunner = originalFactory; }
      if (amount === 40) check(error?.driverError?.number === 53515, 'Precheck no conserva error parcial: ' + error?.message);
      else check(!error, 'Precheck pago total: ' + error?.message);
      results.push({ name: `QueryRunner real precheck ${amount === 40 ? 'rechaza parcial' : 'acepta total'}, rollback/liberación`, ok: true });
    }
    for (const scenario of [{ amount: 40, paid: true }, { amount: 100, paid: true }, { amount: 100, paid: false }]) {
      await test(`Contabilidad real de devoluciones ${scenario.amount}, crédito ${scenario.paid ? 'liquidado conserva fecha' : 'sin pago no inventa fecha'}`, async () => {
        const id='QAHTTPCR-'+crypto.randomUUID(),credit=id+'-C',ps=id+'-PS',dev=id+'-DEV';
        await runner.query(`DECLARE @now datetime=CONVERT(datetime,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
          INSERT dbo.PV_CTR_FOL_ASVR(IDFOL,IDFOLINICIAL,CLIEN,SUC,ESTA,AUT,ORIGEN_AUT,FCN,FCNM)
          VALUES(@0,@0,350295,'DF01','MB51PROCES','CA','CA',@now,@now),(@1,@1,350295,'DF01','PENDIENTE','PS','CA',@now,@now),
            (@2,@2,350295,'DF01','PENDIENTE','DCA','CA',@now,@now);
          INSERT dbo.PV_CTR_FOL_FORM(IDF,IDFOL,FORM,IMPP,IMPC,IMPD,FCN)
          VALUES(CONVERT(nvarchar(255),NEWID()),@0,'CREDITO',100,0,100,@now);
          INSERT dbo.DAT_CTRL_CTAS(NDOC,CTA,CLIENT,FCND,CLSD,IDFOL,IMPT,SUC)
          VALUES(@3,'101001002',350295,@now,'602',@0,-100,'DF01');
          INSERT dbo.PV_TICKET_LOG(ID,IDFOL,UPC,ART,DES,CTD,PVTA,PVTAT,ORD)
          VALUES(CONVERT(nvarchar(255),NEWID()),@1,'CR','CR-QA','QA',1,100,100,@0);`, [credit,ps,dev,id+'-CARGO']);
        if(scenario.paid)await runner.query("EXEC dbo.sp_ps_pago_finalize @IDFOL=@0,@FORMAS_JSON=N'[{\"form\":\"EFECTIVO\",\"impp\":100}]',@USER=N'QA_DEV';",[ps]);
        const read=async()=> (await runner.query(`SELECT CONVERT(varchar(30),FCNPGOCRED,126) fecha,
          (SELECT COUNT(*) FROM dbo.PV_CRED_FECHA_AUDIT WHERE IDFOL=@0) audit,
          (SELECT SUM(IMPT) FROM dbo.DAT_CTRL_CTAS WHERE IDFOL=@0 AND CTA='101001002') saldo
          FROM dbo.PV_CTR_FOL_ASVR WHERE IDFOL=@0`,[credit]))[0];
        const original=await read();
        const service=new PvDevolucionesService(db,{log:async()=>{}},new ConfigService());
        await service.registerCtasMovimientos(runner,{idfolDev:dev,idfolOrig:credit,clien:350295,suc:'DF01',opv:'QA_DEV',
          formas:[{form:'CREDITO',impp:scenario.amount,aut:null}],finalizedAt:new Date()});
        await service.updateDevolucionHeaderFinal(runner,{idfolDev:dev,autFinal:'DCA',total:scenario.amount,rqfac:false,opv:'QA_DEV',finalizedAt:new Date()});
        const returned=await read();
        check(returned.fecha===original.fecha&&returned.audit===original.audit,'Devolución alteró fecha/auditoría');
        check(Number(returned.saldo)===Number(original.saldo)+scenario.amount,'No ejercitó contabilidad de devolución');
        if(scenario.paid)check(!!returned.fecha,'Perdió liquidación');else check(returned.fecha===null,'Devolución generó fecha sin pago');
      });
    }
    const after = (await db.query(snapshotSql))[0];
    check(JSON.stringify(before) === JSON.stringify(after), 'Postflight difiere: revisar antes/después');
    const evidence = { database: 'IOEDESARROLLO', authentication: 'JWT fixture + real JwtAuthGuard/JwtStrategy; UsersService fixture, no UAT', results, before, after, rollbackVerified: true };
    fs.writeFileSync(path.resolve(root, '../outputs/integracion_creditos_dev_20261020/tests_http.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ tests: results.length, passed: true, rollbackVerified: true }));
  } catch (e) { console.error(String(e.message).replaceAll(env.DB_PASS || '__NONE__', '[REDACTED]')); process.exitCode = 1; }
  finally { if (app) await app.close(); if (db?.isInitialized) await db.destroy(); }
})();
