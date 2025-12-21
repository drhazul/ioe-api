import { Test, TestingModule } from '@nestjs/testing';
import { DeptosService } from './deptos.service';

describe('DeptosService', () => {
  let service: DeptosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeptosService],
    }).compile();

    service = module.get<DeptosService>(DeptosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
