import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { FactClientShpService } from './factclientshp.service';
import { UpdateFactClientShpDto } from './dto/update-factclientshp.dto';

describe('L_CRED', () => {
  const user = { sub: 7, roleId: 2, suc: 'DF01' };
  const config = { get: () => undefined };
  const me = { getRoleDatmodulos: jest.fn() };
  const service = new FactClientShpService({} as any, {} as any, {} as any, config as any, me as any);

  it('rechaza edición sin módulo GES_CRED', async () => {
    me.getRoleDatmodulos.mockResolvedValue({ modulos: [] });
    await expect(service.update(1, { L_CRED: 50 }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('valida importes negativos y precisión', async () => {
    for (const value of [-1, 1.234]) {
      const dto = Object.assign(new UpdateFactClientShpDto(), { L_CRED: value });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });
});
