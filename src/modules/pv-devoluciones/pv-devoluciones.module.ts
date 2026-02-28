import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PvDevolucionesController } from './pv-devoluciones.controller';
import { PvDevolucionesService } from './pv-devoluciones.service';

@Module({
  imports: [AuditModule],
  controllers: [PvDevolucionesController],
  providers: [PvDevolucionesService],
})
export class PvDevolucionesModule {}

