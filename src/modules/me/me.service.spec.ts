import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MeService } from './me.service';
import { GrupmodFrontModEntity } from './entities/grupmod-front-mod.entity';
import { RolGrupmodFrontEntity } from './entities/rol-grupmod-front.entity';
import { RolGrupModuloPermEntity } from './entities/rol-grup-modulo-perm.entity';
import { UsuarioEntity } from '../users/usuario.entity';
import { ModFrontEntity } from './entities/mod-front.entity';
import { UsrGrupmodFrontEntity } from './entities/usr-grupmod-front.entity';

const repoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  })),
});

describe('MeService', () => {
  let service: MeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        {
          provide: getRepositoryToken(GrupmodFrontModEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(RolGrupmodFrontEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(RolGrupModuloPermEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(UsuarioEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(ModFrontEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(UsrGrupmodFrontEntity),
          useValue: repoMock(),
        },
      ],
    }).compile();

    service = module.get<MeService>(MeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
