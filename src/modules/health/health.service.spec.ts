import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ExportService } from '../asistencia/export.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: ExportService,
          useValue: {
            healthCheck: jest.fn().mockReturnValue({ ok: true }),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
