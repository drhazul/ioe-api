import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CancelacionService } from './cancelacion.service';
import { CsdService } from './csd.service';
import { CsdStore } from './csd.store';
import { VentaRepositorio } from './venta.repositorio';
import { PacError } from './quadrum.client';
import {
  AcuseCancelacion,
  EstatusSat,
  QuadrumCancelacionClient,
} from './quadrum-cancelacion.client';

const UUID = 'A1B2C3D4-1111-2222-3333-444455556666';
const SUSTITUTO = 'B2C3D4E5-2222-3333-4444-555566667777';
const LLAVE = Buffer.from('llave-privada-que-no-debe-filtrarse');

const carpetas: string[] = [];

afterEach(() => {
  for (const c of carpetas.splice(0))
    rmSync(c, { recursive: true, force: true });
});

const VIGENTE: EstatusSat = {
  esCancelable: 'Cancelable sin aceptación',
  codigoEstatus: 'S - Comprobante obtenido satisfactoriamente',
  estado: 'Vigente',
};

function armar(
  opciones: {
    produccion?: boolean;
    estatusSat?: jest.Mock;
    cancelar?: jest.Mock;
  } = {},
) {
  const estatusSat =
    opciones.estatusSat ?? jest.fn().mockResolvedValue(VIGENTE);
  const cancelar =
    opciones.cancelar ??
    jest.fn().mockResolvedValue({
      codEstatus: 'OK',
      fecha: '2026-09-17T10:00:00',
      rfcEmisor: 'XIQB891116QE4',
      acuse: '<Acuse/>',
      folios: [{ uuid: UUID, estatusUUID: '201' }],
      exitoso: true,
    } as AcuseCancelacion);

  const cliente = {
    esProduccion: () => Boolean(opciones.produccion),
    estatusSat,
    cancelar,
  } as unknown as QuadrumCancelacionClient;

  const csdStore = {
    obtener: () => ({ rfc: 'XIQB891116QE4' }),
    certificadoPem: () => Buffer.from('-----BEGIN CERTIFICATE-----'),
    llavePrivadaPem: () => LLAVE,
  } as unknown as CsdStore;

  const dir = mkdtempSync(join(tmpdir(), 'cfdi-cancelacion-'));
  carpetas.push(dir);
  const config = {
    get: (k: string) => (k === 'CFDI_EVIDENCIA_DIR' ? dir : undefined),
  } as unknown as ConfigService;

  // Sin CSD por RFC cargado, el servicio cae al del .env: es el camino
  // que estas pruebas ejercitan.
  const csdService = {
    obtenerPorRfc: () => Promise.reject(new Error('sin CSD')),
  } as unknown as CsdService;

  const marcados: string[] = [];
  const repo = {
    folioPorUuid: () => Promise.resolve(null),
    marcarCancelacionSolicitada: (idFol: string) => {
      marcados.push(idFol);
      return Promise.resolve();
    },
  } as unknown as VentaRepositorio;

  return {
    service: new CancelacionService(
      cliente,
      csdStore,
      config,
      csdService,
      repo,
    ),
    marcados,
    estatusSat,
    cancelar,
    dir,
  };
}

const peticion = {
  uuid: UUID,
  motivo: '02',
  rfcReceptor: 'XAXX010101000',
  total: '7000.01',
};

describe('CancelacionService', () => {
  it('cancela, guarda el acuse del SAT y NUNCA escribe la llave privada', async () => {
    const { service, cancelar } = armar();

    const r = await service.cancelar(peticion);

    expect(r.solicitada).toBe(true);
    expect(r.acuse?.exitoso).toBe(true);
    expect(r.motivoDescripcion).toMatch(/sin relacion/i);

    // El PAC recibe el CSD completo...
    expect(cancelar).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: UUID, motivo: '02', key: LLAVE }),
    );

    // ...pero la evidencia en disco no.
    expect(existsSync(join(r.evidencia!, 'acuse-sat.xml'))).toBe(true);
    const resultado = readFileSync(
      join(r.evidencia!, 'resultado.json'),
      'utf8',
    );
    expect(resultado).toContain(UUID);
    expect(resultado).not.toContain(LLAVE.toString('base64'));
    expect(resultado).not.toContain(LLAVE.toString('utf8'));
  });

  it('pregunta el estatus al SAT ANTES de cancelar', async () => {
    const orden: string[] = [];
    const estatusSat = jest.fn().mockImplementation(() => {
      orden.push('estatus');
      return Promise.resolve(VIGENTE);
    });
    const cancelar = jest.fn().mockImplementation(() => {
      orden.push('cancelar');
      return Promise.resolve({
        folios: [],
        exitoso: false,
      } as AcuseCancelacion);
    });
    const { service } = armar({ estatusSat, cancelar });

    await service.cancelar(peticion);

    expect(orden).toEqual(['estatus', 'cancelar']);
  });

  it('no vuelve a cancelar un CFDI que el SAT ya reporta cancelado', async () => {
    const estatusSat = jest
      .fn()
      .mockResolvedValue({ ...VIGENTE, estado: 'Cancelado' });
    const { service, cancelar } = armar({ estatusSat });

    const r = await service.cancelar(peticion);

    expect(r.yaEstabaCancelado).toBe(true);
    expect(r.solicitada).toBe(false);
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('no reenvia la solicitud si el SAT ya la tiene en proceso', async () => {
    // Entre la solicitud y el cambio a "Cancelado" el SAT deja el CFDI como
    // Vigente con EstatusCancelacion "En proceso"; reenviar ahi duplica.
    const estatusSat = jest
      .fn()
      .mockResolvedValue({ ...VIGENTE, estatusCancelacion: 'En proceso' });
    const { service, cancelar } = armar({ estatusSat });

    const r = await service.cancelar(peticion);

    expect(r.enProceso).toBe(true);
    expect(r.solicitada).toBe(false);
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('se niega cuando el SAT dice que no es cancelable', async () => {
    const estatusSat = jest
      .fn()
      .mockResolvedValue({ ...VIGENTE, esCancelable: 'No cancelable' });
    const { service, cancelar } = armar({ estatusSat });

    await expect(service.cancelar(peticion)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('rechaza motivos invalidos sin molestar al PAC', async () => {
    const { service, estatusSat } = armar();

    await expect(
      service.cancelar({ ...peticion, motivo: '01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.cancelar({ ...peticion, folioSustitucion: SUSTITUTO }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(estatusSat).not.toHaveBeenCalled();
  });

  it('acepta el motivo 01 con folio de sustitucion', async () => {
    const { service, cancelar } = armar();

    const r = await service.cancelar({
      ...peticion,
      motivo: '01',
      folioSustitucion: SUSTITUTO,
    });

    expect(r.folioSustitucion).toBe(SUSTITUTO);
    expect(cancelar).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: '01', folioSustitucion: SUSTITUTO }),
    );
  });

  it('se niega a cancelar contra produccion', async () => {
    const { service, estatusSat } = armar({ produccion: true });

    await expect(service.cancelar(peticion)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(estatusSat).not.toHaveBeenCalled();
  });

  it('marca el resultado como incierto cuando el PAC no contesta', async () => {
    const cancelar = jest
      .fn()
      .mockRejectedValue(new PacError('Se agoto el tiempo de espera', true));
    const { service } = armar({ cancelar });

    await expect(service.cancelar(peticion)).rejects.toMatchObject({
      response: { resultadoIncierto: true },
    });
    await expect(service.cancelar(peticion)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('estatus() resume si es cancelable y si necesita aceptacion', async () => {
    const estatusSat = jest.fn().mockResolvedValue({
      ...VIGENTE,
      esCancelable: 'Cancelable con aceptación',
    });
    const { service } = armar({ estatusSat });

    const r = await service.estatus({
      uuid: UUID,
      rfcReceptor: 'XAXX010101000',
      total: '7000.01',
    });

    expect(r.cancelable).toBe(true);
    expect(r.requiereAceptacion).toBe(true);
    expect(r.ambiente).toBe('PRUEBAS');
  });
});
