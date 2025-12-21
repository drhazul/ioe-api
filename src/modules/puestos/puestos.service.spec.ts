import { Test, TestingModule } from '@nestjs/testing';
import { PuestosService } from './puestos.service';

describe('PuestosService', () => {
  let service: PuestosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PuestosService],
    }).compile();

    service = module.get<PuestosService>(PuestosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
