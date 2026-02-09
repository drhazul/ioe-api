import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatAlmacenController } from './dat-almacen.controller';
import { DatAlmacenEntity } from './dat-almacen.entity';
import { DatAlmacenService } from './dat-almacen.service';

@Module({
  imports: [TypeOrmModule.forFeature([DatAlmacenEntity])],
  controllers: [DatAlmacenController],
  providers: [DatAlmacenService],
})
export class DatAlmacenModule {}
