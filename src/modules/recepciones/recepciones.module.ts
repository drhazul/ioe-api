import { Module } from '@nestjs/common';
import { RecepcionesController } from './recepciones.controller';
import { RecepcionesService } from './recepciones.service';

@Module({
  controllers: [RecepcionesController],
  providers: [RecepcionesService],
})
export class RecepcionesModule {}
