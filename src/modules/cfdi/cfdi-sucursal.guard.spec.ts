import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CfdiSucursalGuard } from './cfdi-sucursal.guard';

function ctx(suc = 'DF01', roleId = 5) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { username: 'USUARIO', roleId, suc },
        params: { idFol: 'F-001' },
      }),
    }),
  } as unknown as ExecutionContext;
}
it('usuario legacy sólo opera sucursal propia', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ SUC: 'DF05' }])
    .mockResolvedValueOnce([]);
  await expect(
    new CfdiSucursalGuard(
      { query } as unknown as DataSource,
      new ConfigService(),
    ).canActivate(ctx()),
  ).rejects.toThrow(/no autorizada/);
});
it('asignación explícita permite sucursal adicional', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ SUC: 'DF05' }])
    .mockResolvedValueOnce([{ SUC: 'DF05' }]);
  await expect(
    new CfdiSucursalGuard(
      { query } as unknown as DataSource,
      new ConfigService(),
    ).canActivate(ctx()),
  ).resolves.toBe(true);
});
it('admin conserva acceso total', async () => {
  const query = jest.fn();
  await expect(
    new CfdiSucursalGuard(
      { query } as unknown as DataSource,
      new ConfigService(),
    ).canActivate(ctx('DF01', 1)),
  ).resolves.toBe(true);
  expect(query).not.toHaveBeenCalled();
});
