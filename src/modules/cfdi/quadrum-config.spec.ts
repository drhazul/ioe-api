import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  assertOperacionQuadrum,
  endpointQuadrum,
  validarRfcEmisor,
} from './quadrum-config';
import { QuadrumClient, PacError } from './quadrum.client';
import { QuadrumCancelacionClient } from './quadrum-cancelacion.client';

const RFC = 'JICJ800630854';
const cuenta = { usuario: 'cuenta-ficticia', contrasena: 'secreto-ficticio' };
function config(extra: Record<string, unknown> = {}) {
  return new ConfigService({
    QUADRUM_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/timbrar',
    QUADRUM_CANCELAR_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/cancelar',
    ...extra,
  });
}
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  jest.restoreAllMocks();
});

describe('Quadrum producción: destino e identidad', () => {
  it.each([
    'http://ws.cfdiquadrum.com.mx/timbrar',
    'https://evil.example/timbrar',
    'https://ws.cfdiquadrum.com.mx/timbrar.wsdl',
  ])('rechaza destino %s antes de enviar credenciales', (url) => {
    expect(() =>
      endpointQuadrum(config({ QUADRUM_ENDPOINT: url }), 'timbrar'),
    ).toThrow(ServiceUnavailableException);
  });
  it('rechaza mezcla de ambientes y endpoint productivo incompleto', () => {
    expect(() =>
      endpointQuadrum(
        config({
          QUADRUM_CANCELAR_ENDPOINT:
            'https://devws.cfdiquadrum.com.mx/cancelar',
        }),
        'timbrar',
      ),
    ).toThrow();
    expect(() =>
      endpointQuadrum(
        config({ QUADRUM_CANCELAR_ENDPOINT: undefined }),
        'timbrar',
      ),
    ).toThrow();
  });
  it('producción permanece apagada por defecto', () => {
    expect(() => assertOperacionQuadrum(config(), RFC, 'FACTURA')).toThrow(
      ForbiddenException,
    );
  });
  it('habilita sólo RFC y flujo explícitos', () => {
    const c = config({
      QUADRUM_PRODUCCION_HABILITADA: true,
      QUADRUM_RFC_HABILITADOS: RFC,
      QUADRUM_FLUJOS_HABILITADOS: 'FACTURA',
    });
    expect(() => assertOperacionQuadrum(c, RFC, 'FACTURA')).not.toThrow();
    expect(() =>
      assertOperacionQuadrum(c, 'JIFJ4704238T5', 'FACTURA'),
    ).toThrow();
    expect(() => assertOperacionQuadrum(c, RFC, 'CANCELACION')).toThrow();
  });
  it.each(['SELECCIONAR', '', 'RFC-INVENTADO'])('rechaza RFC %s', (rfc) => {
    expect(() => validarRfcEmisor(rfc)).toThrow();
  });
  it('cuenta global no sustituye cuenta individual en ambos clientes', () => {
    const c = config({
      QUADRUM_USUARIO: 'global-ficticio',
      QUADRUM_CONTRASENA: 'global-ficticio',
    });
    for (const client of [
      new QuadrumClient(c),
      new QuadrumCancelacionClient(c),
    ]) {
      expect(client.hasCredentials()).toBe(false);
      expect(
        client.hasCredentials({ usuario: cuenta.usuario, contrasena: '' }),
      ).toBe(false);
      expect(client.hasCredentials(cuenta)).toBe(true);
    }
  });
  it.each(['Usuario o Contrasena Invalida', 'Could not get invoice'])(
    'consulta timbrado HTTP 200 interpreta error %s',
    async (error) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue({
          status: 200,
          text: async () =>
            `<consultaResult><error>${error}</error></consultaResult>`,
        });
      await expect(
        new QuadrumClient(config()).consultar(
          '00000000-0000-0000-0000-000000000000',
          cuenta,
        ),
      ).rejects.toBeInstanceOf(PacError);
    },
  );
  it('consulta cancelación distingue autenticación rechazada aunque HTTP sea 200', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: async () =>
          '<consultaResult><error>Usuario o Contrasena Invalida</error></consultaResult>',
      });
    await expect(
      new QuadrumCancelacionClient(config()).consultar(
        '00000000-0000-0000-0000-000000000000',
        cuenta,
      ),
    ).rejects.toThrow(/Invalida/);
  });
});
