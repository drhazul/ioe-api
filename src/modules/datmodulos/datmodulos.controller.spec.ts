import { Test, TestingModule } from '@nestjs/testing';
import { DatmodulosController } from './datmodulos.controller';
import { DatmodulosService } from './datmodulos.service';

describe('DatmodulosController', () => {
  let controller: DatmodulosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatmodulosController],
      providers: [
        {
          provide: DatmodulosService,
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

    controller = module.get<DatmodulosController>(DatmodulosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
