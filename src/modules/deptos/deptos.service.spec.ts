import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DepartamentoEntity } from './departamento.entity';
import { DeptosService } from './deptos.service';

describe('DeptosService', () => {
  let service: DeptosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeptosService,
        {
          provide: getRepositoryToken(DepartamentoEntity),
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
      ],
    }).compile();

    service = module.get<DeptosService>(DeptosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
