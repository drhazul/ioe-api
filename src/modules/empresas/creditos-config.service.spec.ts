import { ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreditosConfigService } from './creditos-config.service';
import {
  CreditosConfigDto,
  CreditosSucursalConfigDto,
} from './dto/creditos-config.dto';

describe('Configuración persistente de créditos', () => {
  const admin = { sub: 7, username: 'QA', roleId: 1 } as JwtPayload;
  let query: jest.Mock;
  let service: CreditosConfigService;
  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    service = new CreditosConfigService({ query } as unknown as DataSource);
  });

  it('niega lectura y escritura a operador antes de consultar SQL', async () => {
    const operator = { ...admin, roleId: 4 };
    await expect(service.get(1, operator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.set(1, {} as CreditosConfigDto, operator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.setSucursal(1, 'DF01', {} as CreditosSucursalConfigDto, operator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('envía versión binaria y actor autenticado, preservando null para heredar', async () => {
    await service.setSucursal(
      1,
      'DF01',
      { permitir: null, version: '0000000000000102' },
      admin,
    );
    expect(query.mock.calls[0][1]).toEqual([
      1,
      'DF01',
      null,
      Buffer.from('0000000000000102', 'hex'),
      '7:QA',
    ]);
  });

  it.each([53403, 53405, 53406])(
    'conflicto SQL %s produce HTTP 409',
    async (number) => {
      query.mockRejectedValue({ driverError: { number } });
      await expect(
        service.set(
          1,
          { modo: 'EMPRESA', permitir: false, version: '0000000000000102' },
          admin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('no inicializa silenciosamente empresa sin regla', async () => {
    query.mockResolvedValue([{ reglas: '[]', sucursales: '[]' }]);
    await expect(service.get(2, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('DTO acepta false/null y rechaza omisión, cadenas y versiones incompletas', async () => {
    for (const permitir of [false, true, null]) {
      expect(
        await validate(
          plainToInstance(CreditosSucursalConfigDto, {
            permitir,
            version: '0000000000000102',
          }),
        ),
      ).toHaveLength(0);
    }
    for (const payload of [
      { version: '0000000000000102' },
      { permitir: 'false', version: '0000000000000102' },
      { permitir: false, version: '01' },
    ]) {
      expect(
        (await validate(plainToInstance(CreditosSucursalConfigDto, payload)))
          .length,
      ).toBeGreaterThan(0);
    }
    expect(
      (
        await validate(
          plainToInstance(CreditosConfigDto, {
            permitir: null,
            modo: 'EMPRESA',
            version: '0000000000000102',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
