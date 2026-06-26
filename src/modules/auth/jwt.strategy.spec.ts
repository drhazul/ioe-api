import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';

describe('JwtStrategy', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('test-secret'),
  } as unknown as ConfigService;

  const usersService = {
    findAuthById: jest.fn(),
  } as unknown as UsersService;
  const auditService = {
    log: jest.fn(),
  } as unknown as AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza JWT cuando usuario ya esta inactivo', async () => {
    (usersService.findAuthById as jest.Mock).mockResolvedValue({
      IDUSUARIO: 5074,
      ESTATUS: 'INACTIVO',
      USERNAME: '5074',
      SUC: 'DF01',
    });

    const strategy = new JwtStrategy(config, usersService, auditService);

    await expect(
      strategy.validate(
        {
          headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'jest',
          },
          originalUrl: '/users',
        } as unknown as Request,
        {
          idUsuario: 5074,
          sub: 5074,
          username: '5074',
          roleId: 2,
          nivel: 1,
          suc: 'DF01',
          mustChangePassword: false,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        IDUSUARIO: 5074,
        ACTION: 'JWT_DENIED_INACTIVO',
        MODULO: 'auth',
        ENTIDAD: 'USUARIO',
        ENTIDAD_ID: '5074',
        SUC: 'DF01',
        IP: '127.0.0.1',
      }),
    );
  });
});
