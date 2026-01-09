import { Test, TestingModule } from '@nestjs/testing';
import { DatContCtrlController } from './datcontctrl.controller';

describe('DatContCtrlController', () => {
  let controller: DatContCtrlController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatContCtrlController],
    }).compile();

    controller = module.get<DatContCtrlController>(DatContCtrlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
