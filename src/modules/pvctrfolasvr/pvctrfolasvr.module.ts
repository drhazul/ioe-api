import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PvCtrFolAsvrController } from './pvctrfolasvr.controller';
import { PvCtrFolAsvrService } from './pvctrfolasvr.service';
import { PvCtrFolAsvrEntity } from './pvctrfolasvr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PvCtrFolAsvrEntity])],
  controllers: [PvCtrFolAsvrController],
  providers: [PvCtrFolAsvrService],
})
export class PvCtrFolAsvrModule {}
