import { DataSource } from 'typeorm';
import { conBloqueoCfdi } from './cfdi-lock';

it('solicitud concurrente no entra al PAC y libera conexión de bloqueo fallido', async () => {
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    query: jest.fn().mockResolvedValue([{ resultado: -1 }]),
    isTransactionActive: true,
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    commitTransaction: jest.fn(),
  };
  const accion = jest.fn();
  await expect(
    conBloqueoCfdi(
      { createQueryRunner: () => runner } as unknown as DataSource,
      'F-001',
      accion,
    ),
  ).rejects.toThrow(/procesamiento/);
  expect(accion).not.toHaveBeenCalled();
  expect(runner.rollbackTransaction).toHaveBeenCalled();
  expect(runner.release).toHaveBeenCalled();
});

it('fallo de persistencia libera exclusión sin ocultar resultado incierto', async () => {
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    query: jest.fn().mockResolvedValue([{ resultado: 0 }]),
    isTransactionActive: true,
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    commitTransaction: jest.fn(),
  };
  const error = new Error('PERSISTENCIA PENDIENTE');
  await expect(
    conBloqueoCfdi(
      { createQueryRunner: () => runner } as unknown as DataSource,
      'F-001',
      () => Promise.reject(error),
    ),
  ).rejects.toBe(error);
  expect(runner.commitTransaction).not.toHaveBeenCalled();
  expect(runner.release).toHaveBeenCalled();
});
