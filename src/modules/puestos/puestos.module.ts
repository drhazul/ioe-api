import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuestosController } from './puestos.controller';
import { PuestosService } from './puestos.service';
import { PuestoEntity } from './puesto.entity';
import { DeptosModule } from '../deptos/deptos.module';

@Module({
  imports: [TypeOrmModule.forFeature([PuestoEntity]), DeptosModule],
  controllers: [PuestosController],
  providers: [PuestosService],
  exports: [TypeOrmModule, PuestosService],
})
export class PuestosModule {}
