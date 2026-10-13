import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { CsdService } from './csd.service';
import { CsdStore } from './csd.store';
import { cargarCsd } from './cfdi-sellador';
import { generarCsdDePrueba } from './testing/csd-de-prueba';
import { QuadrumClient } from './quadrum.client';
import { TimbradoService } from './timbrado.service';

const original = globalThis.fetch;
const dirs: string[] = [];
afterEach(() => {
  globalThis.fetch = original;
  jest.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function armar(habilitada = true) {
  const generado = generarCsdDePrueba({
    noCertificado: '00001000000719639496',
  });
  const csd = cargarCsd(generado);
  const dir = mkdtempSync(join(tmpdir(), 'quadrum-prod-test-'));
  dirs.push(dir);
  const cfg = new ConfigService({
    QUADRUM_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/timbrar',
    QUADRUM_CANCELAR_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/cancelar',
    QUADRUM_PRODUCCION_HABILITADA: habilitada,
    QUADRUM_RFC_HABILITADOS: csd.rfc,
    QUADRUM_FLUJOS_HABILITADOS: 'FACTURA',
    CFDI_EVIDENCIA_DIR: dir,
  });
  const store = {
    obtener: () => csd,
    certificadoDer: () => generado.cer,
  } as unknown as CsdStore;
  const csdService = {
    obtenerPorRfc: jest
      .fn()
      .mockResolvedValue({
        csd,
        cer: generado.cer,
        regimenFiscal: '612',
        codigoPostal: '39000',
        credencialesPac: {
          usuario: 'cuenta-propia-ficticia',
          contrasena: 'secreto-propio-ficticio',
        },
      }),
  } as unknown as CsdService;
  const service = new TimbradoService(
    new QuadrumClient(cfg),
    store,
    cfg,
    csdService,
  );
  const venta = {
    rfcEmisor: csd.rfc!,
    serie: 'XIQB',
    folio: 'TEST',
    fecha: '2026-10-12T12:00:00',
    formaPago: '01',
    metodoPago: 'PUE' as const,
    receptor: {
      rfc: 'EKU9003173C9',
      nombre: 'ESCUELA KEMPER URGATE',
      domicilioFiscal: '42501',
      regimenFiscal: '601',
      usoCfdi: 'G03',
    },
    conceptos: [
      {
        claveProdServ: '52161500',
        claveUnidad: 'H87',
        descripcion: 'PRUEBA UNITARIA',
        cantidad: '1',
        valorUnitario: '100',
        objetoImp: '02' as const,
        ivaTasa: '0.160000',
      },
    ],
  };
  return { service, venta, csdService };
}

it('factura real habilitada conserva cuenta de su RFC, XML y evidencia sin contraseña', async () => {
  let cuerpo = '';
  globalThis.fetch = jest.fn().mockImplementation((_url, init) => {
    cuerpo = init.body;
    return Promise.resolve({
      status: 200,
      text: async () =>
        '<timbrarResult><UUID>AAAAAAAA-1111-2222-3333-444455556666</UUID><xml>&lt;cfdi:Comprobante/&gt;</xml></timbrarResult>',
    });
  });
  const { service, venta } = armar();
  const r = await service.timbrarVenta(venta);
  expect(r.ambiente).toBe('PRODUCCION');
  expect(r.exitoso).toBe(true);
  expect(cuerpo).toContain('cuenta-propia-ficticia');
  expect(readFileSync(join(r.evidencia, 'enviado.xml'), 'utf8')).not.toContain(
    'secreto-propio-ficticio',
  );
});

it('flag desactivado no envía factura al PAC', async () => {
  globalThis.fetch = jest.fn();
  const { service, venta } = armar(false);
  await expect(service.timbrarVenta(venta)).rejects.toThrow(/no habilitada/);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('ninguna ruta sintética timbra con endpoints productivos', async () => {
  globalThis.fetch = jest.fn();
  const { service } = armar();
  await expect(service.timbrarPrueba()).rejects.toThrow(/bloqueadas/);
  await expect(service.timbrarFacturaPpdPrueba()).rejects.toThrow(/bloqueadas/);
  await expect(
    service.timbrarNotaCreditoPrueba('AAAAAAAA-1111-2222-3333-444455556666'),
  ).rejects.toThrow(/bloqueadas/);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('diagnóstico por RFC distingue cuenta rechazada de UUID inexistente', async () => {
  const { service } = armar();
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({
      status: 200,
      text: async () =>
        '<consultaResult><error>Usuario o Contrasena Invalida</error></consultaResult>',
    });
  expect((await service.diagnosticarRfc('XIQB891116QE4')).ok).toBe(false);
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({
      status: 200,
      text: async () =>
        '<consultaResult><error>UUID does not exist</error></consultaResult>',
    });
  expect((await service.diagnosticarRfc('XIQB891116QE4')).ok).toBe(true);
});

it('Fault interno después de enviar timbrado conserva resultado incierto', async () => {
  const { service, venta } = armar();
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({
      status: 500,
      text: async () =>
        "<Fault><faultcode>senv:Server</faultcode><faultstring>local variable 'result' referenced before assignment</faultstring></Fault>",
    });
  try {
    await service.timbrarVenta(venta);
    throw new Error('debía fallar');
  } catch (e) {
    expect(
      (e as { response: { resultadoIncierto: boolean } }).response
        .resultadoIncierto,
    ).toBe(true);
  }
});
