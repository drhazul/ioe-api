import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateEntidadFiscalSucursalDto } from './dto/create-entidad-fiscal-sucursal.dto';
import { UpdateEntidadFiscalDto } from './dto/update-entidad-fiscal.dto';
import { EntidadesFiscalesService } from './entidades-fiscales.service';

describe('EntidadesFiscalesService', () => {
  const admin = { sub: 1, username: 'ADMIN', roleId: 1 } as JwtPayload;
  let dbQuery: jest.Mock;
  let txQuery: jest.Mock;
  let service: EntidadesFiscalesService;

  beforeEach(() => {
    dbQuery = jest.fn().mockResolvedValue([]);
    txQuery = jest.fn().mockResolvedValue([]);
    const manager = { query: txQuery } as unknown as EntityManager;
    const db = {
      query: dbQuery,
      transaction: (work: (manager: EntityManager) => unknown) => work(manager),
    } as unknown as DataSource;
    service = new EntidadesFiscalesService(db);
  });

  it('niega consulta y cambios a cualquier rol distinto de ADMIN ROL 1', async () => {
    const operator = { ...admin, roleId: 4 };
    await expect(service.list(operator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.create(
        { rfc: 'QWEX900101AAA', tipoPersona: 'FISICA' },
        operator,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dbQuery).not.toHaveBeenCalled();
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('no permite validar entidad sin nombre legal, regimen, CP y evidencia', async () => {
    txQuery.mockResolvedValueOnce([
      {
        idEntidadFiscal: 3,
        rfc: 'QWEX900101AAA',
        tipoPersona: 'FISICA',
        nombreLegal: null,
        regimenFiscal: null,
        cpFiscal: null,
        domicilioFiscal: null,
        estadoValidacion: 'PENDIENTE',
        referenciaValidacion: null,
      },
    ]);
    const dto: UpdateEntidadFiscalDto = { estadoValidacion: 'VALIDADA' };

    await expect(service.update(3, dto, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(txQuery).toHaveBeenCalledTimes(1);
  });

  it('no acepta dos vinculos pendientes para misma entidad y sucursal', async () => {
    txQuery
      .mockResolvedValueOnce([
        { idEntidadFiscal: 3, estadoValidacion: 'PENDIENTE' },
      ])
      .mockResolvedValueOnce([{ SUC: 'DF01' }])
      .mockResolvedValueOnce([{ idRelacion: 9 }]);
    const dto: CreateEntidadFiscalSucursalDto = { suc: 'df01' };

    await expect(service.linkSucursal(3, dto, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(txQuery).toHaveBeenCalledTimes(3);
  });

  it('normaliza sucursal y crea relacion pendiente sin marcarla validada', async () => {
    txQuery
      .mockResolvedValueOnce([
        { idEntidadFiscal: 3, estadoValidacion: 'PENDIENTE' },
      ])
      .mockResolvedValueOnce([{ SUC: 'DF01' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ idRelacion: 22 }])
      .mockResolvedValueOnce([]);

    const result = await service.linkSucursal(3, { suc: ' df01 ' }, admin);

    expect(result).toEqual({
      idRelacion: 22,
      suc: 'DF01',
      estadoValidacion: 'PENDIENTE',
    });
    expect(txQuery.mock.calls[3][1]).toEqual([3, 'DF01', null, '1:ADMIN']);
    expect(txQuery.mock.calls[4][1][3]).toBe(
      JSON.stringify({ fields: ['suc'] }),
    );
  });
});
