import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { CancelacionService } from './cancelacion.service';
import { CsdService } from './csd.service';
import { CsdStore } from './csd.store';
import { QuadrumCancelacionClient } from './quadrum-cancelacion.client';
import { generarCsdDePrueba } from './testing/csd-de-prueba';
import { VentaRepositorio } from './venta.repositorio';

const UUID = 'AAAAAAAA-1111-2222-3333-444455556666';
const CUENTA = {
  usuario: 'cuenta-ficticia-rfc',
  contrasena: 'clave-ficticia-rfc',
};
const input = {
  uuid: UUID,
  motivo: '03',
  rfcReceptor: 'XAXX010101000',
  total: '999.98',
};
const ESTADO =
  '<obtiene_status_satResult><Estado>Vigente</Estado><EsCancelable>Cancelable sin aceptacion</EsCancelable></obtiene_status_satResult>';
const ACUSE = `<cancelarResult><Folios><Folio><UUID>${UUID}</UUID><EstatusUUID>201</EstatusUUID></Folio></Folios></cancelarResult>`;
const dirs: string[] = [];
let generado: ReturnType<typeof generarCsdDePrueba>;

beforeAll(() => {
  generado = generarCsdDePrueba();
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function armar(
  rfc = 'JICJ800630854',
  header: Record<string, unknown> | null = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'cfdi-cancelacion-prod-'));
  dirs.push(dir);
  const config = new ConfigService({
    QUADRUM_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/timbrar',
    QUADRUM_CANCELAR_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/cancelar',
    QUADRUM_PRODUCCION_HABILITADA: false,
    QUADRUM_RFC_HABILITADOS: '',
    QUADRUM_FLUJOS_HABILITADOS: 'FACTURA',
    QUADRUM_USUARIO: 'global-no-usar',
    QUADRUM_CONTRASENA: 'global-no-usar',
    CFDI_EVIDENCIA_DIR: dir,
  });
  const csdService = {
    obtenerPorRfc: jest.fn().mockResolvedValue({
      // CsdService simulado: la identidad criptográfica real se prueba en su suite.
      csd: {
        rfc,
        certificadoBase64: generado.cer.toString('base64'),
        llavePrivada: generado.privateKey,
      },
      credencialesPac: CUENTA,
    }),
  };
  const repo = {
    folioPorUuid: jest
      .fn()
      .mockResolvedValue(
        header === null
          ? null
          : {
              IDFOL: 'F-TEST',
              CFDI_UUID: UUID,
              CFDI_PAC: 'QUADRUM',
              RfcEmisor: rfc,
              ...header,
            },
      ),
    conEmisionExclusiva: jest.fn(
      (_id: string, action: () => Promise<unknown>) => action(),
    ),
    marcarCancelacionSolicitada: jest.fn().mockResolvedValue(undefined),
    marcarCancelado: jest.fn().mockResolvedValue(undefined),
  };
  const store = {
    obtener: jest.fn(),
    certificadoPem: jest.fn(),
    llavePrivadaPem: jest.fn(),
  };
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async (_url, init) =>
        new Response(
          String(init?.body).includes('<can:cancelar ') ? ACUSE : ESTADO,
          { status: 200 },
        ),
    );
  return {
    service: new CancelacionService(
      new QuadrumCancelacionClient(config),
      store as unknown as CsdStore,
      config,
      csdService as unknown as CsdService,
      repo as unknown as VentaRepositorio,
    ),
    fetchMock,
    csdService,
    repo,
    store,
  };
}

describe('Cancelación productiva sin lista administrativa de RFC o flujo', () => {
  it.each(['JICJ800630854', 'JIFT6203071N7', 'JIFJ4704238T5', 'AAA010101AAA'])(
    'tramita %s con cuenta propia aunque emisión esté apagada y RFC fuera de listas',
    async (rfc) => {
      const { service, fetchMock, csdService, repo, store } = armar(rfc);
      const result = await service.cancelar(input);
      expect(result.acuse?.exitoso).toBe(true);
      expect(repo.conEmisionExclusiva).toHaveBeenCalledWith(
        'F-TEST',
        expect.any(Function),
      );
      expect(repo.marcarCancelacionSolicitada).toHaveBeenCalledTimes(1);
      expect(repo.marcarCancelado).not.toHaveBeenCalled();
      expect(
        csdService.obtenerPorRfc.mock.calls.every(
          ([selected]) => selected === rfc,
        ),
      ).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [url, init] of fetchMock.mock.calls) {
        expect(url).toBe('https://ws.cfdiquadrum.com.mx/cancelar');
        expect(String(init?.body)).toContain(
          `<can:usuario>${CUENTA.usuario}</can:usuario>`,
        );
        expect(String(init?.body)).not.toContain('global-no-usar');
      }
      const requests = fetchMock.mock.calls.map(([, init]) =>
        String(init?.body),
      );
      expect(requests[0]).toContain(
        `<can:taxpayer_id>${rfc}</can:taxpayer_id>`,
      );
      expect(requests[1]).toContain(`<can:rfc>${rfc}</can:rfc>`);
      expect(
        requests.filter((body) => body.includes('<can:cancelar ')),
      ).toHaveLength(1);
      const evidence = readFileSync(
        join(result.evidencia!, 'resultado.json'),
        'utf8',
      );
      expect(evidence).not.toContain(CUENTA.contrasena);
      expect(evidence).not.toContain('PRIVATE KEY');
      expect(store.obtener).not.toHaveBeenCalled();
      expect(store.llavePrivadaPem).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { CFDI_PAC: 'FACTURIFY' },
    { RfcEmisor: '' },
    { RfcEmisor: 'SELECCIONAR' },
  ])(
    'rechaza documento o identidad fiscal no verificables %j sin red',
    async (header) => {
      const { service, fetchMock } = armar('JICJ800630854', header);
      await expect(service.cancelar(input)).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('sin CSD propio no usa certificado global ni consulta PAC', async () => {
    const { service, csdService, fetchMock, store } = armar();
    csdService.obtenerPorRfc.mockRejectedValue(
      new Error('CSD del emisor no disponible'),
    );
    await expect(service.cancelar(input)).rejects.toThrow(
      'CSD del emisor no disponible',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.obtener).not.toHaveBeenCalled();
  });

  it('sin contraseña de cuenta propia no usa cuenta global', async () => {
    const { service, csdService, fetchMock } = armar();
    const emisor = await csdService.obtenerPorRfc('JICJ800630854');
    csdService.obtenerPorRfc.mockResolvedValue({
      ...emisor,
      credencialesPac: { usuario: CUENTA.usuario, contrasena: '' },
    });
    await expect(service.cancelar(input)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
