import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PvDevolucionesService } from './pv-devoluciones.service';

describe('PvDevolucionesService', () => {
  const buildService = () =>
    new PvDevolucionesService(
      {} as DataSource,
      {} as AuditService,
      { get: jest.fn() } as unknown as ConfigService,
    );

  it('normaliza TARJETA CREDITO como forma valida de devolucion', () => {
    const service = buildService() as unknown as {
      normalizeFormas: (
        items: Array<{ form: string; impp: number; aut?: string }>,
      ) => unknown[];
    };

    expect(
      service.normalizeFormas([
        { form: 'Tarjeta Credito', impp: 359, aut: '702378' },
      ]),
    ).toEqual([{ form: 'TARJETA CREDITO', impp: 359, aut: '702378' }]);
  });

  it('no cae a EFECTIVO cuando no puede resolver formas del ticket origen', async () => {
    const service = buildService() as unknown as {
      loadFormaOrigenBuckets: jest.Mock;
      suggestFormasPago: (
        executor: { query: jest.Mock },
        idfolOrig: string,
        idfolDev: string,
        total: number,
      ) => Promise<unknown[]>;
    };
    service.loadFormaOrigenBuckets = jest.fn().mockResolvedValue([]);

    await expect(
      service.suggestFormasPago(
        { query: jest.fn() },
        'DF06-20260706-VF-0020',
        'DF06-20260706-DVF-0027',
        359,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
