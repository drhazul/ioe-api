import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { assertOperacionQuadrum } from './quadrum-config';
import { CsdRepositorio } from './csd.repositorio';
import { DataSource } from 'typeorm';

const config = new ConfigService({
  QUADRUM_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/timbrar',
  QUADRUM_CANCELAR_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/cancelar',
  QUADRUM_PRODUCCION_HABILITADA: true,
});
const rfc = 'JIGE810809HI4';

it('aplica permisos independientes por operación y niega ausencia', () => {
  const permisos = {
    factura: true,
    notaCredito: false,
    complementoPago: false,
  };
  expect(() =>
    assertOperacionQuadrum(config, rfc, 'FACTURA', permisos),
  ).not.toThrow();
  expect(() =>
    assertOperacionQuadrum(config, rfc, 'NOTA_CREDITO', permisos),
  ).toThrow(ForbiddenException);
  expect(() =>
    assertOperacionQuadrum(config, rfc, 'COMPLEMENTO_PAGO', permisos),
  ).toThrow(ForbiddenException);
  expect(() => assertOperacionQuadrum(config, rfc, 'FACTURA', null)).toThrow(
    ForbiddenException,
  );
});

it('la renovación transfiere los permisos de la fila previamente activa', async () => {
  const query = jest.fn().mockResolvedValueOnce([{ existe: 1 }]);
  const manager = {
    query: jest
      .fn()
      .mockResolvedValueOnce([{ factura: true, nota: false, pago: true }])
      .mockResolvedValue([]),
  };
  const ds = {
    query,
    transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
  };
  const repo = new CsdRepositorio(ds as unknown as DataSource);
  await repo.guardar({
    rfc,
    noCertificado: 'nuevo',
    regimenFiscal: '612',
    codigoPostal: '91700',
    cer: Buffer.alloc(1),
    llave: Buffer.alloc(1),
    passwordCifrada: 'x',
    vigenciaDesde: new Date(),
    vigenciaHasta: new Date(),
  });
  expect(manager.query).toHaveBeenLastCalledWith(
    expect.stringContaining('QUADRUM_FACTURA_HABILITADA=@2'),
    [rfc, 'nuevo', true, false, true],
  );
});
