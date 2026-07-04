import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';
import { DatContCtrlEntity } from './datcontctrl.entity';
import { DatContCtrlService } from './datcontctrl.service';

describe('DatContCtrlService', () => {
  let service: DatContCtrlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatContCtrlService,
        {
          provide: getRepositoryToken(DatContCtrlEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            exist: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            merge: jest.fn(),
            delete: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DatDetSvrEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DatContCtrlService>(DatContCtrlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
