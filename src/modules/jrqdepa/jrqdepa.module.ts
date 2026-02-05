import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JrqDepaController } from './jrqdepa.controller';
import { JrqDepaService } from './jrqdepa.service';
import { JrqDepaEntity } from './jrqdepa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JrqDepaEntity])],
  controllers: [JrqDepaController],
  providers: [JrqDepaService],
})
export class JrqDepaModule {}
