import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatRetDetEfecSvrController } from './datretdetefecsvr.controller';
import { DatRetDetEfecSvrService } from './datretdetefecsvr.service';
import { DatRetDetEfecSvrEntity } from './datretdetefecsvr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatRetDetEfecSvrEntity])],
  controllers: [DatRetDetEfecSvrController],
  providers: [DatRetDetEfecSvrService],
})
export class DatRetDetEfecSvrModule {}
