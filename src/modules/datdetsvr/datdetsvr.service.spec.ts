import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<DatDetSvrService>(DatDetSvrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
