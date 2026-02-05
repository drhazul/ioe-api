import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefDetalleController } from './refdetalle.controller';
import { RefDetalleService } from './refdetalle.service';
import { RefDetalleEntity } from './refdetalle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RefDetalleEntity])],
  controllers: [RefDetalleController],
  providers: [RefDetalleService],
})
export class RefDetalleModule {}
