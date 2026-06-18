import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SucColabAccesoController } from './suc-colab-acceso.controller';
import { SucColabAccesoEntity } from './suc-colab-acceso.entity';
import { SucColabAccesoService } from './suc-colab-acceso.service';

@Module({
  imports: [TypeOrmModule.forFeature([SucColabAccesoEntity])],
  controllers: [SucColabAccesoController],
  providers: [SucColabAccesoService],
})
export class SucColabAccesoModule {}
