import { Module } from '@nestjs/common';
import { AltaMasivaController } from './alta-masiva.controller';
import { AltaMasivaService } from './alta-masiva.service';

@Module({
  controllers: [AltaMasivaController],
  providers: [AltaMasivaService],
})
export class AltaMasivaModule {}
