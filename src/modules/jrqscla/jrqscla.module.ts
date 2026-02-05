import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JrqSclaController } from './jrqscla.controller';
import { JrqSclaService } from './jrqscla.service';
import { JrqSclaEntity } from './jrqscla.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JrqSclaEntity])],
  controllers: [JrqSclaController],
  providers: [JrqSclaService],
})
export class JrqSclaModule {}
