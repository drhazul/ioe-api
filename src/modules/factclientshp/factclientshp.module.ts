import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FactClientShpController } from './factclientshp.controller';
import { FactClientShpService } from './factclientshp.service';
import { FactClientShpEntity } from './factclientshp.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FactClientShpEntity])],
  controllers: [FactClientShpController],
  providers: [FactClientShpService],
})
export class FactClientShpModule {}
