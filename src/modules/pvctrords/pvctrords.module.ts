import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PvCtrOrdsController } from './pvctrords.controller';
import { PvCtrOrdsRelationAuthStore } from './pvctrords-relation-auth.store';
import { PvCtrOrdsService } from './pvctrords.service';
import { PvCtrOrdsEntity } from './pvctrords.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PvCtrOrdsEntity]), AuditModule],
  controllers: [PvCtrOrdsController],
  providers: [PvCtrOrdsService, PvCtrOrdsRelationAuthStore],
})
export class PvCtrOrdsModule {}
