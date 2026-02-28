import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RelojChecadorController } from './reloj-checador.controller';
import { RelojChecadorService } from './reloj-checador.service';

@Module({
  imports: [AuditModule],
  controllers: [RelojChecadorController],
  providers: [RelojChecadorService],
})
export class RelojChecadorModule {}
