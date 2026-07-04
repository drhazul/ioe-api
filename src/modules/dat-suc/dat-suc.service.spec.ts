import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DatSucEntity } from './dat-suc.entity';
import { DatSucService } from './dat-suc.service';

describe('DatSucService', () => {
  let service: DatSucService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatSucService,
        {
          provide: getRepositoryToken(DatSucEntity),
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

    service = module.get<DatSucService>(DatSucService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
