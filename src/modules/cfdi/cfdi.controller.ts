import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CancelacionService } from './cancelacion.service';
import { ComplementoPagoService } from './complemento-pago.service';
import { CsdService } from './csd.service';
import { DocumentosService } from './documentos.service';
import { NotaCreditoService } from './nota-credito.service';
import { EmisionService } from './emision.service';
import {
  CancelarCfdiDto,
  EstatusCancelacionQueryDto,
} from './dto/cancelar-cfdi.dto';
import { EmitirVentaDto } from './dto/emitir-venta.dto';
import { EmitirNotaCreditoDto } from './dto/nota-credito.dto';
import { EmitirComplementoPagoDto } from './dto/complemento-pago.dto';
import { GuardarCsdDto } from './dto/guardar-csd.dto';
import {
  TimbrarNotaCreditoPruebaDto,
  TimbrarPruebaDto,
  TimbrarReciboPagoPruebaDto,
} from './dto/timbrar-prueba.dto';
import { MOTIVOS_CANCELACION } from './motivo-cancelacion';
import { TimbradoService } from './timbrado.service';

@ApiTags('cfdi')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('cfdi')
export class CfdiController {
  constructor(
    private readonly service: TimbradoService,
    private readonly cancelacion: CancelacionService,
    private readonly csd: CsdService,
    private readonly emision: EmisionService,
    private readonly documentos: DocumentosService,
    private readonly notaCredito: NotaCreditoService,
    private readonly pagos: ComplementoPagoService,
  ) {}

  /**
   * Timbra con Quadrum una venta REAL de FAC_SVR_SHAP.
   *
   * No toca el camino de Facturify: solo emite folios sin CFDI y sin marca
   * de otro PAC, y al terminar los deja con CFDI_PAC = 'QUADRUM'.
   */
  /**
   * SIMULACION de un folio real: lo arma y lo sella con el CSD de su RFC,
   * sin llamar al PAC y sin escribir en la base. Sirve para ver si timbraria.
   */
  @Post('probar/:idFol')
  probar(@Param('idFol') idFol: string) {
    return this.emision.probar(idFol);
  }

  @Post('emitir/:idFol')
  emitir(
    @Param('idFol') idFol: string,
    @Body() dto: EmitirVentaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Timbrar una venta real genera un CFDI ante el SAT: envia { "confirmar": true }.',
      );
    }
    return this.emision.emitir(idFol, {
      usuario: String(user?.username ?? user?.sub ?? ''),
    });
  }

  /**
   * XML timbrado del folio: el documento fiscal tal como se sello.
   */
  @Get('xml/:idFol')
  async descargarXml(
    @Param('idFol') idFol: string,
    @Res() res: Response,
  ): Promise<void> {
    this.enviarArchivo(res, await this.documentos.xml(idFol));
  }

  /**
   * Representacion impresa. La genera el PAC; la primera vez se guarda en
   * disco y de ahi en adelante se sirve ese archivo.
   */
  @Get('pdf/:idFol')
  async descargarPdf(
    @Param('idFol') idFol: string,
    @Res() res: Response,
  ): Promise<void> {
    this.enviarArchivo(res, await this.documentos.pdf(idFol));
  }

  /** Acuse de cancelacion del SAT, si el folio se cancelo. */
  @Get('acuse-cancelacion/:idFol')
  async descargarAcuse(
    @Param('idFol') idFol: string,
    @Res() res: Response,
  ): Promise<void> {
    this.enviarArchivo(res, await this.documentos.acuseCancelacion(idFol));
  }

  /**
   * Que se puede devolver de una factura: sus conceptos, descontando lo
   * que ya cubrieron notas anteriores. Solo lectura.
   */
  @Get('nota-credito/:idFol/conceptos')
  conceptosParaNota(@Param('idFol') idFol: string) {
    return this.notaCredito.conceptos(idFol);
  }

  /** XML timbrado de una nota de credito ya emitida. */
  @Get('nota-credito/:idFol/xml/:uuid')
  async descargarXmlNota(
    @Param('idFol') idFol: string,
    @Param('uuid') uuid: string,
    @Res() res: Response,
  ): Promise<void> {
    this.enviarArchivo(res, await this.documentos.xmlNota(idFol, uuid));
  }

  /** Representacion impresa de una nota de credito. */
  @Get('nota-credito/:idFol/pdf/:uuid')
  async descargarPdfNota(
    @Param('idFol') idFol: string,
    @Param('uuid') uuid: string,
    @Res() res: Response,
  ): Promise<void> {
    this.enviarArchivo(res, await this.documentos.pdfNota(idFol, uuid));
  }

  /** Simula la nota: la arma y la sella, sin PAC y sin tocar la base. */
  @Post('nota-credito/:idFol/probar')
  probarNotaCredito(
    @Param('idFol') idFol: string,
    @Body() dto: EmitirNotaCreditoDto,
  ) {
    return this.notaCredito.probar(idFol, dto.conceptos);
  }

  /** Emite la nota de credito de los conceptos elegidos. Gasta un timbre. */
  @Post('nota-credito/:idFol')
  emitirNotaCredito(
    @Param('idFol') idFol: string,
    @Body() dto: EmitirNotaCreditoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Una nota de credito genera un CFDI ante el SAT: envia { "confirmar": true }.',
      );
    }
    return this.notaCredito.emitir(idFol, dto.conceptos, {
      usuario: String(user?.username ?? user?.sub ?? ''),
    });
  }

  /**
   * Estado de cuenta de una factura a credito: cuanto se ha cobrado, que
   * falta y que parcialidad toca. Solo lectura.
   */
  @Get('complemento-pago/:idFol')
  estadoDePagos(@Param('idFol') idFol: string) {
    return this.pagos.estado(idFol);
  }

  /** Simula el complemento: lo arma y lo sella, sin PAC y sin tocar la base. */
  @Post('complemento-pago/:idFol/probar')
  probarComplementoPago(
    @Param('idFol') idFol: string,
    @Body() dto: EmitirComplementoPagoDto,
  ) {
    return this.pagos.probar(idFol, {
      fechaPago: dto.fechaPago,
      formaDePago: dto.formaDePago,
      monto: dto.monto,
    });
  }

  /** Emite el complemento de pago del abono. Gasta un timbre. */
  @Post('complemento-pago/:idFol')
  emitirComplementoPago(
    @Param('idFol') idFol: string,
    @Body() dto: EmitirComplementoPagoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Un complemento de pago genera un CFDI ante el SAT: envia { "confirmar": true }.',
      );
    }
    return this.pagos.emitir(
      idFol,
      {
        fechaPago: dto.fechaPago,
        formaDePago: dto.formaDePago,
        monto: dto.monto,
      },
      { usuario: String(user?.username ?? user?.sub ?? '') },
    );
  }

  /**
   * Da de alta (o renueva) el CSD de una razon social. El RFC NO se captura:
   * se lee del propio certificado, asi no se puede subir el equivocado.
   *
   * Solo administradores: quien pueda subir un CSD puede facturar
   * a nombre de esa razon social.
   */
  @Post('csd')
  @UseGuards(AdminOnlyGuard)
  guardarCsd(@Body() dto: GuardarCsdDto, @CurrentUser() user: JwtPayload) {
    return this.csd.guardar({
      cerBase64: dto.cerBase64,
      keyBase64: dto.keyBase64,
      password: dto.password,
      regimenFiscal: dto.regimenFiscal,
      codigoPostal: dto.codigoPostal,
      quadrumUsuario: dto.quadrumUsuario,
      quadrumPassword: dto.quadrumPassword,
      usuario: String(user?.sub ?? user?.username ?? ''),
    });
  }

  /** Certificados cargados. Nunca devuelve los archivos ni la contrasena. */
  @Get('csd')
  listarCsd() {
    return this.csd.listar();
  }

  /** CSD, ambiente y conexion con Quadrum. No gasta timbre. */
  @Get('estado')
  estado() {
    return this.service.estado();
  }

  /** Sella y verifica el comprobante de prueba. No gasta timbre. */
  @Post('prueba/sellar')
  sellarPrueba() {
    return this.service.sellarPrueba();
  }

  /** Timbra el comprobante de prueba en el ambiente de pruebas de Quadrum. */
  @Post('prueba/timbrar')
  timbrarPrueba(@Body() dto: TimbrarPruebaDto) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Timbrar consume un timbre del ambiente de pruebas: envia { "confirmar": true }.',
      );
    }
    return this.service.timbrarPrueba();
  }

  /**
   * Timbra en pruebas una nota de credito (egreso) que acredita la factura
   * `uuidRelacionado`: devolucion parcial de `cantidadDevuelta` piezas.
   */
  @Post('prueba/nota-credito')
  timbrarNotaCreditoPrueba(@Body() dto: TimbrarNotaCreditoPruebaDto) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Timbrar consume un timbre del ambiente de pruebas: envia { "confirmar": true }.',
      );
    }
    return this.service.timbrarNotaCreditoPrueba(
      dto.uuidRelacionado,
      dto.cantidadDevuelta,
    );
  }

  /** Timbra en pruebas una factura a credito (PPD, forma de pago 99). */
  @Post('prueba/factura-ppd')
  timbrarFacturaPpdPrueba(@Body() dto: TimbrarPruebaDto) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Timbrar consume un timbre del ambiente de pruebas: envia { "confirmar": true }.',
      );
    }
    return this.service.timbrarFacturaPpdPrueba();
  }

  /**
   * Timbra en pruebas un recibo electronico de pago (complemento de pagos
   * 2.0) por un abono a la factura PPD `uuidFactura`.
   */
  @Post('prueba/pago')
  timbrarReciboPagoPrueba(@Body() dto: TimbrarReciboPagoPruebaDto) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Timbrar consume un timbre del ambiente de pruebas: envia { "confirmar": true }.',
      );
    }
    return this.service.timbrarReciboPagoPrueba({
      uuidFactura: dto.uuidFactura,
      serieFactura: dto.serieFactura,
      folioFactura: dto.folioFactura,
      monto: dto.monto,
      parcialidad: dto.parcialidad,
      saldoAnterior: dto.saldoAnterior,
    });
  }

  @Get('consultar/:uuid')
  consultar(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
    return this.service.consultar(uuid);
  }

  /** Catalogo c_MotivoCancelacion y cual exige folio de sustitucion. */
  @Get('cancelacion/motivos')
  motivos() {
    return Object.entries(MOTIVOS_CANCELACION).map(([clave, descripcion]) => ({
      clave,
      descripcion,
      requiereFolioSustitucion: clave === '01',
    }));
  }

  /** Dice si el CFDI se puede cancelar, y si necesita que el receptor acepte. */
  @Get('cancelacion/estatus/:uuid')
  estatusCancelacion(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Query() query: EstatusCancelacionQueryDto,
  ) {
    return this.cancelacion.estatus({
      uuid,
      rfcReceptor: query.rfcReceptor,
      total: query.total,
    });
  }

  /** Solicita la cancelacion ante el SAT. No se deshace. */
  @Post('cancelacion')
  cancelar(@Body() dto: CancelarCfdiDto) {
    if (dto.confirmar !== true) {
      throw new BadRequestException(
        'Cancelar ante el SAT no se deshace: envia { "confirmar": true }.',
      );
    }
    return this.cancelacion.cancelar({
      uuid: dto.uuid,
      motivo: dto.motivo,
      folioSustitucion: dto.folioSustitucion,
      rfcReceptor: dto.rfcReceptor,
      total: dto.total,
    });
  }

  /** Acuse del SAT de una cancelacion ya solicitada. */
  @Get('cancelacion/acuse/:uuid')
  acuseCancelacion(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
    return this.cancelacion.acuse(uuid);
  }

  /** Manda el archivo como descarga, con su nombre y tipo. */
  private enviarArchivo(
    res: Response,
    doc: { nombre: string; contenido: Buffer; tipo: string },
  ): void {
    res.set({
      'Content-Type': doc.tipo,
      'Content-Disposition': `attachment; filename="${doc.nombre}"`,
      'Content-Length': String(doc.contenido.length),
    });
    res.end(doc.contenido);
  }
}
