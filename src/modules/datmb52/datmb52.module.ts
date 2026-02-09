import { Module } from '@nestjs/common';
import { DatMb52ResumenController } from './dat-mb52.controller';
import { Datmb52Service } from './datmb52.service';

@Module({
  controllers: [DatMb52ResumenController],
  providers: [Datmb52Service],
})
export class Datmb52Module {}
