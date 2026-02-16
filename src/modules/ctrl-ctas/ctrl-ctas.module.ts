import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CtrlCtasController } from './ctrl-ctas.controller';
import { CtrlCtasService } from './ctrl-ctas.service';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UsrModSucEntity])],
  controllers: [CtrlCtasController],
  providers: [CtrlCtasService],
})
export class CtrlCtasModule {}
