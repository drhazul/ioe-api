import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CajaGeneralController } from './caja-general.controller';
import { CajaGeneralService } from './caja-general.service';

@Module({
  imports: [AuditModule],
  controllers: [CajaGeneralController],
  providers: [CajaGeneralService],
})
export class CajaGeneralModule {}
