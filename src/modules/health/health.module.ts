import { Module } from '@nestjs/common';
import { AsistenciaModule } from '../asistencia/asistencia.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [AsistenciaModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
