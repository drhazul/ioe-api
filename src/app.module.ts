import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { RolesGuard } from './common/guards/roles.guard';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './config/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './modules/health/health.module';
import { DatSucModule } from './modules/dat-suc/dat-suc.module';
import { RolesModule } from './modules/roles/roles.module';
import { DeptosModule } from './modules/deptos/deptos.module';
import { PuestosModule } from './modules/puestos/puestos.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { MeModule } from './modules/me/me.module';
import { AdminModule } from './modules/admin/admin.module';
import { DatmodulosModule } from './modules/datmodulos/datmodulos.module';
import { DatArtModule } from './modules/datart/datart.module';
import { Datmb51Module } from './modules/datmb51/datmb51.module';
import { Datmb52Module } from './modules/datmb52/datmb52.module';
import { DatCmovModule } from './modules/dat-cmov/dat-cmov.module';
import { DatAlmacenModule } from './modules/dat-almacen/dat-almacen.module';
import { DatFormModule } from './modules/dat-form/dat-form.module';
import { DatContCapModule } from './modules/datcontcap/datcontcap.module';
import { DatDetSvrModule } from './modules/datdetsvr/datdetsvr.module';
import { DatContCtrlModule } from './modules/datcontctrl/datcontctrl.module';
import { PvCtrFolAsvrModule } from './modules/pvctrfolasvr/pvctrfolasvr.module';
import { PvTicketLogModule } from './modules/pvticketlog/pvticketlog.module';
import { PvCtrFolFormModule } from './modules/pvctrfolform/pvctrfolform.module';
import { RefDetalleModule } from './modules/refdetalle/refdetalle.module';
import { PvCtrOrdsModule } from './modules/pvctrords/pvctrords.module';
import { PvCtrOrdsDetModule } from './modules/pvctrordsdet/pvctrordsdet.module';
import { DatRetCtrSvrModule } from './modules/datretctrsvr/datretctrsvr.module';
import { DatRetDetSvrModule } from './modules/datretdetsvr/datretdetsvr.module';
import { DatRetDetEfecSvrModule } from './modules/datretdetefecsvr/datretdetefecsvr.module';
import { FactClientShpModule } from './modules/factclientshp/factclientshp.module';
import { DatCatRegModule } from './modules/datcatreg/datcatreg.module';
import { DatCatUsoModule } from './modules/datcatuso/datcatuso.module';
import { DatEstOrdModule } from './modules/datestord/datestord.module';
import { ConteosModule } from './modules/conteos/conteos.module';
import { AccessModule } from './modules/access/access.module';
import { JrqClasModule } from './modules/jrqclas/jrqclas.module';
import { JrqDepaModule } from './modules/jrqdepa/jrqdepa.module';
import { JrqGuiaModule } from './modules/jrqguia/jrqguia.module';
import { JrqSclaModule } from './modules/jrqscla/jrqscla.module';
import { JrqScla2Module } from './modules/jrqscla2/jrqscla2.module';
import { JrqSubdModule } from './modules/jrqsubd/jrqsubd.module';
import { UsrModSucModule } from './modules/usr-mod-suc/usr-mod-suc.module';
import { AltaMasivaModule } from './modules/articulos/alta-masiva/alta-masiva.module';
import { CatCtasModule } from './modules/cat-ctas/cat-ctas.module';
import { CtrlCtasModule } from './modules/ctrl-ctas/ctrl-ctas.module';
import { RelojChecadorModule } from './modules/reloj-checador/reloj-checador.module';
import { PvDevolucionesModule } from './modules/pv-devoluciones/pv-devoluciones.module';
import { PagosServiciosModule } from './modules/pagos-servicios/pagos-servicios.module';
import { RetirosModule } from './modules/retiros/retiros.module';
import { FormasPagoCambiosModule } from './modules/formas-pago-cambios/formas-pago-cambios.module';
import { CajonEstadoModule } from './modules/cajon-estado/cajon-estado.module';
import { CajaGeneralModule } from './modules/caja-general/caja-general.module';
import { FacturacionModule } from './modules/facturacion/facturacion.module';
import { OrdenesTrabajoModule } from './modules/ordenes-trabajo/ordenes-trabajo.module';
import { SucursalesModule } from './modules/sucursales/sucursales.module';
import { ColaboradoresModule } from './modules/colaboradores/colaboradores.module';
import { HorariosModule } from './modules/horarios/horarios.module';
import { AsistenciaModule } from './modules/asistencia/asistencia.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { IncidenciasVacacionesModule } from './modules/incidencias-vacaciones/incidencias-vacaciones.module';
import { MasterdataConfigModule } from './modules/masterdata-config/masterdata-config.module';
import { PromocionesModule } from './modules/promociones/promociones.module';
import { MermasModule } from './modules/mermas/mermas.module';
import { TransferenciasModule } from './modules/transferencias/transferencias.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    DatSucModule,
    RolesModule,
    DeptosModule,
    PuestosModule,
    UsersModule,
    AuthModule,
    AuditModule,
    MeModule,
    AdminModule,
    DatmodulosModule,
    DatArtModule,
    Datmb51Module,
    Datmb52Module,
    DatCmovModule,
    DatAlmacenModule,
    DatFormModule,
    DatContCapModule,
    DatDetSvrModule,
    DatContCtrlModule,
    PvCtrFolAsvrModule,
    PvTicketLogModule,
    PvCtrFolFormModule,
    RefDetalleModule,
    PvCtrOrdsModule,
    PvCtrOrdsDetModule,
    DatRetCtrSvrModule,
    DatRetDetSvrModule,
    DatRetDetEfecSvrModule,
    FactClientShpModule,
    DatCatRegModule,
    DatCatUsoModule,
    DatEstOrdModule,
    ConteosModule,
    AccessModule,
    JrqClasModule,
    JrqDepaModule,
    JrqGuiaModule,
    JrqSclaModule,
    JrqScla2Module,
    JrqSubdModule,
    UsrModSucModule,
    AltaMasivaModule,
    CatCtasModule,
    CtrlCtasModule,
    OrdenesTrabajoModule,
    PvDevolucionesModule,
    PagosServiciosModule,
    RetirosModule,
    FormasPagoCambiosModule,
    CajonEstadoModule,
    CajaGeneralModule,
    FacturacionModule,
    SucursalesModule,
    ColaboradoresModule,
    HorariosModule,
    AsistenciaModule,
    NotificacionesModule,
    IncidenciasVacacionesModule,
    MasterdataConfigModule,
    PromocionesModule,
    MermasModule,
    TransferenciasModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    AppService,
  ],
  controllers: [AppController],
})
export class AppModule {}
