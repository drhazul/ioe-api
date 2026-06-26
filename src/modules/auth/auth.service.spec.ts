import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { UsuarioTokenEntity } from './usuario-token.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let auditService: AuditService;

  beforeEach(async () => {
    const usersMock = {
      findByUsername: jest.fn(),
      findAuthById: jest.fn(),
      updatePassword: jest.fn(),
    };
    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersMock,
        },
        {
          provide: AuditService,
          useValue: auditMock,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UsuarioTokenEntity),
          useValue: {
            save: jest.fn(),
            create: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn(),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    auditService = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rechaza usuario inactivo y registra auditoria de login', async () => {
    (usersService.findByUsername as jest.Mock).mockResolvedValue({
      IDUSUARIO: 5074,
      USERNAME: '5074',
      ESTATUS: 'INACTIVO',
      SUC: 'DF01',
    });

    await expect(
      service.login('5074', 'secret', {
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        IDUSUARIO: 5074,
        ACTION: 'LOGIN_DENIED_INACTIVO',
        MODULO: 'auth',
        ENTIDAD: 'USUARIO',
        ENTIDAD_ID: '5074',
        SUC: 'DF01',
        IP: '127.0.0.1',
      }),
    );
  });
});
