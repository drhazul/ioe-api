import { Test, TestingModule } from '@nestjs/testing';
import { DeptosController } from './deptos.controller';

describe('DeptosController', () => {
  let controller: DeptosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeptosController],
    }).compile();

    controller = module.get<DeptosController>(DeptosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
