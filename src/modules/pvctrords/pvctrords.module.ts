import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PvCtrOrdsController } from './pvctrords.controller';
import { PvCtrOrdsService } from './pvctrords.service';
import { PvCtrOrdsEntity } from './pvctrords.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PvCtrOrdsEntity])],
  controllers: [PvCtrOrdsController],
  providers: [PvCtrOrdsService],
})
export class PvCtrOrdsModule {}
