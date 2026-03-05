import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatEstOrdController } from './datestord.controller';
import { DatEstOrdService } from './datestord.service';
import { DatEstOrdEntity } from './datestord.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatEstOrdEntity])],
  controllers: [DatEstOrdController],
  providers: [DatEstOrdService],
})
export class DatEstOrdModule {}
