import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FormasPagoCambiosController } from './formas-pago-cambios.controller';
import { FormasPagoCambiosService } from './formas-pago-cambios.service';

@Module({
  imports: [AuditModule],
  controllers: [FormasPagoCambiosController],
  providers: [FormasPagoCambiosService],
})
export class FormasPagoCambiosModule {}

