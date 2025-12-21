import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './config/database.module';
import { HealthModule } from './modules/health/health.module';
import { DatSucModule } from './modules/dat-suc/dat-suc.module';
import { RolesModule } from './modules/roles/roles.module';
import { DeptosModule } from './modules/deptos/deptos.module';
import { PuestosModule } from './modules/puestos/puestos.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './common/guards/roles.guard';
import { MeModule } from './modules/me/me.module';
import { AdminModule } from './modules/admin/admin.module';




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
],

})
export class AppModule {}
