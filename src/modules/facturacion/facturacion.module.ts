import { Module } from '@nestjs/common';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';
import { FacturifyClient } from './facturify.client';
import { FactClientShpModule } from '../factclientshp/factclientshp.module';

@Module({
  imports: [FactClientShpModule],
  controllers: [FacturacionController],
  providers: [FacturacionService, FacturifyClient],
})
export class FacturacionModule {}
