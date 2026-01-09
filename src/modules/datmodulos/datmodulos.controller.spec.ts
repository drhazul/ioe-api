import { Test, TestingModule } from '@nestjs/testing';
import { DatmodulosController } from './datmodulos.controller';

describe('DatmodulosController', () => {
  let controller: DatmodulosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatmodulosController],
    }).compile();

    controller = module.get<DatmodulosController>(DatmodulosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
