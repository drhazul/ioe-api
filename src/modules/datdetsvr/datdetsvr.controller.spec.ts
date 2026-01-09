import { Test, TestingModule } from '@nestjs/testing';
import { DatDetSvrController } from './datdetsvr.controller';
import { DatDetSvrService } from './datdetsvr.service';

describe('DatDetSvrController', () => {
  let controller: DatDetSvrController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatDetSvrController],
      providers: [
        {
          provide: DatDetSvrService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DatDetSvrController>(DatDetSvrController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
