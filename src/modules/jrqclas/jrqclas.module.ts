import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JrqClasController } from './jrqclas.controller';
import { JrqClasService } from './jrqclas.service';
import { JrqClasEntity } from './jrqclas.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JrqClasEntity])],
  controllers: [JrqClasController],
  providers: [JrqClasService],
})
export class JrqClasModule {}
