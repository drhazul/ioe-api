import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRuleEntity } from './attendance-rule.entity';
import { FestivoEntity } from './festivo.entity';
import { IncentivoEntity } from './incentivo.entity';
import { AttendanceRulesService } from './attendance-rules.service';
import { AsistenciaController } from './asistencia.controller';
import { AsistenciaService } from './asistencia.service';
import { CheckinsProcessorService } from './checkins-processor.service';
import { ExportService } from './export.service';
import { IncidenciasVacacionesModule } from '../incidencias-vacaciones/incidencias-vacaciones.module';
import { LaborLawService } from './labor-law.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceRuleEntity,
      FestivoEntity,
      IncentivoEntity,
    ]),
    IncidenciasVacacionesModule,
  ],
  controllers: [AsistenciaController],
  providers: [
    AsistenciaService,
    ExportService,
    AttendanceRulesService,
    CheckinsProcessorService,
    LaborLawService,
  ],
  exports: [
    ExportService,
    AttendanceRulesService,
    CheckinsProcessorService,
    LaborLawService,
  ],
})
export class AsistenciaModule {}
