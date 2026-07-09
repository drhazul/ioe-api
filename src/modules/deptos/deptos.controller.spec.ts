import { Test, TestingModule } from '@nestjs/testing';
import { DeptosController } from './deptos.controller';
import { DeptosService } from './deptos.service';

describe('DeptosController', () => {
  let controller: DeptosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeptosController],
      providers: [
        {
          provide: DeptosService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DeptosController>(DeptosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
