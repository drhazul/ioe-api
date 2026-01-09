import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { DatContCapModule } from './modules/datcontcap/datcontcap.module';
import { DatDetSvrModule } from './modules/datdetsvr/datdetsvr.module';
import { DatContCtrlModule } from './modules/datcontctrl/datcontctrl.module';
import { ConteosModule } from './modules/conteos/conteos.module';
import { AccessModule } from './modules/access/access.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath: '.env',
    }),
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
    DatContCapModule,
    DatDetSvrModule,
    DatContCtrlModule,
    ConteosModule,
    AccessModule,
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
