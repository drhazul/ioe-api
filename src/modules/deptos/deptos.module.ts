import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeptosController } from './deptos.controller';
import { DeptosService } from './deptos.service';
import { DepartamentoEntity } from './departamento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DepartamentoEntity])],
  controllers: [DeptosController],
  providers: [DeptosService],
  exports: [TypeOrmModule, DeptosService],
})
export class DeptosModule {}
