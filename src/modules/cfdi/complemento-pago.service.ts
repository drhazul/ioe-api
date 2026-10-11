import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CfdiImpreso } from './cfdi-lector';
import { DocumentosService } from './documentos.service';
import { fechaCfdi } from './fecha-expedicion';
import { NotaCreditoRepositorio } from './nota-credito.repositorio';
import {
  construirReciboPago,
  DatosReciboPago,
  ReciboPagoInvalidoError,
} from './recibo-pago';
import { TimbradoService } from './timbrado.service';
import { columna } from './venta.mapper';
import { VentaRepositorio } from './venta.repositorio';

export interface PagoRegistrado {
  nomenclatura: string;
  uuid: string | null;
  parcialidad: number;
  monto: string;
  fechaPago: string;
}

export interface EstadoDeCuenta {
  idFol: string;
  uuid: string;
  serieFolio: string;
  rfcEmisor: string;
  rfcReceptor: string;
  moneda: string;
  /** Total de la factura: el saldo de partida. */
  total: string;
  /** Lo ya cobrado segun los REP emitidos. */
  pagado: string;
  /** Lo que falta por cobrar. */
  saldo: string;
  /** Numero que le toca al siguiente abono. */
  siguienteParcialidad: number;
  pagos: PagoRegistrado[];
}

export interface DatosDelPago {
  /** `yyyy-MM-dd` o `yyyy-MM-ddTHH:mm:ss`. */
  fechaPago: string;
  formaDePago: string;
  monto: number;
}

export interface ResultadoComplementoPago {
  idFol: string;
  idFolPago: string;
  serie: string;
  folio: string;
  uuid: string;
  uuidFactura: string;
  monto: string;
  parcialidad: number;
  saldoInsoluto: string;
  xmlPath: string;
  evidencia: string;
}

/**
 * Complementos de pago (REP) de una factura a credito.
 *
 * Solo aplican a facturas PPD: en una PUE el cliente ya pago al emitirla, y el
 * SAT rechaza un REP contra ella.
 *
 * El saldo NO se guarda en ningun lado: se calcula sumando los REP ya
 * timbrados de esa factura, leyendo sus XML. Es mas trabajo que un contador,
 * pero no se puede desincronizar de lo que el SAT ya tiene.
 */
@Injectable()
export class ComplementoPagoService {
  private readonly logger = new Logger(ComplementoPagoService.name);

  constructor(
    private readonly documentos: DocumentosService,
    private readonly timbrado: TimbradoService,
    private readonly repo: NotaCreditoRepositorio,
    private readonly ventas: VentaRepositorio,
  ) {}

  /** Cuanto se ha cobrado y cuanto falta. Solo lectura. */
  async estado(idFol: string): Promise<EstadoDeCuenta> {
    const cfdi = await this.leerFactura(idFol);
    const pagos = await this.pagosDe(idFol);

    const total = Number(cfdi.total) || 0;
    const pagado = pagos.reduce((suma, p) => suma + Number(p.monto), 0);

    return {
      idFol,
      uuid: cfdi.timbre.uuid,
      serieFolio: `${cfdi.serie}-${cfdi.folio}`,
      rfcEmisor: cfdi.emisor.rfc,
      rfcReceptor: cfdi.receptor.rfc,
      moneda: cfdi.moneda,
      total: total.toFixed(2),
      pagado: pagado.toFixed(2),
      saldo: Math.max(0, total - pagado).toFixed(2),
      siguienteParcialidad: pagos.length + 1,
      pagos,
    };
  }

  /** SIMULACION: arma y sella el REP, sin PAC y sin reservar folio. */
  async probar(idFol: string, pago: DatosDelPago) {
    const armado = await this.armar(idFol, pago, {
      serie: 'PGSIM',
      folio: 'SIMULACION',
    });
    const listo = await this.timbrado.sellarNodo(
      armado.comprobante,
      armado.rfcEmisor,
    );
    return {
      simulacion: true as const,
      idFol,
      uuidFactura: armado.uuidFactura,
      parcialidad: armado.parcialidad,
      saldoAnterior: armado.saldoAnterior.toFixed(2),
      saldoInsoluto: (armado.saldoAnterior - pago.monto).toFixed(2),
      cadena: listo.cadena,
      sello: listo.sello,
      xml: listo.xml,
    };
  }

  async emitir(
    idFol: string,
    pago: DatosDelPago,
    opciones: { usuario?: string } = {},
  ): Promise<ResultadoComplementoPago> {
    const previo = await this.armar(idFol, pago);

    const reserva = await this.repo.reservarFolio({
      idFolOrigen: idFol,
      rfcEmisor: previo.rfcEmisor,
      fecha: new Date(),
      usuario: opciones.usuario,
      tipo: 'PG',
    });

    // Se vuelve a armar con la serie y el folio ya reservados.
    const armado = await this.armar(idFol, pago, {
      serie: reserva.serie,
      folio: reserva.folio,
    });

    let resultado: Awaited<ReturnType<TimbradoService['timbrarNodo']>>;
    try {
      resultado = await this.timbrado.timbrarNodo(
        armado.comprobante,
        armado.rfcEmisor,
      );
    } catch (e) {
      await this.repo.marcarError(
        reserva.idFol,
        e instanceof Error ? e.message : String(e),
        opciones.usuario,
      );
      throw e;
    }

    if (!resultado.exitoso) {
      const detalle =
        resultado.incidencias
          .map((i) => `${i.codigoError ?? '?'}: ${i.mensajeIncidencia ?? ''}`)
          .join(' | ') || 'El PAC no acepto el complemento de pago.';
      await this.repo.marcarError(reserva.idFol, detalle, opciones.usuario);
      throw new UnprocessableEntityException({
        message: `El PAC rechazo el complemento de pago del folio ${idFol}.`,
        incidencias: resultado.incidencias,
        evidencia: resultado.evidencia,
      });
    }

    const xmlPath = this.documentos.guardarXmlDeNota({
      rfcEmisor: armado.rfcEmisor,
      serie: reserva.serie,
      folio: reserva.folio,
      uuid: resultado.uuid!,
      xml: resultado.xmlTimbrado,
    });

    await this.repo.marcarTimbrada({
      idFol: reserva.idFol,
      uuid: resultado.uuid!,
      usuario: opciones.usuario,
    });

    this.logger.log(
      `Complemento de pago ${reserva.serie}-${reserva.folio} timbrado para ${idFol}: ` +
        `uuid=${resultado.uuid} parcialidad=${armado.parcialidad} monto=${pago.monto}`,
    );

    return {
      idFol,
      idFolPago: reserva.idFol,
      serie: reserva.serie,
      folio: reserva.folio,
      uuid: resultado.uuid!,
      uuidFactura: armado.uuidFactura,
      monto: pago.monto.toFixed(2),
      parcialidad: armado.parcialidad,
      saldoInsoluto: (armado.saldoAnterior - pago.monto).toFixed(2),
      xmlPath,
      evidencia: resultado.evidencia,
    };
  }

  // ---------------------------------------------------------------------

  private async armar(
    idFol: string,
    pago: DatosDelPago,
    serieFolio: { serie: string; folio: string } = {
      serie: '',
      folio: '',
    },
  ) {
    const cfdi = await this.leerFactura(idFol);
    const estado = await this.estado(idFol);

    const saldoAnterior = Number(estado.saldo);
    if (saldoAnterior <= 0) {
      throw new ConflictException(
        `La factura ${estado.serieFolio} ya esta pagada por completo.`,
      );
    }

    const ahora = new Date();
    const datos: DatosReciboPago = {
      serie: serieFolio.serie,
      folio: serieFolio.folio,
      // Un minuto atras: el reloj del PAC puede ir detras del nuestro.
      fecha: fechaCfdi(new Date(ahora.getTime() - 60000)),
      emisor: {
        rfc: cfdi.emisor.rfc,
        nombre: cfdi.emisor.nombre,
        regimenFiscal: cfdi.emisor.regimenFiscal,
        lugarExpedicion: cfdi.lugarExpedicion,
      },
      receptor: {
        rfc: cfdi.receptor.rfc,
        nombre: cfdi.receptor.nombre,
        domicilioFiscal: cfdi.receptor.domicilioFiscal,
        regimenFiscal: cfdi.receptor.regimenFiscal,
      },
      factura: {
        uuid: cfdi.timbre.uuid,
        serie: cfdi.serie,
        folio: cfdi.folio,
        moneda: cfdi.moneda,
      },
      fechaPago: this.fechaPago(pago.fechaPago),
      formaDePago: pago.formaDePago,
      monto: pago.monto,
      parcialidad: estado.siguienteParcialidad,
      saldoAnterior,
    };

    try {
      return {
        comprobante: construirReciboPago(datos),
        rfcEmisor: cfdi.emisor.rfc,
        uuidFactura: cfdi.timbre.uuid,
        parcialidad: datos.parcialidad,
        saldoAnterior,
      };
    } catch (e) {
      if (e instanceof ReciboPagoInvalidoError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /**
   * La factura debe existir, estar timbrada, ser a credito y seguir vigente.
   */
  private async leerFactura(idFol: string): Promise<CfdiImpreso> {
    const cfdi = await this.documentos.cfdiDelFolio(idFol);
    if (!cfdi) {
      throw new BadRequestException(
        `El folio ${idFol} no esta timbrado: no hay factura que pagar.`,
      );
    }
    if (cfdi.tipoDeComprobante !== 'I') {
      throw new ConflictException(
        `El folio ${idFol} no es una factura de ingreso (es tipo ${cfdi.tipoDeComprobante}).`,
      );
    }
    if (cfdi.metodoPago !== 'PPD') {
      throw new ConflictException(
        `La factura ${cfdi.serie}-${cfdi.folio} es ${cfdi.metodoPago || 'PUE'}: ` +
          `ya se pago al emitirla. El complemento de pago solo va en facturas a credito (PPD).`,
      );
    }

    const filas = await this.ventas.folio(idFol);
    if (columna(filas.header, 'CFDI_STATUS').toUpperCase() === 'CANCELADO') {
      throw new ConflictException(
        `El CFDI del folio ${idFol} esta cancelado: no se le puede aplicar un pago.`,
      );
    }

    return cfdi;
  }

  /** Los REP ya timbrados de esa factura, del mas viejo al mas nuevo. */
  private async pagosDe(idFol: string): Promise<PagoRegistrado[]> {
    const registrados = await this.repo.notasDeFolio(idFol, 'PG');
    const salida: PagoRegistrado[] = [];

    for (const r of registrados) {
      if (!r.uuid) continue;
      const cfdi = await this.documentos.cfdiDeNota(idFol, r);
      if (!cfdi?.pago) continue;
      salida.push({
        nomenclatura: r.nomenclatura,
        uuid: r.uuid,
        parcialidad: cfdi.pago.parcialidad,
        monto: cfdi.pago.monto,
        fechaPago: cfdi.pago.fechaPago,
      });
    }
    return salida;
  }

  /** El SAT quiere fecha y hora; si solo viene el dia, se asume mediodia. */
  private fechaPago(valor: string): string {
    const texto = (valor ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(texto)) return texto;
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return `${texto}T12:00:00`;
    throw new BadRequestException(
      `Fecha de pago '${valor}' invalida: se espera yyyy-MM-dd.`,
    );
  }
}
