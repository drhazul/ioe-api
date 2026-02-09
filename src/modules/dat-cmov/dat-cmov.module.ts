import { Module } from '@nestjs/common';
import { DatCmovController } from './dat-cmov.controller';
import { DatCmovService } from './dat-cmov.service';

@Module({
  controllers: [DatCmovController],
  providers: [DatCmovService],
})
export class DatCmovModule {}
