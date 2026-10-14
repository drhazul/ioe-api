import { ExecutionContext } from '@nestjs/common';
import { AdminOnlyGuard } from '../../../common/guards/admin-only.guard';
import { CfdiCorreoAccessGuard } from './cfdi-correo-access.guard';

const envKeys = [
  'ADMIN_ROLE_IDS',
  'ADMIN_ROLE_ID',
  'ADMIN_NIVELES',
  'ADMIN_NIVEL',
] as const;
let previous: Record<string, string | undefined>;
beforeEach(() => {
  previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.ADMIN_ROLE_IDS = '1';
  process.env.ADMIN_NIVELES = '10';
  delete process.env.ADMIN_ROLE_ID;
  delete process.env.ADMIN_NIVEL;
});
afterEach(() => {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
const ctx = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as ExecutionContext;
const guard = () => new CfdiCorreoAccessGuard(new AdminOnlyGuard());

it.each([8002, '8002'])('admite rol de facturación de tiendas %s', (roleId) => {
  expect(guard().canActivate(ctx({ roleId, nivel: 0 }))).toBe(true);
});
it('conserva acceso de rol administrativo configurado', () => {
  expect(guard().canActivate(ctx({ roleId: 1, nivel: 0 }))).toBe(true);
});
it('conserva acceso por nivel administrativo configurado', () => {
  expect(guard().canActivate(ctx({ roleId: 5, nivel: 10 }))).toBe(true);
});
it('rechaza otros roles sin nivel administrativo', () => {
  expect(() => guard().canActivate(ctx({ roleId: 5, nivel: 0 }))).toThrow(
    /Solo ADMIN/,
  );
});
it('rechaza solicitud sin usuario autenticado', () => {
  expect(() => guard().canActivate(ctx(null))).toThrow(/No autenticado/);
});
