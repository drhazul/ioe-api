import { Module } from '@nestjs/common';
import { OdooAccountMapService } from './odoo-account-map.service';

@Module({
  providers: [OdooAccountMapService],
  exports: [OdooAccountMapService],
})
export class OdooAccountingModule {}
