import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SucursalEntity } from './sucursal.entity';
import { AuthManagerService } from './auth-manager.service';
import { MarcajesRealtimeGateway } from './marcajes-realtime.gateway';
import { SucursalesController } from './sucursales.controller';
import { SucursalesService } from './sucursales.service';
import { LogsAuditoriaEntity } from './logs-auditoria.entity';
import { SucursalesLoggingInterceptor } from './sucursales-logging.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([SucursalEntity, LogsAuditoriaEntity])],
  controllers: [SucursalesController],
  providers: [
    SucursalesService,
    SucursalesLoggingInterceptor,
    AuthManagerService,
    MarcajesRealtimeGateway,
  ],
  exports: [MarcajesRealtimeGateway],
})
export class SucursalesModule {}
