import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FaltantesSobrantesController } from './faltantes-sobrantes.controller';
import { FaltantesSobrantesService } from './faltantes-sobrantes.service';

@Module({
  imports: [AuditModule],
  controllers: [FaltantesSobrantesController],
  providers: [FaltantesSobrantesService],
})
export class FaltantesSobrantesModule {}
