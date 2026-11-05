import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OdooAccountMapService } from './odoo-account-map.service';

const input = {
  fiscalEntityId: 1,
  sourceAccount: '101001003',
  branch: 'DF01',
  eventType: 'CAJA_CHICA_DISPOSICION_REINTEGRO',
  entryRole: 'PRINCIPAL' as const,
  sourceAmount: 250,
  eventDate: '2026-10-23',
};

const validMap = {
  ID_MAPEO: 1,
  ID_ENTIDAD_FISCAL: 1,
  SUC: null,
  TIPO_EVENTO: input.eventType,
  ROL_APUNTE: 'PRINCIPAL',
  SIGNO_IMPORTE: 'POSITIVO',
  ODOO_ENTORNO: 'ONLINE',
  ODOO_COMPANY_ID: 1,
  ODOO_COD_CUENTA: '101.01.01',
  ESTADO_MAPEO: 'VALIDADA',
  APROBADO_POR: 'TITULAR IOE',
  REFERENCIA_APROBACION: 'AUTORIZACION_CONTABLE',
  FCN_APROBACION_UTC: '2026-10-23T12:00:00Z',
};

describe('OdooAccountMapService', () => {
  let query: jest.Mock;
  let service: OdooAccountMapService;

  beforeEach(() => {
    query = jest.fn();
    service = new OdooAccountMapService({ query } as unknown as DataSource);
    query
      .mockResolvedValueOnce([
        { ID_ENTIDAD_FISCAL: 1, ESTADO_VALIDACION: 'VALIDADA' },
      ])
      .mockResolvedValueOnce([
        { ID_RELACION: 10, ESTADO_VALIDACION: 'VALIDADA' },
      ]);
  });

  it('resolves only approved mapping after fiscal entity and branch checks', async () => {
    query.mockResolvedValueOnce([validMap]);

    await expect(service.resolve(input)).resolves.toEqual({
      mapId: 1,
      fiscalEntityId: 1,
      branch: 'DF01',
      eventType: input.eventType,
      entryRole: 'PRINCIPAL',
      sourceSign: 'POSITIVO',
      odooEnvironment: 'ONLINE',
      odooCompanyId: 1,
      odooAccountCode: '101.01.01',
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('blocks pending fiscal entity before checking map', async () => {
    query.mockReset().mockResolvedValueOnce([
      { ID_ENTIDAD_FISCAL: 1, ESTADO_VALIDACION: 'PENDIENTE' },
    ]);

    await expect(service.resolve(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('blocks pending branch link', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce([
        { ID_ENTIDAD_FISCAL: 1, ESTADO_VALIDACION: 'VALIDADA' },
      ])
      .mockResolvedValueOnce([
        { ID_RELACION: 10, ESTADO_VALIDACION: 'PENDIENTE' },
      ]);

    await expect(service.resolve(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('blocks a map that has not been approved', async () => {
    query.mockResolvedValueOnce([
      { ...validMap, ESTADO_MAPEO: 'PENDIENTE' },
    ]);

    await expect(service.resolve(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('blocks ambiguous maps at the same specificity', async () => {
    query.mockResolvedValueOnce([
      { ...validMap, SUC: 'DF01' },
      { ...validMap, ID_MAPEO: 2, SUC: 'DF01' },
    ]);

    await expect(service.resolve(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns not found when no account/event map exists', async () => {
    query.mockResolvedValueOnce([]);

    await expect(service.resolve(input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects zero amount and invalid business date', async () => {
    await expect(
      service.resolve({ ...input, sourceAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolve({ ...input, eventDate: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
