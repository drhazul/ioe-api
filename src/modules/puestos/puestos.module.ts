import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuestosController } from './puestos.controller';
import { PuestosService } from './puestos.service';
import { DeptosModule } from '../deptos/deptos.module';
import { RolEntity } from '../roles/rol.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RolEntity]), DeptosModule],
  controllers: [PuestosController],
  providers: [PuestosService],
  exports: [TypeOrmModule, PuestosService],
})
export class PuestosModule {}
