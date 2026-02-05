import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatCatRegController } from './datcatreg.controller';
import { DatCatRegService } from './datcatreg.service';
import { DatCatRegEntity } from './datcatreg.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatCatRegEntity])],
  controllers: [DatCatRegController],
  providers: [DatCatRegService],
})
export class DatCatRegModule {}
