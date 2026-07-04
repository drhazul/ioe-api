import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GrupmodFrontModEntity } from '../me/entities/grupmod-front-mod.entity';
import { GrupmodFrontEntity } from '../me/entities/grupmod-front.entity';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { RolGrupModuloPermEntity } from '../me/entities/rol-grup-modulo-perm.entity';
import { RolGrupmodFrontEntity } from '../me/entities/rol-grupmod-front.entity';
import { GrupModuloEntity } from './entities/grup-modulo.entity';
import { GrupmodModuloEntity } from './entities/grupmod-modulo.entity';
import { ModuloEntity } from './entities/modulo.entity';
import { AdminService } from './admin.service';

const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(ModuloEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(GrupmodModuloEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(GrupmodFrontEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(ModFrontEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(GrupmodFrontModEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(RolGrupmodFrontEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(RolGrupModuloPermEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(GrupModuloEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
