import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatArtController } from './datart.controller';
import { DatArtService } from './datart.service';
import { DatArtEntity } from './datart.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatArtEntity])],
  controllers: [DatArtController],
  providers: [DatArtService],
})
export class DatArtModule {}
