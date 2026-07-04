import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttPermisoTipoEntity } from './att-permiso-tipo.entity';
import { AttSolicitudEntity } from './att-solicitud.entity';
import { AttVacacionesSaldoEntity } from './att-vacaciones-saldo.entity';
import { IncidenciasPayloadDebugMiddleware } from './incidencias-payload-debug.middleware';
import { IncidenciasVacacionesController } from './incidencias-vacaciones.controller';
import { IncidenciasVacacionesService } from './incidencias-vacaciones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttPermisoTipoEntity,
      AttSolicitudEntity,
      AttVacacionesSaldoEntity,
    ]),
  ],
  controllers: [IncidenciasVacacionesController],
  providers: [IncidenciasVacacionesService],
  exports: [IncidenciasVacacionesService],
})
export class IncidenciasVacacionesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(IncidenciasPayloadDebugMiddleware)
      .forRoutes(IncidenciasVacacionesController);
  }
}
