import { Test, TestingModule } from '@nestjs/testing';
import { DatmodulosService } from './datmodulos.service';

describe('DatmodulosService', () => {
  let service: DatmodulosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatmodulosService],
    }).compile();

    service = module.get<DatmodulosService>(DatmodulosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
