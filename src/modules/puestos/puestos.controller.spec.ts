import { Test, TestingModule } from '@nestjs/testing';
import { PuestosController } from './puestos.controller';

describe('PuestosController', () => {
  let controller: PuestosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PuestosController],
    }).compile();

    controller = module.get<PuestosController>(PuestosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
