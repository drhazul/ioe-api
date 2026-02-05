import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatCatUsoController } from './datcatuso.controller';
import { DatCatUsoService } from './datcatuso.service';
import { DatCatUsoEntity } from './datcatuso.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatCatUsoEntity])],
  controllers: [DatCatUsoController],
  providers: [DatCatUsoService],
})
export class DatCatUsoModule {}
