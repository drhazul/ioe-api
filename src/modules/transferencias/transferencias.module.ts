import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TranCtrDocpreEntity } from './entities/tran-ctr-docpre.entity';
import { TranDetArtEntity } from './entities/tran-det-art.entity';
import { TransferenciasController } from './transferencias.controller';
import { TransferenciasService } from './transferencias.service';

@Module({
  imports: [TypeOrmModule.forFeature([TranCtrDocpreEntity, TranDetArtEntity])],
  controllers: [TransferenciasController],
  providers: [TransferenciasService],
  exports: [TransferenciasService],
})
export class TransferenciasModule {}
