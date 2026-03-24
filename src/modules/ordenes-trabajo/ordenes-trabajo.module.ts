import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdenesTrabajoController } from './ordenes-trabajo.controller';
import { OrdenesTrabajoService } from './ordenes-trabajo.service';

@Module({
  imports: [AuditModule],
  controllers: [OrdenesTrabajoController],
  providers: [OrdenesTrabajoService],
})
export class OrdenesTrabajoModule {}
