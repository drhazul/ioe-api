import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatmodulosController } from './datmodulos.controller';
import { DatmodulosService } from './datmodulos.service';
import { ModFrontEntity } from '../me/entities/mod-front.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ModFrontEntity])],
  controllers: [DatmodulosController],
  providers: [DatmodulosService],
})
export class DatmodulosModule {}
