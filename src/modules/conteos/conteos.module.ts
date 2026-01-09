import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConteosService } from './conteos.service';
import { ConteosController } from './conteos.controller';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatDetSvrEntity, DatContCtrlEntity])],
  controllers: [ConteosController],
  providers: [ConteosService],
})
export class ConteosModule {}
