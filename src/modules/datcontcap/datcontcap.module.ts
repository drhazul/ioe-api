import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatContCapController } from './datcontcap.controller';
import { DatContCapService } from './datcontcap.service';
import { DatContCapEntity } from './datcontcap.entity';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { DatArtEntity } from '../datart/datart.entity';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatContCapEntity, DatContCtrlEntity, DatArtEntity, DatDetSvrEntity])],
  controllers: [DatContCapController],
  providers: [DatContCapService],
})
export class DatContCapModule {}
