import { Module } from '@nestjs/common';
import { CancelacionService } from './cancelacion.service';
import { ComplementoPagoService } from './complemento-pago.service';
import { CfdiController } from './cfdi.controller';
import { CsdRepositorio } from './csd.repositorio';
import { CsdService } from './csd.service';
import { CsdStore } from './csd.store';
import { DocumentosService } from './documentos.service';
import { NotaCreditoRepositorio } from './nota-credito.repositorio';
import { NotaCreditoService } from './nota-credito.service';
import { EmisionService } from './emision.service';
import { QuadrumClient } from './quadrum.client';
import { QuadrumCancelacionClient } from './quadrum-cancelacion.client';
import { RepresentacionImpresaService } from './representacion-impresa.service';
import { TimbradoService } from './timbrado.service';
import { VentaRepositorio } from './venta.repositorio';

@Module({
  controllers: [CfdiController],
  providers: [
    QuadrumClient,
    QuadrumCancelacionClient,
    CsdStore,
    CsdRepositorio,
    CsdService,
    TimbradoService,
    CancelacionService,
    VentaRepositorio,
    EmisionService,
    DocumentosService,
    NotaCreditoRepositorio,
    NotaCreditoService,
    ComplementoPagoService,
    RepresentacionImpresaService,
  ],
  exports: [
    QuadrumClient,
    QuadrumCancelacionClient,
    CsdService,
    TimbradoService,
    CancelacionService,
    EmisionService,
    DocumentosService,
    NotaCreditoService,
    ComplementoPagoService,
  ],
})
export class CfdiModule {}
