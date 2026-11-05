import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PvCtrFolAsvrController } from './pvctrfolasvr.controller';
import { PvCtrFolAsvrService } from './pvctrfolasvr.service';
import { PvCtrFolAsvrEntity } from './pvctrfolasvr.entity';
import { PvCtrFolFormEntity } from '../pvctrfolform/pvctrfolform.entity';
import { PvTicketLogEntity } from '../pvticketlog/pvticketlog.entity';
import { DatSucEntity } from '../dat-suc/dat-suc.entity';
import { FactClientShpEntity } from '../factclientshp/factclientshp.entity';
import { PvCotizacionesCierreController } from './pv-cotizaciones-cierre.controller';
import { PvCotizacionesCierreService } from './pv-cotizaciones-cierre.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PvCtrFolAsvrEntity,
      PvCtrFolFormEntity,
      PvTicketLogEntity,
      DatSucEntity,
      FactClientShpEntity,
    ]),
  ],
  controllers: [PvCtrFolAsvrController, PvCotizacionesCierreController],
  providers: [PvCtrFolAsvrService, PvCotizacionesCierreService],
})
export class PvCtrFolAsvrModule {}
