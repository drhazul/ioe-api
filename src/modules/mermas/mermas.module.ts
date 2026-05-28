import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MermasController } from './mermas.controller';
import { MermasService } from './mermas.service';
import { DocCtrlMermaEntity } from './entities/doc-ctrl-merma.entity';
import { DetArtMermaEntity } from './entities/det-art-merma.entity';
import { EstatusMermaEntity } from './entities/estatus-merma.entity';
import { MotMermaEntity } from './entities/mot-merma.entity';
import { ClasMermaEntity } from './entities/clas-merma.entity';
import { MermaEvidenciaEntity } from './entities/merma-evidencia.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocCtrlMermaEntity,
      DetArtMermaEntity,
      EstatusMermaEntity,
      MotMermaEntity,
      ClasMermaEntity,
      MermaEvidenciaEntity,
    ]),
  ],
  controllers: [MermasController],
  providers: [MermasService],
  exports: [MermasService],
})
export class MermasModule {}
