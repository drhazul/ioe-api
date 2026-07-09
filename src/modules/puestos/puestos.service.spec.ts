import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeptosService } from '../deptos/deptos.service';
import { RolEntity } from '../roles/rol.entity';
import { PuestosService } from './puestos.service';

describe('PuestosService', () => {
  let service: PuestosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuestosService,
        {
          provide: getRepositoryToken(RolEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            exist: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            merge: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: DeptosService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PuestosService>(PuestosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
