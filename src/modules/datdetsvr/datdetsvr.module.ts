import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatDetSvrController } from './datdetsvr.controller';
import { DatDetSvrService } from './datdetsvr.service';
import { DatDetSvrEntity } from './datdetsvr.entity';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatDetSvrEntity, DatContCtrlEntity])],
  controllers: [DatDetSvrController],
  providers: [DatDetSvrService],
})
export class DatDetSvrModule {}
