import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PvTicketLogController } from './pvticketlog.controller';
import { PvTicketLogService } from './pvticketlog.service';
import { PvTicketLogEntity } from './pvticketlog.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PvTicketLogEntity])],
  controllers: [PvTicketLogController],
  providers: [PvTicketLogService],
})
export class PvTicketLogModule {}
