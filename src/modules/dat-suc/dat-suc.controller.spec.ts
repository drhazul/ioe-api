import { Test, TestingModule } from '@nestjs/testing';
import { DatSucController } from './dat-suc.controller';
import { DatSucService } from './dat-suc.service';

describe('DatSucController', () => {
  let controller: DatSucController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatSucController],
      providers: [
        {
          provide: DatSucService,
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

    controller = module.get<DatSucController>(DatSucController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
