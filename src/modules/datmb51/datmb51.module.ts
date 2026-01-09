import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Datmb51Controller } from './datmb51.controller';
import { Datmb51Service } from './datmb51.service';
import { Datmb51Entity } from './datmb51.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Datmb51Entity])],
  controllers: [Datmb51Controller],
  providers: [Datmb51Service],
})
export class Datmb51Module {}
