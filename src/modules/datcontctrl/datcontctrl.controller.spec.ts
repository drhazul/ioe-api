import { Test, TestingModule } from '@nestjs/testing';
import { DatContCtrlController } from './datcontctrl.controller';
import { DatContCtrlService } from './datcontctrl.service';

describe('DatContCtrlController', () => {
  let controller: DatContCtrlController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatContCtrlController],
      providers: [
        {
          provide: DatContCtrlService,
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

    controller = module.get<DatContCtrlController>(DatContCtrlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
