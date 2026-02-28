import { Module } from '@nestjs/common';
import { DatFormController } from './dat-form.controller';
import { DatFormService } from './dat-form.service';

@Module({
  controllers: [DatFormController],
  providers: [DatFormService],
})
export class DatFormModule {}

