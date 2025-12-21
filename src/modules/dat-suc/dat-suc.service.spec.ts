import { Test, TestingModule } from '@nestjs/testing';
import { DatSucService } from './dat-suc.service';

describe('DatSucService', () => {
  let service: DatSucService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatSucService],
    }).compile();

    service = module.get<DatSucService>(DatSucService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
