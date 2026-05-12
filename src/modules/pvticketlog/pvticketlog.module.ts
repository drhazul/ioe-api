import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PromocionesModule } from '../promociones/promociones.module';
import { PvTicketLogController } from './pvticketlog.controller';
import { PvTicketLogService } from './pvticketlog.service';
import { PvTicketLogEntity } from './pvticketlog.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PvTicketLogEntity]),
    AuditModule,
    PromocionesModule,
  ],
  controllers: [PvTicketLogController],
  providers: [PvTicketLogService],
})
export class PvTicketLogModule {}
