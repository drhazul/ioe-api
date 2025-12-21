import { Test, TestingModule } from '@nestjs/testing';
import { DatSucController } from './dat-suc.controller';

describe('DatSucController', () => {
  let controller: DatSucController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatSucController],
    }).compile();

    controller = module.get<DatSucController>(DatSucController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
