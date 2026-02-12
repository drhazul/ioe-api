import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConteosService } from './conteos.service';
import { ConteosController } from './conteos.controller';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DatDetSvrEntity,
      DatContCtrlEntity,
      UsrModSucEntity,
    ]),
  ],
  controllers: [ConteosController],
  providers: [ConteosService],
})
export class ConteosModule {}
