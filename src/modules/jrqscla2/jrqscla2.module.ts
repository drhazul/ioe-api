import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JrqScla2Controller } from './jrqscla2.controller';
import { JrqScla2Service } from './jrqscla2.service';
import { JrqScla2Entity } from './jrqscla2.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JrqScla2Entity])],
  controllers: [JrqScla2Controller],
  providers: [JrqScla2Service],
})
export class JrqScla2Module {}
