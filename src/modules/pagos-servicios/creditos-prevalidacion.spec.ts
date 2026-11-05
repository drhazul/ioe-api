import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PagosServiciosService } from './pagos-servicios.service';

describe('PS validación anticipada de créditos', () => {
  const user = {
    sub: 4,
    username: 'OPV',
    roleId: 4,
    suc: 'DF01',
  } as JwtPayload;
  const folio = { IDFOL: 'QA-PS', SUC: 'DF01', CLIEN: 350295 };
  let service: PagosServiciosService;
  let runner: any;
  let db: any;
  beforeEach(() => {
    runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
    };
    db = {
      query: jest.fn().mockResolvedValue([]),
      createQueryRunner: () => runner,
    };
    service = new PagosServiciosService(
      db as DataSource,
      { log: jest.fn() } as unknown as AuditService,
      new ConfigService({ DB_NAME: 'IOEDESARROLLO', NODE_ENV: 'test' }),
    );
    jest.spyOn(service as any, 'loadFolio').mockResolvedValue(folio);
  });

  it('rechazo parcial impide procesar y siempre revierte/libera conexión', async () => {
    runner.query.mockRejectedValue(new Error('Parcialidades desactivadas'));
    await expect(service.procesar('QA-PS', user, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('validación exitosa revierte precheck antes de procesar', async () => {
    await service.procesar('QA-PS', user, null);
    expect(runner.query.mock.calls[0][1]).toEqual(['QA-PS', 350295, 'DF01']);
    expect(runner.rollbackTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      db.query.mock.invocationCallOrder[0],
    );
    expect(db.query.mock.calls[0][0]).toContain('sp_ps_procesar');
  });

  it('XACT_ABORT no oculta rechazo original con error de rollback', async () => {
    runner.query.mockRejectedValue(new Error('Parcialidades desactivadas'));
    runner.rollbackTransaction.mockRejectedValue(
      Object.assign(new Error('Transaction has been aborted.'), {
        code: 'EABORT',
      }),
    );
    await expect(service.procesar('QA-PS', user, null)).rejects.toThrow(
      'Parcialidades desactivadas',
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('contexto conserva restricción de acceso del folio', async () => {
    (service as any).loadFolio.mockRejectedValue(new ForbiddenException());
    await expect(
      service.getCreditosContexto('OTRA-SUC', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });
});
