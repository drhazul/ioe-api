import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CfdiImpreso, ConceptoImpreso } from './cfdi-lector';
import { ConceptoComprobante, DatosComprobante } from './comprobante';
import { DocumentosService } from './documentos.service';
import { fechaCfdi } from './fecha-expedicion';
import { NotaCreditoRepositorio } from './nota-credito.repositorio';
import { TimbradoService } from './timbrado.service';
import { columna } from './venta.mapper';
import { VentaRepositorio } from './venta.repositorio';

/** Lo que se puede devolver de un concepto de la factura. */
export interface ConceptoDisponible {
  /** Posicion en la factura: es lo que se manda de vuelta para elegirlo. */
  indice: number;
  noIdentificacion: string;
  descripcion: string;
  claveProdServ: string;
  claveUnidad: string;
  valorUnitario: string;
  /** Lo que ampara la factura. */
  cantidadFacturada: number;
  /** Lo ya cubierto por notas de credito anteriores. */
  cantidadAcreditada: number;
  /** Lo que todavia se puede devolver. */
  cantidadDisponible: number;
  importeUnitarioConIva: string;
}

export interface ConceptosDeFolio {
  idFol: string;
  uuid: string;
  serieFolio: string;
  rfcEmisor: string;
  rfcReceptor: string;
  totalFactura: string;
  conceptos: ConceptoDisponible[];
  /** Notas de credito ya emitidas contra esta factura. */
  notasPrevias: { nomenclatura: string; uuid: string | null }[];
}

export interface SeleccionConcepto {
  indice: number;
  cantidad: number;
}

export interface ResultadoNotaCredito {
  idFol: string;
  idFolNota: string;
  serie: string;
  folio: string;
  uuid: string;
  uuidRelacionado: string;
  total: string;
  conceptos: number;
  xmlPath: string;
  evidencia: string;
}

/**
 * Notas de credito (CFDI de egreso) contra una factura ya timbrada.
 *
 * El detalle NO se captura: sale del XML timbrado de la factura, que es la
 * unica fuente que no puede discrepar de lo que el SAT ya tiene. De ahi se
 * copian clave, unidad, descripcion y precio; lo unico que se elige es que
 * conceptos y cuantas piezas.
 *
 * La nota no crea renglon en FAC_SVR_SHAP: se registra en la tabla de control
 * de folios con IDFOL = <folio>-NC, y su XML se guarda junto al de la factura.
 */
@Injectable()
export class NotaCreditoService {
  private readonly logger = new Logger(NotaCreditoService.name);

  constructor(
    private readonly documentos: DocumentosService,
    private readonly timbrado: TimbradoService,
    private readonly repo: NotaCreditoRepositorio,
    private readonly ventas: VentaRepositorio,
  ) {}

  /** Que se puede devolver de esta factura, descontando notas anteriores. */
  async conceptos(idFol: string): Promise<ConceptosDeFolio> {
    const { cfdi } = await this.leerFactura(idFol);
    const previas = await this.repo.notasDeFolio(idFol);
    const acreditado = await this.acreditado(idFol, previas);

    return {
      idFol,
      uuid: cfdi.timbre.uuid,
      serieFolio: `${cfdi.serie}-${cfdi.folio}`,
      rfcEmisor: cfdi.emisor.rfc,
      rfcReceptor: cfdi.receptor.rfc,
      totalFactura: cfdi.total,
      conceptos: cfdi.conceptos.map((c, i) => {
        const facturada = Number(c.cantidad) || 0;
        const ya = acreditado.get(this.llave(c)) ?? 0;
        return {
          indice: i,
          noIdentificacion: c.noIdentificacion,
          descripcion: c.descripcion,
          claveProdServ: c.claveProdServ,
          claveUnidad: c.claveUnidad,
          valorUnitario: c.valorUnitario,
          cantidadFacturada: facturada,
          cantidadAcreditada: ya,
          cantidadDisponible: Math.max(0, facturada - ya),
          importeUnitarioConIva: (Number(c.valorUnitario) * 1.16).toFixed(2),
        };
      }),
      notasPrevias: previas.map((n) => ({
        nomenclatura: n.nomenclatura,
        uuid: n.uuid,
      })),
    };
  }

  /**
   * SIMULACION: arma y sella la nota, sin llamar al PAC ni reservar folio.
   *
   * La serie y el folio van simulados porque reservarlos SI escribe en la
   * base, y una simulacion no debe dejar rastro.
   */
  async probar(idFol: string, seleccion: SeleccionConcepto[]) {
    const armado = await this.armarDatos(idFol, seleccion, {
      serie: 'NCSIM',
      folio: 'SIMULACION',
    });
    const listo = await this.timbrado.sellarComprobanteDe(
      armado.datos,
      armado.rfcEmisor,
    );
    return {
      simulacion: true as const,
      idFol,
      uuidRelacionado: armado.uuidRelacionado,
      conceptos: armado.datos.conceptos.length,
      total: listo.total,
      cadena: listo.cadena,
      sello: listo.sello,
      xml: listo.xml,
    };
  }

  async emitir(
    idFol: string,
    seleccion: SeleccionConcepto[],
    opciones: { usuario?: string } = {},
  ): Promise<ResultadoNotaCredito> {
    const armado = await this.armarDatos(idFol, seleccion);

    const reserva = await this.repo.reservarFolio({
      idFolOrigen: idFol,
      rfcEmisor: armado.rfcEmisor,
      fecha: new Date(),
      usuario: opciones.usuario,
    });

    const datos: DatosComprobante = {
      ...armado.datos,
      serie: reserva.serie,
      folio: reserva.folio,
    };

    // Sin el tipo explicito se infiere any y se pierde toda la revision.
    let resultado: Awaited<ReturnType<TimbradoService['timbrarComprobante']>>;
    try {
      resultado = await this.timbrado.timbrarComprobante(
        datos,
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
          .join(' | ') || 'El PAC no acepto la nota de credito.';
      await this.repo.marcarError(reserva.idFol, detalle, opciones.usuario);
      throw new UnprocessableEntityException({
        message: `El PAC rechazo la nota de credito del folio ${idFol}.`,
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
      `Nota de credito ${reserva.serie}-${reserva.folio} timbrada para ${idFol}: ` +
        `uuid=${resultado.uuid} relacionada=${armado.uuidRelacionado}`,
    );

    return {
      idFol,
      idFolNota: reserva.idFol,
      serie: reserva.serie,
      folio: reserva.folio,
      uuid: resultado.uuid!,
      uuidRelacionado: armado.uuidRelacionado,
      total: resultado.total,
      conceptos: datos.conceptos.length,
      xmlPath,
      evidencia: resultado.evidencia,
    };
  }

  // ---------------------------------------------------------------------

  /**
   * Arma la nota a partir de la factura timbrada.
   *
   * La serie y el folio se dejan vacios: los pone quien emite, despues de
   * reservarlos. La simulacion les pone valores de mentiras.
   */
  private async armarDatos(
    idFol: string,
    seleccion: SeleccionConcepto[],
    serieFolio: { serie: string; folio: string } = { serie: '', folio: '' },
  ): Promise<{
    datos: DatosComprobante;
    cfdi: CfdiImpreso;
    rfcEmisor: string;
    uuidRelacionado: string;
  }> {
    if (!seleccion?.length) {
      throw new BadRequestException(
        'Hay que indicar al menos un concepto a devolver.',
      );
    }

    const { cfdi } = await this.leerFactura(idFol);
    const previas = await this.repo.notasDeFolio(idFol);
    const acreditado = await this.acreditado(idFol, previas);
    const conceptos = this.armarConceptos(cfdi, seleccion, acreditado);

    const ahora = new Date();
    return {
      cfdi,
      rfcEmisor: cfdi.emisor.rfc,
      uuidRelacionado: cfdi.timbre.uuid,
      datos: {
        serie: serieFolio.serie,
        folio: serieFolio.folio,
        // Un minuto atras: el reloj del PAC puede ir detras del nuestro.
        fecha: fechaCfdi(new Date(ahora.getTime() - 60000)),
        tipoDeComprobante: 'E',
        // Una nota de credito se paga como se pago la factura.
        formaPago: cfdi.formaPago,
        metodoPago: cfdi.metodoPago === 'PPD' ? 'PPD' : 'PUE',
        moneda: cfdi.moneda,
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
          usoCfdi: cfdi.receptor.usoCfdi,
        },
        conceptos,
        // 01: nota de credito de los documentos relacionados.
        relacionados: { tipoRelacion: '01', uuids: [cfdi.timbre.uuid] },
      },
    };
  }

  private async leerFactura(idFol: string): Promise<{ cfdi: CfdiImpreso }> {
    const cfdi = await this.documentos.cfdiDelFolio(idFol);
    if (!cfdi) {
      throw new BadRequestException(
        `El folio ${idFol} no esta timbrado: no hay factura que acreditar.`,
      );
    }
    if (cfdi.tipoDeComprobante !== 'I') {
      throw new ConflictException(
        `El folio ${idFol} no es una factura de ingreso (es tipo ${cfdi.tipoDeComprobante}).`,
      );
    }
    await this.assertVigente(idFol);
    return { cfdi };
  }

  /**
   * Una factura cancelada o con cancelacion en proceso ya no ampara nada:
   * acreditarla con una nota no tiene sentido y el SAT lo rechaza.
   */
  private async assertVigente(idFol: string): Promise<void> {
    const filas = await this.ventas.folio(idFol);
    const estatus = columna(filas.header, 'CFDI_STATUS').toUpperCase();
    const cancelacion = columna(
      filas.header,
      'CFDI_CANCEL_STATUS',
    ).toUpperCase();

    if (estatus === 'CANCELADO') {
      throw new ConflictException(
        `El CFDI del folio ${idFol} esta cancelado: no se le puede emitir una nota de credito.`,
      );
    }
    if (cancelacion) {
      throw new ConflictException(
        `El folio ${idFol} tiene una cancelacion ${cancelacion.toLowerCase().replace(/_/g, ' ')}. ` +
          `Espera a que el SAT la resuelva antes de emitir una nota de credito.`,
      );
    }
  }

  /**
   * Cuantas piezas de cada concepto ya se devolvieron.
   *
   * Se lee de los XML de las notas anteriores, no de un contador aparte: asi
   * no hay forma de que el conteo se desincronice de lo que se timbro.
   */
  private async acreditado(
    idFol: string,
    previas: { nomenclatura: string; uuid: string | null }[],
  ): Promise<Map<string, number>> {
    const salida = new Map<string, number>();
    for (const nota of previas) {
      if (!nota.uuid) continue;
      const cfdi = await this.documentos.cfdiDeNota(idFol, nota);
      if (!cfdi) continue;
      cfdi.conceptos.forEach((c) => {
        const llave = this.llave(c);
        salida.set(llave, (salida.get(llave) ?? 0) + (Number(c.cantidad) || 0));
      });
    }
    return salida;
  }

  /**
   * Los conceptos de la nota salen de la factura: solo cambia la cantidad.
   *
   * El precio, la clave y la unidad se copian tal cual para que la nota
   * cuadre contra la factura hasta el ultimo centavo.
   */
  private armarConceptos(
    cfdi: CfdiImpreso,
    seleccion: SeleccionConcepto[],
    acreditado: Map<string, number>,
  ): ConceptoComprobante[] {
    const salida: ConceptoComprobante[] = [];

    for (const elegido of seleccion) {
      const original = cfdi.conceptos[elegido.indice];
      if (!original) {
        throw new BadRequestException(
          `La factura no tiene un concepto en la posicion ${elegido.indice}.`,
        );
      }
      if (!(elegido.cantidad > 0)) {
        throw new BadRequestException(
          `La cantidad a devolver de '${original.descripcion}' debe ser mayor que cero.`,
        );
      }

      const facturada = Number(original.cantidad) || 0;
      const ya = acreditado.get(this.llave(original)) ?? 0;
      const disponible = facturada - ya;
      if (elegido.cantidad > disponible) {
        throw new BadRequestException(
          `De '${original.descripcion}' solo quedan ${disponible} por devolver ` +
            `(facturadas ${facturada}, ya acreditadas ${ya}).`,
        );
      }

      salida.push({
        claveProdServ: original.claveProdServ,
        noIdentificacion: original.noIdentificacion || undefined,
        cantidad: elegido.cantidad,
        claveUnidad: original.claveUnidad,
        descripcion: `DEVOLUCION ${original.descripcion}`.slice(0, 1000),
        valorUnitario: Number(original.valorUnitario),
      });
    }

    return salida;
  }

  /**
   * Identifica al articulo entre la factura y sus notas.
   *
   * No puede ser la posicion: una nota parcial trae solo algunos conceptos y
   * en otro orden. Se usa el codigo de articulo, y si viene vacio, la
   * descripcion sin el prefijo que les pone la nota.
   */
  private llave(concepto: ConceptoImpreso): string {
    const codigo = concepto.noIdentificacion?.trim().toUpperCase();
    if (codigo) return codigo;
    return concepto.descripcion
      .replace(/^DEVOLUCION /i, '')
      .trim()
      .toUpperCase();
  }
}
