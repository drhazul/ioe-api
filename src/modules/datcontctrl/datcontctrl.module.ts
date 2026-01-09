import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatContCtrlController } from './datcontctrl.controller';
import { DatContCtrlService } from './datcontctrl.service';
import { DatContCtrlEntity } from './datcontctrl.entity';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatContCtrlEntity, DatDetSvrEntity])],
  controllers: [DatContCtrlController],
  providers: [DatContCtrlService],
})
export class DatContCtrlModule {}
