import { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { CfdiController } from './cfdi.controller';
import { CsdService } from './csd.service';
import { CsdRepositorio } from './csd.repositorio';
import { descifrar } from './cripto';
import { DataSource } from 'typeorm';

const RFC = 'JIFJ4704238T5';
const SECRETO = 'secreto-ficticio-para-pruebas';
function armar() {
  const repo = {
    cuentaActivaPorRfc: jest
      .fn()
      .mockResolvedValue({
        NO_CERTIFICADO: '00001000000705673508',
        QUADRUM_USUARIO: 'anterior@example.invalid',
        TIENE_PASSWORD: true,
      }),
    actualizarCuentaQuadrum: jest.fn().mockResolvedValue(undefined),
  };
  return {
    repo,
    service: new CsdService(
      repo as unknown as CsdRepositorio,
      new ConfigService({ CSD_CIFRADO_LLAVE: SECRETO }),
    ),
  };
}

it('cambio de cuenta cifra contraseña y respuesta no la contiene', async () => {
  const { repo, service } = armar();
  const res = await service.actualizarCuentaQuadrum(RFC, {
    quadrumUsuario: 'nuevo@example.invalid',
    quadrumPassword: 'password-ficticio&<>',
  });
  const guardado = repo.actualizarCuentaQuadrum.mock.calls[0][0];
  expect(descifrar(guardado.quadrumPasswordCifrada, SECRETO)).toBe(
    'password-ficticio&<>',
  );
  expect(JSON.stringify(res)).not.toContain('password-ficticio');
  expect(Object.keys(guardado).sort()).toEqual(
    [
      'rfc',
      'noCertificado',
      'usuarioAnterior',
      'quadrumUsuario',
      'quadrumPasswordCifrada',
    ].sort(),
  );
});
it('usuario nuevo sin contraseña no mezcla cuentas', async () => {
  const { repo, service } = armar();
  await expect(
    service.actualizarCuentaQuadrum(RFC, {
      quadrumUsuario: 'nuevo@example.invalid',
    }),
  ).rejects.toThrow(/al cambiar usuario/);
  expect(repo.actualizarCuentaQuadrum).not.toHaveBeenCalled();
});
it('mismo usuario con contraseña omitida conserva cifrado anterior', async () => {
  const { repo, service } = armar();
  await service.actualizarCuentaQuadrum(RFC, {
    quadrumUsuario: ' anterior@example.invalid ',
  });
  expect(
    repo.actualizarCuentaQuadrum.mock.calls[0][0].quadrumPasswordCifrada,
  ).toBeUndefined();
});
it('sin certificado activo no modifica registros históricos', async () => {
  const { repo, service } = armar();
  repo.cuentaActivaPorRfc.mockResolvedValue(null);
  await expect(
    service.actualizarCuentaQuadrum(RFC, {
      quadrumUsuario: 'nuevo@example.invalid',
      quadrumPassword: 'ficticio',
    }),
  ).rejects.toThrow(/No hay CSD activo/);
  expect(repo.actualizarCuentaQuadrum).not.toHaveBeenCalled();
});
it('PATCH está protegido por AdminOnlyGuard', () => {
  expect(
    Reflect.getMetadata(
      GUARDS_METADATA,
      CfdiController.prototype.actualizarCuentaQuadrum,
    ),
  ).toContain(AdminOnlyGuard);
});
it('UPDATE sólo escribe dos columnas PAC y limita RFC, certificado y activo', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ existe: 1 }])
    .mockResolvedValueOnce([{ RFC }]);
  await new CsdRepositorio({
    query,
  } as unknown as DataSource).actualizarCuentaQuadrum({
    rfc: RFC,
    noCertificado: 'cert-ficticio',
    usuarioAnterior: 'anterior',
    quadrumUsuario: 'nuevo',
    quadrumPasswordCifrada: 'cifrado-ficticio',
  });
  const sql = query.mock.calls[1][0];
  expect(sql).toContain('ACTIVO = 1 AND NO_CERTIFICADO = @3');
  const set = sql.split('SET')[1].split('OUTPUT')[0];
  expect(set).not.toMatch(
    /\bCER\b|\bLLAVE\b|\bPASSWORD_CIFRADA\b|VIGENCIA|REGIMEN|CODIGO_POSTAL/,
  );
});
