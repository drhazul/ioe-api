import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aUtf8SinBom } from './cfdi-node';
import { fechaCfdi } from './fecha-expedicion';
import { Incidencia } from './quadrum.client';
import {
  DatosVenta,
  ResultadoTimbrado,
  TimbradoService,
} from './timbrado.service';
import { columna, mapearVenta, VentaInvalidaError } from './venta.mapper';
import { VentaRepositorio } from './venta.repositorio';

export interface ResultadoEmision {
  idFol: string;
  serie: string;
  folio: string;
  uuid: string;
  fechaTimbrado?: string;
  pac: 'QUADRUM';
  ambiente: string;
  xmlPath: string;
  /** Carpeta con el XML enviado, la cadena y el acuse del PAC. */
  evidencia: string;
}

/** Lo que devuelve la simulacion: nada de esto se guardo ni se timbro. */
export interface ResultadoSimulacion {
  simulacion: true;
  idFol: string;
  rfcEmisor: string;
  noCertificado: string;
  /** Si ya tiene UUID, el folio NO es candidato a timbrarse de nuevo. */
  uuidPrevio?: string;
  pacPrevio?: string;
  serie: string;
  subTotal: string;
  total: string;
  metodoPago: string;
  formaPago: string;
  conceptos: number;
  cadena: string;
  sello: string;
  xml: string;
}

/**
 * Emision de CFDI de una venta real con Quadrum.
 *
 * Vive aparte de `facturacion.service.ts` a proposito: ese modulo sigue
 * timbrando con Facturify sin un solo cambio. Lo unico que comparten son las
 * tablas y los dos procedimientos de control de folios, que no dependen del
 * PAC.
 *
 * Orden que no se altera:
 *   1. Reservar serie y folio (transaccional, con lock por serie).
 *   2. Armar, sellar y timbrar.
 *   3. Guardar el XML timbrado y marcar el folio.
 *
 * Si el PAC no contesta, el resultado es INCIERTO: pudo haber timbrado. En ese
 * caso el folio NO se libera, porque liberarlo permitiria reusar la serie y
 * terminar con dos CFDI del mismo ticket.
 */
@Injectable()
export class EmisionService {
  private readonly logger = new Logger(EmisionService.name);

  constructor(
    private readonly repo: VentaRepositorio,
    private readonly timbrado: TimbradoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * SIMULACION: arma y sella el folio con el CSD de su RFC emisor, pero NO
   * llama al PAC ni escribe nada en la base.
   *
   * Sirve para saber si un folio real timbraria antes de intentarlo: detecta
   * datos fiscales incompletos, RFC sin certificado cargado y totales que no
   * cuadran. La serie y el folio van simulados a proposito, porque reservarlos
   * SI escribe en la base.
   */
  async probar(idFol: string): Promise<ResultadoSimulacion> {
    const filas = await this.repo.folio(idFol);
    const header = filas.header;
    const rfcEmisor = (
      columna(header, 'RfcEmisor') || columna(filas.sucursal, 'RFC')
    ).toUpperCase();
    if (!rfcEmisor) {
      throw new BadRequestException(
        `El folio ${idFol} no tiene RFC emisor ni en el folio ni en su sucursal.`,
      );
    }

    const ahora = new Date();
    let datos: DatosVenta;
    try {
      datos = mapearVenta(filas, {
        serie: rfcEmisor.slice(0, 4),
        folio: 'SIMULACION',
        fecha: fechaCfdi(new Date(ahora.getTime() - 60000)),
      });
    } catch (e) {
      if (e instanceof VentaInvalidaError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const { comprobante, credenciales } =
      await this.timbrado.comprobanteDeVenta({ ...datos, rfcEmisor });
    const listo = this.timbrado.sellarComprobante(comprobante, credenciales);

    return {
      simulacion: true,
      idFol,
      rfcEmisor,
      noCertificado: listo.noCertificado,
      uuidPrevio: columna(header, 'CFDI_UUID') || undefined,
      pacPrevio: columna(header, 'CFDI_PAC') || undefined,
      serie: comprobante.attrs.get('Serie') ?? '',
      subTotal: comprobante.attrs.get('SubTotal') ?? '',
      total: comprobante.attrs.get('Total') ?? '',
      metodoPago: comprobante.attrs.get('MetodoPago') ?? '',
      formaPago: comprobante.attrs.get('FormaPago') ?? '',
      conceptos: datos.conceptos.length,
      cadena: listo.cadena,
      sello: listo.sello,
      xml: listo.xml,
    };
  }

  async emitir(
    idFol: string,
    opciones: { usuario?: string } = {},
  ): Promise<ResultadoEmision> {
    await this.repo.assertColumnaPac();

    const filas = await this.repo.folio(idFol);
    const header = filas.header;

    const uuidPrevio = columna(header, 'CFDI_UUID');
    // Vale tanto la cancelacion ya confirmada como la que sigue en tramite:
    // en ambos casos el SAT acepto la solicitud y la factura dejo de servir.
    const cfdiPrevioCancelado =
      columna(header, 'CFDI_STATUS').toUpperCase() === 'CANCELADO' ||
      columna(header, 'CFDI_CANCEL_STATUS').trim() !== '';

    // Un folio con CFDI vivo no se vuelve a timbrar: serian dos facturas
    // validas de la misma venta. Pero si el anterior quedo cancelado: se
    // puede volver a facturar, y el control de folios le da una reemision
    // nueva con su propia serie y folio.
    if (uuidPrevio && !cfdiPrevioCancelado) {
      throw new ConflictException(
        `El folio ${idFol} ya tiene CFDI (${uuidPrevio}); si hay que corregirlo, cancelalo primero.`,
      );
    }
    const pacPrevio = columna(header, 'CFDI_PAC').toUpperCase();
    if (pacPrevio && pacPrevio !== 'QUADRUM') {
      throw new ConflictException(
        `El folio ${idFol} esta marcado para ${pacPrevio}; este camino solo emite con Quadrum.`,
      );
    }

    const rfcEmisor = (
      columna(header, 'RfcEmisor') || columna(filas.sucursal, 'RFC')
    ).toUpperCase();
    if (!rfcEmisor) {
      throw new BadRequestException(
        `El folio ${idFol} no tiene RFC emisor ni en el folio ni en su sucursal.`,
      );
    }

    const ahora = new Date();
    const serie = await this.repo.reservarSerie({
      idFol,
      rfcEmisor,
      fecha: ahora,
      usuario: opciones.usuario,
    });

    let resultado: ResultadoTimbrado;
    try {
      const datos = mapearVenta(filas, {
        serie: serie.serie,
        folio: serie.folio,
        // Un minuto atras: el reloj del PAC puede ir detras del nuestro.
        fecha: fechaCfdi(new Date(ahora.getTime() - 60000)),
      });
      resultado = await this.timbrado.timbrarVenta({ ...datos, rfcEmisor });
    } catch (e) {
      await this.registrarFallo(idFol, e, opciones.usuario);
      if (e instanceof VentaInvalidaError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    if (!resultado.exitoso) {
      const detalle = this.textoIncidencias(resultado.incidencias);
      await this.liberarFolio(idFol, detalle, opciones.usuario);
      throw new UnprocessableEntityException({
        message: `El PAC rechazo el folio ${idFol}.`,
        incidencias: resultado.incidencias,
        evidencia: resultado.evidencia,
      });
    }

    const xmlPath = this.guardarXml({
      idFol,
      rfcEmisor,
      serie: serie.serie,
      folio: serie.folio,
      uuid: resultado.uuid!,
      xml: resultado.xmlTimbrado,
    });

    await this.repo.marcarTimbrado({
      idFol,
      uuid: resultado.uuid!,
      xmlPath,
    });
    await this.repo.actualizarEstadoSerie({
      idFol,
      estado: 'TIMBRADO',
      uuid: resultado.uuid,
      usuario: opciones.usuario,
    });

    this.logger.log(
      `Folio ${idFol} timbrado con Quadrum (${resultado.ambiente}): ` +
        `${serie.serie}-${serie.folio} uuid=${resultado.uuid}`,
    );

    return {
      idFol,
      serie: serie.serie,
      folio: serie.folio,
      uuid: resultado.uuid!,
      fechaTimbrado: resultado.fecha,
      pac: 'QUADRUM',
      ambiente: resultado.ambiente,
      xmlPath,
      evidencia: resultado.evidencia,
    };
  }

  // ---------------------------------------------------------------------

  private textoIncidencias(incidencias: Incidencia[]): string {
    return (
      incidencias
        .map((i) => `${i.codigoError ?? '?'}: ${i.mensajeIncidencia ?? ''}`)
        .join(' | ') || 'El PAC no acepto el comprobante.'
    );
  }

  /**
   * Rechazo con causa conocida: el folio se libera para poder corregir y
   * volver a intentar con la misma serie.
   */
  private async liberarFolio(
    idFol: string,
    mensaje: string,
    usuario?: string,
  ): Promise<void> {
    await this.repo.marcarError({ idFol, mensaje });
    await this.repo.actualizarEstadoSerie({
      idFol,
      estado: 'ERROR_EMISION',
      usuario,
      observaciones: mensaje.slice(0, 500),
    });
  }

  private async registrarFallo(
    idFol: string,
    error: unknown,
    usuario?: string,
  ): Promise<void> {
    const mensaje = error instanceof Error ? error.message : String(error);

    if (this.esResultadoIncierto(error)) {
      // NO se libera el folio: el PAC pudo haber timbrado. Hay que consultar
      // por UUID antes de reintentar, o se duplica el CFDI.
      this.logger.error(
        `Folio ${idFol}: resultado INCIERTO con el PAC. No se libera la serie. ${mensaje}`,
      );
      await this.repo.marcarError({
        idFol,
        mensaje: `RESULTADO INCIERTO, consulta el UUID antes de reintentar: ${mensaje}`,
      });
      return;
    }

    await this.liberarFolio(idFol, mensaje, usuario);
  }

  private esResultadoIncierto(error: unknown): boolean {
    const respuesta = (error as { response?: { resultadoIncierto?: boolean } })
      ?.response;
    return respuesta?.resultadoIncierto === true;
  }

  private guardarXml(input: {
    idFol: string;
    rfcEmisor: string;
    serie: string;
    folio: string;
    uuid: string;
    xml?: string;
  }): string {
    const base = resolve(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH') || 'cfdi-timbrados',
    );
    const ahora = new Date();
    const carpeta = join(
      base,
      input.rfcEmisor,
      String(ahora.getFullYear()),
      String(ahora.getMonth() + 1).padStart(2, '0'),
    );
    mkdirSync(carpeta, { recursive: true });

    const destino = join(
      carpeta,
      `${input.serie}-${input.folio}_${input.uuid}.xml`,
    );
    if (input.xml) {
      // El XML timbrado es el que se conserva 5 anios.
      writeFileSync(destino, aUtf8SinBom(input.xml));
    }
    return destino;
  }
}
