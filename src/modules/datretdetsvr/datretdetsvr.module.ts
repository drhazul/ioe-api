import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatRetDetSvrController } from './datretdetsvr.controller';
import { DatRetDetSvrService } from './datretdetsvr.service';
import { DatRetDetSvrEntity } from './datretdetsvr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatRetDetSvrEntity])],
  controllers: [DatRetDetSvrController],
  providers: [DatRetDetSvrService],
})
export class DatRetDetSvrModule {}
