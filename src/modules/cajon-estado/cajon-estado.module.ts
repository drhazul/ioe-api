import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CajonEstadoController } from './cajon-estado.controller';
import { CajonEstadoService } from './cajon-estado.service';
import { CajonEstadoSessionStore } from './cajon-estado-session.store';
import { CajonEstadoSupervisorGuard } from './guards/cajon-estado-supervisor.guard';

@Module({
  imports: [AuditModule],
  controllers: [CajonEstadoController],
  providers: [
    CajonEstadoService,
    CajonEstadoSessionStore,
    CajonEstadoSupervisorGuard,
  ],
})
export class CajonEstadoModule {}
