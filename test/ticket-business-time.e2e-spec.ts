import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { BusinessTimeInterceptor } from '../src/common/time/business-time.interceptor';
import { businessDateTime } from '../src/common/time/fecha-negocio';
import { AuditService } from '../src/modules/audit/audit.service';
import { PagosServiciosController } from '../src/modules/pagos-servicios/pagos-servicios.controller';
import { PagosServiciosService } from '../src/modules/pagos-servicios/pagos-servicios.service';
import { PvDevolucionesController } from '../src/modules/pv-devoluciones/pv-devoluciones.controller';
import { PvDevolucionesService } from '../src/modules/pv-devoluciones/pv-devoluciones.service';
import { PvCotizacionesCierreController } from '../src/modules/pvctrfolasvr/pv-cotizaciones-cierre.controller';
import { PvCotizacionesCierreService } from '../src/modules/pvctrfolasvr/pv-cotizaciones-cierre.service';

// Sin AppModule, conexión SQL, cron ni escrituras: controladores y serializadores
// reales, con datos de frontera SQL deterministas para reproducir la regresión.
describe('tickets HTTP con interceptor comercial global', () => {
  let app: INestApplication;
  let fecha: unknown;
  const idfol = 'DF01-20261104-VF-0001';
  const context = {
    idfol, idfolDev: idfol, idfolOrig: 'DF01-20261103-VF-0001', suc: 'DF01',
    clien: 50007, esta: 'PENDIENTE', tipotran: 'VF', rqfacDefault: false,
    ivaIntegrado: 0, itemsCount: 1, totalBase: 65,
  };
  const formaColumns = new Set(['IDF', 'FORM', 'IMPP', 'IMPD', 'AUT', 'FCN']);

  beforeAll(async () => {
    const ds = { query: jest.fn(async (sql: string) => {
      if (sql.includes('sp_ps_form_summary')) return [{
        IDFOL: idfol, SUC: 'DF01', ESTA: 'PAGADO', TOTAL: 65, PAGADO: 65,
        RESTANTE: 0, CAMBIO: 0, IVA_INTEGRADO: 0,
        FORMAS_JSON: JSON.stringify([{ FORM: 'TARJETA', IMPP: 65, AUT: 'REF', FCN: businessDateTime(fecha) }]),
      }];
      if (sql.includes('PV_CTR_FOL_FORM')) return [
        { IDF: 'F1', FORM: 'EFECTIVO', IMPP: 25, IMPD: 25, FCN: fecha },
        { IDF: 'F2', FORM: 'TARJETA', IMPP: 40, IMPD: 40, AUT: 'REF', FCN: fecha },
      ];
      if (sql.includes('PV_CTR_ORDS')) return [{ IORD: 'ORD-1', FCNS: fecha, FCNM: fecha }];
      if (sql.includes('PV_TICKET_LOG')) return [{ ID: 'L1', CTD: 1, PVTA: 65, PVTAT: 65 }];
      if (sql.includes('PV_CTR_FOL_ASVR')) return [{ IDFOL: idfol, SUC: 'DF01', AUT: 'VF', REQF: 0, FCNM: fecha }];
      throw new Error(`Consulta sin fixture: ${sql.slice(0, 80)}`);
    }) } as unknown as DataSource;
    const cot = new PvCotizacionesCierreService(ds);
    const dev = new PvDevolucionesService(ds, {} as AuditService, { get: () => undefined } as unknown as ConfigService);
    const ps = new PagosServiciosService(ds, {} as AuditService, {} as ConfigService);
    for (const svc of [cot, dev] as any[]) {
      jest.spyOn(svc, 'loadPrintHeader').mockResolvedValue({ suc: 'DF01' });
      jest.spyOn(svc, 'loadOpvNombre').mockResolvedValue('OPERADOR');
      jest.spyOn(svc, 'loadClienteNombre').mockResolvedValue('CLIENTE');
      jest.spyOn(svc, 'resolveFolioFormTable').mockResolvedValue('dbo.PV_CTR_FOL_FORM_SVR');
      jest.spyOn(svc, 'loadTableColumns').mockResolvedValue(formaColumns);
    }
    jest.spyOn(cot as any, 'resolveContext').mockResolvedValue(context);
    jest.spyOn(cot as any, 'loadPrintTicketItems').mockResolvedValue({ items: [{ ctd: 1, pvta: 65, importe: 65 }], itemsGratis: [] });
    jest.spyOn(cot as any, 'tableExists').mockImplementation(async (_executor, tableName) => tableName === 'dbo.PV_CTR_ORDS');
    jest.spyOn(dev as any, 'loadDevolucionContext').mockResolvedValue(context);
    jest.spyOn(dev as any, 'loadIvaIntegrado').mockResolvedValue(0);
    jest.spyOn(ps as any, 'loadFolio').mockResolvedValue({ IDFOL: idfol, SUC: 'DF01' });
    const module = await Test.createTestingModule({
      controllers: [PvCotizacionesCierreController, PvDevolucionesController, PagosServiciosController],
      providers: [
        { provide: PvCotizacionesCierreService, useValue: cot },
        { provide: PvDevolucionesService, useValue: dev },
        { provide: PagosServiciosService, useValue: ps },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = { sub: 1, roleId: 1, suc: 'DF01' };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new BusinessTimeInterceptor());
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  describe.each([
    ['SQL Date después de medianoche UTC', () => new Date(2026, 10, 4, 18, 23, 2, 763), '2026-11-04T18:23:02.763'],
    ['SQL texto antes de medianoche CDMX', () => '2026-11-04 23:59:59.997', '2026-11-04T23:59:59.997'],
    ['SQL Date en medianoche CDMX', () => new Date(2026, 10, 5, 0, 0, 0), '2026-11-05T00:00:00.000'],
    ['fin de año', () => new Date(2026, 11, 31, 23, 59, 59, 997), '2026-12-31T23:59:59.997'],
    ['fecha de calendario', () => '2026-11-04', '2026-11-04T00:00:00.000'],
    ['nulo permitido', () => null, null],
  ])('%s', (_label, getValue, expected) => {
    beforeEach(() => { fecha = (getValue as () => unknown)(); });

    it('cotización imprime formas, ORD y footer sin convertir calendario', async () => {
      const { body } = await request(app.getHttpServer()).get(`/api/pv/cotizaciones/${idfol}/cierre/print-preview`).expect(200);
      expect(body.footer.fcnm).toBe(expected);
      expect(body.formas.map((f: any) => f.fcn)).toEqual([expected, expected]);
      expect(body.ords[0]).toMatchObject({ fcns: expected, fcnm: expected });
      expect(body.totals).toMatchObject({ totalBase: 65, total: 65, subtotal: 56.03, iva: 8.97, sumPagos: 65, cambio: 0 });
    });
    it('devolución imprime sus formas y conserva importes', async () => {
      const { body } = await request(app.getHttpServer()).get(`/api/pv/devoluciones/${idfol}/print-preview`).expect(200);
      expect(body.formas.map((f: any) => f.fcn)).toEqual([expected, expected]);
      expect(body.totals).toMatchObject({ total: 65, sumPagos: 65, cambio: 0 });
    });
    it('PS conserva fecha de JSON SQL en resumen usado por ticket y voucher', async () => {
      const { body } = await request(app.getHttpServer()).get(`/api/ps/folios/${idfol}/formas-pago/summary`).expect(200);
      expect(body.formas[0].FCN).toBe(expected);
      expect(body).toMatchObject({ total: 65, pagado: 65, cambio: 0 });
    });
  });

  it('contexto y preview conservan total de cotización', async () => {
    await request(app.getHttpServer()).get(`/api/pv/cotizaciones/${idfol}/cierre/context`).expect(200).expect(({ body }) => expect(body.totalBase).toBe(65));
    const { body } = await request(app.getHttpServer()).post(`/api/pv/cotizaciones/${idfol}/cierre/preview`).send({ tipotran: 'VF', rqfac: false }).expect(201);
    expect(body.totals).toMatchObject({ totalBase: 65, total: 65, subtotal: 56.03, iva: 8.97 });
  });
  it('master no registra endpoint C01', async () => {
    await request(app.getHttpServer()).get(`/api/pv/cotizaciones/${idfol}/lealtad/participacion`).expect(404);
  });
});
