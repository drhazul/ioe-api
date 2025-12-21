import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatSucController } from './dat-suc.controller';
import { DatSucService } from './dat-suc.service';
import { DatSucEntity } from './dat-suc.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DatSucEntity])],
  controllers: [DatSucController],
  providers: [DatSucService],
})
export class DatSucModule {}
