import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RetirosCatalogosController } from './retiros-catalogos.controller';
import { RetirosController } from './retiros.controller';
import { RetirosService } from './retiros.service';

@Module({
  imports: [AuditModule],
  controllers: [RetirosController, RetirosCatalogosController],
  providers: [RetirosService],
})
export class RetirosModule {}

