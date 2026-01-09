import { Test, TestingModule } from '@nestjs/testing';
import { DatContCtrlService } from './datcontctrl.service';

describe('DatContCtrlService', () => {
  let service: DatContCtrlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatContCtrlService],
    }).compile();

    service = module.get<DatContCtrlService>(DatContCtrlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
