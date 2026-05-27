import { Module } from '@nestjs/common';
import { OrdFlujoVisController } from './ord-flujo-vis.controller';
import { OrdFlujoVisService } from './ord-flujo-vis.service';

@Module({
  controllers: [OrdFlujoVisController],
  providers: [OrdFlujoVisService],
})
export class OrdFlujoVisModule {}
