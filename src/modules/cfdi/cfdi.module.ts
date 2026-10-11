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
import { CfdiCorreoController } from './correo/cfdi-correo.controller';
import { GoogleOAuthCallbackController } from './correo/google-oauth-callback.controller';
import { CfdiCorreoRepositorio } from './correo/cfdi-correo.repositorio';
import { CfdiCorreoService } from './correo/cfdi-correo.service';
import { CfdiCorreoWorker } from './correo/cfdi-correo.worker';
import { GmailProvider } from './correo/gmail.provider';
import { GoogleOAuthService } from './correo/google-oauth.service';
import { CFDI_CORREO_PROVIDER } from './correo/proveedor-correo';

@Module({
  controllers: [
    CfdiController,
    CfdiCorreoController,
    GoogleOAuthCallbackController,
  ],
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
    CfdiCorreoRepositorio,
    CfdiCorreoService,
    CfdiCorreoWorker,
    GoogleOAuthService,
    GmailProvider,
    { provide: CFDI_CORREO_PROVIDER, useExisting: GmailProvider },
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
