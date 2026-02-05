import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JrqSubdController } from './jrqsubd.controller';
import { JrqSubdService } from './jrqsubd.service';
import { JrqSubdEntity } from './jrqsubd.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JrqSubdEntity])],
  controllers: [JrqSubdController],
  providers: [JrqSubdService],
})
export class JrqSubdModule {}
