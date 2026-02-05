import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatRetCtrSvrController } from './datretctrsvr.controller';
import { DatRetCtrSvrService } from './datretctrsvr.service';
import { DatRetCtrSvrEntity } from './datretctrsvr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatRetCtrSvrEntity])],
  controllers: [DatRetCtrSvrController],
  providers: [DatRetCtrSvrService],
})
export class DatRetCtrSvrModule {}
