import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadGatewayException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cargarCsd } from './cfdi-sellador';
import { CsdService } from './csd.service';
import { CsdStore } from './csd.store';
import { EmisionService } from './emision.service';
import { QuadrumClient } from './quadrum.client';
import { generarCsdDePrueba } from './testing/csd-de-prueba';
import { ResultadoTimbrado, TimbradoService } from './timbrado.service';
import { FilasVenta } from './venta.mapper';
import { VentaRepositorio } from './venta.repositorio';

const UUID = 'A1B2C3D4-1111-2222-3333-444455556666';
const carpetas: string[] = [];

afterEach(() => {
  for (const c of carpetas.splice(0))
    rmSync(c, { recursive: true, force: true });
});

function filasVenta(header: Record<string, unknown> = {}): FilasVenta {
  return {
    header: {
      IDFOL: 'F-001',
      SUC: '01',
      RfcEmisor: 'JIFJ4704238T5',
      RfcReceptor: 'EKU9003173C9',
      RazonSocialReceptor: 'ESCUELA KEMPER URGATE',
      UsoCfdi: 'G03',
      MetodoDePago: 'PUE',
      FormaPagoSAT: '03',
      ...header,
    },
    detalle: [
      {
        Descripcion: 'ARMAZON',
        Cantidad: 2,
        PVTAT: 200,
        Unidad: 'H87',
        ObjetoImp: '02',
        IvaTasa: 0.16,
      },
    ],
    cliente: {
      RFCRECEPTOR: 'EKU9003173C9',
      CODIGOPOSTALRECEPTOR: '42501',
      REGIMENRECEPTOR: '601',
    },
    sucursal: { SUC: '01', RFC: 'JIFJ4704238T5' },
  };
}

function resultado(
  parcial: Partial<ResultadoTimbrado> = {},
): ResultadoTimbrado {
  return {
    exitoso: true,
    uuid: UUID,
    fecha: '2026-09-23T10:20:00',
    incidencias: [],
    ambiente: 'PRUEBAS',
    evidencia: 'C:/evidencia',
    xmlTimbrado: '<cfdi:Comprobante/>',
    ...parcial,
  };
}

function armar(
  opciones: {
    header?: Record<string, unknown>;
    timbrarVenta?: jest.Mock;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'cfdi-emision-'));
  carpetas.push(dir);

  const repo = {
    assertColumnaPac: jest.fn().mockResolvedValue(undefined),
    folio: jest.fn().mockResolvedValue(filasVenta(opciones.header)),
    reservarSerie: jest.fn().mockResolvedValue({
      serie: 'JIFJ',
      folio: '1234',
      nomenclatura: 'JIFJ-1234',
    }),
    actualizarEstadoSerie: jest.fn().mockResolvedValue(undefined),
    marcarTimbrado: jest.fn().mockResolvedValue(undefined),
    marcarError: jest.fn().mockResolvedValue(undefined),
  };

  const timbrarVenta =
    opciones.timbrarVenta ?? jest.fn().mockResolvedValue(resultado());

  // El timbrado real, con un CSD generado al vuelo: asi la SIMULACION sella
  // de verdad (arma, sella y verifica) sin tocar el PAC. Solo 'timbrarVenta'
  // queda simulado, porque es el que saldria a internet.
  const generado = generarCsdDePrueba();
  const csdService = {
    obtenerPorRfc: jest.fn().mockResolvedValue({
      csd: cargarCsd(generado),
      cer: generado.cer,
      regimenFiscal: '612',
      codigoPostal: '39000',
    }),
  } as unknown as CsdService;
  const real = new TimbradoService(
    { esProduccion: () => false } as unknown as QuadrumClient,
    {} as unknown as CsdStore,
    { get: () => undefined } as unknown as ConfigService,
    csdService,
  );
  const timbrado = {
    timbrarVenta,
    comprobanteDeVenta: (
      datos: Parameters<TimbradoService['comprobanteDeVenta']>[0],
    ) => real.comprobanteDeVenta(datos),
    sellarComprobante: (
      ...args: Parameters<TimbradoService['sellarComprobante']>
    ) => real.sellarComprobante(...args),
  } as unknown as TimbradoService;

  const config = {
    get: (k: string) => (k === 'CFDI_STORAGE_BASE_PATH' ? dir : undefined),
  } as unknown as ConfigService;

  return {
    service: new EmisionService(
      repo as unknown as VentaRepositorio,
      timbrado,
      config,
    ),
    repo,
    timbrarVenta,
    dir,
  };
}

describe('EmisionService', () => {
  it('reserva folio, timbra, guarda el XML y marca el folio como de Quadrum', async () => {
    const { service, repo, timbrarVenta, dir } = armar();

    const r = await service.emitir('F-001', { usuario: 'sergio' });

    expect(r.uuid).toBe(UUID);
    expect(r.pac).toBe('QUADRUM');
    expect(repo.reservarSerie).toHaveBeenCalledTimes(1);

    // La venta llega al timbrado con serie y folio ya reservados.
    const [datos] = timbrarVenta.mock.calls[0] as [
      { serie: string; folio: string },
    ];
    expect(datos.serie).toBe('JIFJ');
    expect(datos.folio).toBe('1234');

    expect(repo.marcarTimbrado).toHaveBeenCalledWith(
      expect.objectContaining({ idFol: 'F-001', uuid: UUID }),
    );
    expect(repo.actualizarEstadoSerie).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'TIMBRADO', uuid: UUID }),
    );

    // El XML timbrado queda guardado bajo el RFC del emisor.
    expect(r.xmlPath).toContain(join(dir, 'JIFJ4704238T5'));
    expect(existsSync(r.xmlPath)).toBe(true);
  });

  it('no vuelve a timbrar un folio que ya tiene UUID', async () => {
    const { service, repo, timbrarVenta } = armar({
      header: { CFDI_UUID: UUID },
    });

    await expect(service.emitir('F-001')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.reservarSerie).not.toHaveBeenCalled();
    expect(timbrarVenta).not.toHaveBeenCalled();
  });

  it('no toca un folio marcado para Facturify', async () => {
    const { service, timbrarVenta } = armar({
      header: { CFDI_PAC: 'FACTURIFY' },
    });

    await expect(service.emitir('F-001')).rejects.toThrow(/FACTURIFY/);
    expect(timbrarVenta).not.toHaveBeenCalled();
  });

  it('con un rechazo del PAC libera el folio para poder corregir', async () => {
    const timbrarVenta = jest.fn().mockResolvedValue(
      resultado({
        exitoso: false,
        uuid: undefined,
        incidencias: [
          { codigoError: 'CFDI40147', mensajeIncidencia: 'CP del receptor' },
        ],
      }),
    );
    const { service, repo } = armar({ timbrarVenta });

    await expect(service.emitir('F-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    const [errorPac] = repo.marcarError.mock.calls[0] as [{ mensaje: string }];
    expect(errorPac.mensaje).toContain('CFDI40147');
    expect(repo.actualizarEstadoSerie).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'ERROR_EMISION' }),
    );
    expect(repo.marcarTimbrado).not.toHaveBeenCalled();
  });

  it('con resultado INCIERTO no libera el folio', async () => {
    // Si el PAC no contesta pudo haber timbrado. Liberar la serie aqui
    // permitiria reusarla y terminar con dos CFDI del mismo ticket.
    const timbrarVenta = jest.fn().mockRejectedValue(
      new BadGatewayException({
        message: 'Se agoto el tiempo de espera',
        resultadoIncierto: true,
      }),
    );
    const { service, repo } = armar({ timbrarVenta });

    await expect(service.emitir('F-001')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    const [incierto] = repo.marcarError.mock.calls[0] as [{ mensaje: string }];
    expect(incierto.mensaje).toContain('RESULTADO INCIERTO');
    expect(repo.actualizarEstadoSerie).not.toHaveBeenCalled();
  });

  it('una venta mal capturada se rechaza y libera el folio', async () => {
    const { service, repo, timbrarVenta } = armar({
      header: { UsoCfdi: 'SELECCIONAR' },
    });

    await expect(service.emitir('F-001')).rejects.toThrow(/UsoCfdi/);
    expect(timbrarVenta).not.toHaveBeenCalled();
    expect(repo.actualizarEstadoSerie).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'ERROR_EMISION' }),
    );
  });
});

describe('EmisionService.probar (simulacion)', () => {
  it('sella el folio sin llamar al PAC ni escribir en la base', async () => {
    const { service, repo, timbrarVenta } = armar();

    const r = await service.probar('F-001');

    expect(r.simulacion).toBe(true);
    expect(r.rfcEmisor).toBe('JIFJ4704238T5');
    expect(r.total).toBe('232.00');
    expect(r.conceptos).toBe(1);
    expect(r.xml).toContain('TipoDeComprobante="I"');
    expect(r.cadena.startsWith('||4.0|')).toBe(true);

    // Nada de esto debe pasar en una simulacion.
    expect(timbrarVenta).not.toHaveBeenCalled();
    expect(repo.reservarSerie).not.toHaveBeenCalled();
    expect(repo.marcarTimbrado).not.toHaveBeenCalled();
    expect(repo.actualizarEstadoSerie).not.toHaveBeenCalled();
    expect(repo.marcarError).not.toHaveBeenCalled();
  });

  it('avisa si el folio ya tiene UUID, sin bloquear la simulacion', async () => {
    const { service } = armar({
      header: { CFDI_UUID: UUID, CFDI_PAC: 'FACTURIFY' },
    });

    const r = await service.probar('F-001');

    expect(r.uuidPrevio).toBe(UUID);
    expect(r.pacPrevio).toBe('FACTURIFY');
  });

  it('reporta los datos fiscales que faltan', async () => {
    const { service, repo } = armar({ header: { UsoCfdi: 'SELECCIONAR' } });

    await expect(service.probar('F-001')).rejects.toThrow(/UsoCfdi/);
    expect(repo.marcarError).not.toHaveBeenCalled();
  });
});
