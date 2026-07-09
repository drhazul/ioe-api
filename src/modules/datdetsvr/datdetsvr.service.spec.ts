import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { DatDetSvrEntity } from './datdetsvr.entity';
import { DatDetSvrService } from './datdetsvr.service';

describe('DatDetSvrService', () => {
  let service: DatDetSvrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatDetSvrService,
        {
          provide: getRepositoryToken(DatDetSvrEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            merge: jest.fn(),
            delete: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DatContCtrlEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DatDetSvrService>(DatDetSvrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
