import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';
import { CajaGeneralController } from './caja-general.controller';
import { CajaGeneralService } from './caja-general.service';

@Module({
  imports: [AuditModule, TypeOrmModule.forFeature([UsrModSucEntity])],
  controllers: [CajaGeneralController],
  providers: [CajaGeneralService],
})
export class CajaGeneralModule {}
