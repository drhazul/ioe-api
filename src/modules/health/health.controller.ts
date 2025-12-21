import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  ping() {
    return { ok: true };
  }

  @Get('db')
  db() {
    return this.healthService.dbCheck();
  }
}
