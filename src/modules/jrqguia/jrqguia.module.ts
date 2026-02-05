import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JrqGuiaController } from './jrqguia.controller';
import { JrqGuiaService } from './jrqguia.service';
import { JrqGuiaEntity } from './jrqguia.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JrqGuiaEntity])],
  controllers: [JrqGuiaController],
  providers: [JrqGuiaService],
})
export class JrqGuiaModule {}
