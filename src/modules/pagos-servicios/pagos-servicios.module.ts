import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PagosServiciosController } from './pagos-servicios.controller';
import { PagosServiciosService } from './pagos-servicios.service';

@Module({
  imports: [AuditModule],
  controllers: [PagosServiciosController],
  providers: [PagosServiciosService],
})
export class PagosServiciosModule {}
