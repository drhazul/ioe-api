import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorarioEntity } from '../horarios/horario.entity';
import { IncidenciasVacacionesModule } from '../incidencias-vacaciones/incidencias-vacaciones.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { LogsAuditoriaEntity } from '../sucursales/logs-auditoria.entity';
import { SucursalEntity } from '../sucursales/sucursal.entity';
import { BioTemplateEntity } from './bio-template.entity';
import { ColaboradorSucursalEntity } from './colaborador-sucursal.entity';
import { ColaboradorEntity } from './colaborador.entity';
import { ColaboradoresController } from './colaboradores.controller';
import { ColaboradoresLoggingInterceptor } from './colaboradores-logging.interceptor';
import { ColaboradoresService } from './colaboradores.service';
import { ColaboradoresTemplateSyncInterceptor } from './colaboradores-template-sync.interceptor';

@Module({
  imports: [
    IncidenciasVacacionesModule,
    SucursalesModule,
    TypeOrmModule.forFeature([
      ColaboradorEntity,
      BioTemplateEntity,
      ColaboradorSucursalEntity,
      HorarioEntity,
      SucursalEntity,
      LogsAuditoriaEntity,
    ]),
  ],
  controllers: [ColaboradoresController],
  providers: [
    ColaboradoresService,
    ColaboradoresLoggingInterceptor,
    ColaboradoresTemplateSyncInterceptor,
  ],
})
export class ColaboradoresModule {}
