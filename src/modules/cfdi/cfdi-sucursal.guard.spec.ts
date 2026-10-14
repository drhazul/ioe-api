import { ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CfdiSucursalGuard } from './cfdi-sucursal.guard';
function ctx(request: Record<string, unknown> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { username: 'USUARIO', roleId: 5, suc: 'DF01' },
        params: { idFol: 'DF06-20261001-VF-0007' },
        ...request,
      }),
    }),
  } as unknown as ExecutionContext;
}
it('permite documento de otra sucursal por RFC sin consultar asignaciones', async () => {
  const query = jest.fn().mockResolvedValue([{ RFC_EMISOR: 'JIFJ4704238T5' }]);
  await expect(
    new CfdiSucursalGuard({ query } as unknown as DataSource).canActivate(
      ctx(),
    ),
  ).resolves.toBe(true);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('WHERE IDFOL=@0'),
    ['DF06-20261001-VF-0007'],
  );
  expect(query.mock.calls[0][0]).not.toContain('USR_MOD_SUC');
});
it('resuelve documento por UUID con RFC emisor', async () => {
  const query = jest.fn().mockResolvedValue([{ RFC_EMISOR: 'JIFJ4704238T5' }]);
  const uuid = 'AAAAAAAA-1111-2222-3333-444455556666';
  await expect(
    new CfdiSucursalGuard({ query } as unknown as DataSource).canActivate(
      ctx({ params: { uuid } }),
    ),
  ).resolves.toBe(true);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('WHERE CFDI_UUID=@0'),
    [uuid],
  );
});
it.each(['', 'SELECCIONAR', 'RFC_INVALIDO'])(
  'rechaza RFC emisor inválido %s incluso para admin',
  async (rfc) => {
    const query = jest.fn().mockResolvedValue([{ RFC_EMISOR: rfc }]);
    await expect(
      new CfdiSucursalGuard({ query } as unknown as DataSource).canActivate(
        ctx({ user: { username: 'ADMIN', roleId: 1 } }),
      ),
    ).rejects.toThrow(/RFC emisor inválido/);
  },
);
it('rechaza documento inexistente', async () => {
  const query = jest.fn().mockResolvedValue([]);
  await expect(
    new CfdiSucursalGuard({ query } as unknown as DataSource).canActivate(
      ctx(),
    ),
  ).rejects.toThrow(/Documento no encontrado/);
});
it('mantiene autenticación obligatoria', async () => {
  const query = jest.fn();
  await expect(
    new CfdiSucursalGuard({ query } as unknown as DataSource).canActivate(
      ctx({ user: null }),
    ),
  ).rejects.toThrow(/Usuario no autenticado/);
  expect(query).not.toHaveBeenCalled();
});
it('rutas sin documento conservan permisos y validaciones específicas', async () => {
  const query = jest.fn();
  await expect(
    new CfdiSucursalGuard({ query } as unknown as DataSource).canActivate(
      ctx({ params: {} }),
    ),
  ).resolves.toBe(true);
  expect(query).not.toHaveBeenCalled();
});
