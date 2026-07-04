import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { DatmodulosService } from './datmodulos.service';

describe('DatmodulosService', () => {
  let service: DatmodulosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatmodulosService,
        {
          provide: getRepositoryToken(ModFrontEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            exist: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            merge: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DatmodulosService>(DatmodulosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
