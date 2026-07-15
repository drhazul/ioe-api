import { Module } from '@nestjs/common';
import { SugeridosController } from './sugeridos.controller';
import { SugeridosService } from './sugeridos.service';

@Module({
  controllers: [SugeridosController],
  providers: [SugeridosService],
})
export class SugeridosModule {}
