import { X509Certificate } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aUtf8SinBom } from './cfdi-node';
import { CsdService } from './csd.service';
import { CuentaPac } from './quadrum.client';
import { CsdStore } from './csd.store';
import { columna } from './venta.mapper';
import { VentaRepositorio } from './venta.repositorio';
import {
  MotivoCancelacionInvalidoError,
  MotivoValidado,
  MOTIVOS_CANCELACION,
  validarMotivo,
} from './motivo-cancelacion';
import { PacError } from './quadrum.client';
import {
  AcuseCancelacion,
  EstatusSat,
  QuadrumCancelacionClient,
} from './quadrum-cancelacion.client';
import { decodificarXmlEmbebido } from './soap-xml';

export interface CancelarCfdiInput {
  uuid: string;
  motivo: string;
  folioSustitucion?: string;
  /** RFC del receptor del CFDI que se cancela. */
  rfcReceptor: string;
  /** Total del CFDI, tal como quedo en el XML timbrado. */
  total: string;
}

export interface ResultadoCancelacion {
  solicitada: boolean;
  yaEstabaCancelado: boolean;
  /** El SAT ya trae una solicitud viva para este UUID; no se reenvia. */
  enProceso?: boolean;
  uuid: string;
  motivo: string;
  motivoDescripcion: string;
  folioSustitucion?: string;
  estatusPrevio: EstatusSat;
  /** Como quedo el CFDI tras pedir la cancelacion. */
  estatusFinal?: EstatusSat;
  /** true cuando el folio ya quedo libre para volver a facturarse. */
  refacturable?: boolean;
  acuse?: AcuseCancelacion;
  /** Carpeta con el acuse del SAT y el resultado. Nunca guarda la llave. */
  evidencia?: string;
}

/**
 * Cancelacion de CFDI con Quadrum.
 *
 * Orden que no se salta: primero `obtiene_status_sat`, luego `cancelar`.
 * Preguntar antes cuesta nada y evita mandar una solicitud que el SAT va a
 * rechazar, o cancelar dos veces un comprobante que ya estaba cancelado.
 */
@Injectable()
export class CancelacionService {
  private readonly logger = new Logger(CancelacionService.name);

  constructor(
    private readonly cliente: QuadrumCancelacionClient,
    private readonly csdStore: CsdStore,
    private readonly config: ConfigService,
    private readonly csdService: CsdService,
    private readonly repo: VentaRepositorio,
  ) {}

  ambiente(): 'PRUEBAS' | 'PRODUCCION' {
    return this.cliente.esProduccion() ? 'PRODUCCION' : 'PRUEBAS';
  }

  /** Solo lectura: dice si el CFDI se puede cancelar y como. */
  async estatus(input: { uuid: string; rfcReceptor: string; total: string }) {
    const folio = await this.repo.folioPorUuid(input.uuid);
    const rfcEmisor = folio
      ? columna(folio, 'RfcEmisor').toUpperCase() || this.rfcEmisor()
      : this.rfcEmisor();
    const cuentaPac = await this.cuentaDe(rfcEmisor);

    const estatus = await this.ejecutar(() =>
      this.cliente.estatusSat({
        uuid: input.uuid,
        rfcEmisor,
        cuenta: cuentaPac,
        rfcReceptor: input.rfcReceptor,
        total: input.total,
      }),
    );
    await this.sincronizarFolio(folio, estatus.estado);

    return {
      uuid: input.uuid,
      ambiente: this.ambiente(),
      ...estatus,
      requiereAceptacion: /con aceptaci/i.test(estatus.esCancelable ?? ''),
      cancelable: !/no cancelable/i.test(estatus.esCancelable ?? ''),
    };
  }

  async cancelar(input: CancelarCfdiInput): Promise<ResultadoCancelacion> {
    let validado: MotivoValidado;
    try {
      validado = validarMotivo(input.motivo, input.folioSustitucion);
    } catch (e) {
      if (e instanceof MotivoCancelacionInvalidoError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    if (this.cliente.esProduccion()) {
      throw new ForbiddenException(
        'El endpoint de cancelacion apunta a produccion. Este camino solo cancela en el ambiente de pruebas.',
      );
    }

    // El folio manda: se cancela con el CSD de SU razon social. Si el UUID
    // no es de aqui se cae al CSD del .env, que es el caso de las pruebas.
    const folio = await this.repo.folioPorUuid(input.uuid);
    const rfcEmisor = folio
      ? columna(folio, 'RfcEmisor').toUpperCase() || this.rfcEmisor()
      : this.rfcEmisor();
    const cuentaPac = await this.cuentaDe(rfcEmisor);

    const estatusPrevio = await this.ejecutar(() =>
      this.cliente.estatusSat({
        uuid: input.uuid,
        rfcEmisor,
        cuenta: cuentaPac,
        rfcReceptor: input.rfcReceptor,
        total: input.total,
      }),
    );

    const base = {
      uuid: input.uuid,
      motivo: validado.motivo,
      motivoDescripcion: MOTIVOS_CANCELACION[validado.motivo],
      folioSustitucion: validado.folioSustitucion,
      estatusPrevio,
    };

    if (/^cancelado/i.test(estatusPrevio.estado ?? '')) {
      // No es un error: el resultado que el usuario queria ya es el actual.
      return { ...base, solicitada: false, yaEstabaCancelado: true };
    }
    if (/en proceso/i.test(estatusPrevio.estatusCancelacion ?? '')) {
      // El SAT ya tiene una solicitud viva para este UUID. Reenviarla no la
      // acelera y ensucia el historial: hay que esperar el acuse. Pasa siempre
      // entre la solicitud y el cambio a "Cancelado", que no es inmediato.
      return {
        ...base,
        solicitada: false,
        yaEstabaCancelado: false,
        enProceso: true,
      };
    }
    if (/no cancelable/i.test(estatusPrevio.esCancelable ?? '')) {
      throw new ConflictException(
        `El SAT reporta el CFDI como '${estatusPrevio.esCancelable}' ` +
          `(estado: ${estatusPrevio.estado ?? 'desconocido'}). No se envio la cancelacion.`,
      );
    }

    const credenciales = await this.credenciales(rfcEmisor);
    const acuse = await this.ejecutar(() =>
      this.cliente.cancelar({
        uuid: input.uuid,
        motivo: validado.motivo,
        folioSustitucion: validado.folioSustitucion,
        rfcEmisor,
        ...credenciales,
      }),
    );

    const evidencia = this.guardarEvidencia(input.uuid, acuse, base);

    this.logger.log(
      `Cancelacion ${acuse.exitoso ? 'aceptada' : 'NO aceptada'} en ${this.ambiente()}: ` +
        `uuid=${input.uuid} motivo=${validado.motivo} ` +
        `estatus=${acuse.folios.map((f) => f.estatusUUID).join(',') || '-'}`,
    );

    // El folio tiene que enterarse: si no, la pantalla lo seguiria
    // mostrando como facturado y vigente.
    let estatusFinal = estatusPrevio;
    if (folio && acuse.exitoso) {
      await this.repo.marcarCancelacionSolicitada(columna(folio, 'IDFOL'));

      // Se vuelve a preguntar en el acto: cuando la factura era "cancelable
      // sin aceptacion" el SAT suele darla por cancelada enseguida, y asi el
      // folio queda listo para refacturarse sin un paso extra. Si todavia
      // dice "en proceso", se queda pendiente y se resolvera al consultar.
      try {
        estatusFinal = await this.ejecutar(() =>
          this.cliente.estatusSat({
            uuid: input.uuid,
            rfcEmisor,
            rfcReceptor: input.rfcReceptor,
            total: input.total,
          }),
        );
        await this.sincronizarFolio(folio, estatusFinal.estado);
      } catch (e) {
        // Que falle la consulta no invalida la cancelacion ya solicitada.
        const detalle = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `Cancelacion solicitada pero no se pudo confirmar el estatus: ${detalle}`,
        );
      }
    }

    return {
      ...base,
      solicitada: true,
      yaEstabaCancelado: false,
      estatusFinal,
      /** true cuando el folio ya quedo libre para volver a facturarse. */
      refacturable: /^cancelado/i.test(estatusFinal.estado ?? String()),
      acuse,
      evidencia,
    };
  }

  /**
   * Si el SAT ya reporta el CFDI como cancelado, el folio se pone al dia.
   *
   * Solo baja de "vigente" a "cancelado": nunca al reves, porque un CFDI
   * cancelado no vuelve a estar vigente.
   */
  private async sincronizarFolio(
    folio: Record<string, unknown> | null,
    estadoSat: string | undefined,
  ): Promise<void> {
    if (!folio || !/^cancelado/i.test(estadoSat ?? String())) return;
    const idFol = columna(folio, 'IDFOL');
    if (columna(folio, 'CFDI_STATUS').toUpperCase() === 'CANCELADO') return;
    await this.repo.marcarCancelado(idFol);
    this.logger.log(
      `Folio ${idFol} marcado como CANCELADO: el SAT lo confirmo.`,
    );
  }

  /** Acuse del SAT de una cancelacion ya solicitada. */
  async acuse(uuid: string) {
    const rfcEmisor = this.rfcEmisor();
    const cuenta = await this.cuentaDe(rfcEmisor);
    return this.ejecutar(() => this.cliente.acuse({ uuid, rfcEmisor, cuenta }));
  }

  // ---------------------------------------------------------------------

  /**
   * El `/cancelar` de Quadrum lee cer y key como texto: van en PEM, no DER.
   *
   * Se busca primero el CSD cargado para ese RFC; si no hay (por ejemplo en
   * las pruebas con el certificado del .env), se usa ese.
   */
  private async credenciales(
    rfcEmisor: string,
  ): Promise<{ cer: Buffer; key: Buffer; cuenta?: CuentaPac }> {
    try {
      const emisor = await this.csdService.obtenerPorRfc(rfcEmisor);
      return {
        cuenta: emisor.credencialesPac,
        cer: Buffer.from(
          new X509Certificate(
            Buffer.from(emisor.csd.certificadoBase64, 'base64'),
          ).toString(),
          'utf8',
        ),
        key: Buffer.from(
          emisor.csd.llavePrivada.export({
            type: 'pkcs8',
            format: 'pem',
          }) as string,
          'utf8',
        ),
      };
    } catch {
      return {
        cer: this.csdStore.certificadoPem(),
        key: this.csdStore.llavePrivadaPem(),
      };
    }
  }

  /**
   * Cuenta del PAC de ese RFC, si la tiene dada de alta.
   *
   * Sin ella el cliente cae a la del .env, que es como trabajaba antes de
   * que cada razon social tuviera la suya.
   */
  private async cuentaDe(rfcEmisor: string): Promise<CuentaPac | undefined> {
    try {
      return (await this.csdService.obtenerPorRfc(rfcEmisor)).credencialesPac;
    } catch {
      return undefined;
    }
  }

  private rfcEmisor(): string {
    const rfc = this.csdStore.obtener().rfc;
    if (!rfc) {
      throw new BadRequestException(
        'El certificado no trae RFC en el subject; no se puede cancelar.',
      );
    }
    return rfc;
  }

  /** Traduce los errores del PAC a respuestas HTTP con el matiz que importa. */
  private async ejecutar<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (e) {
      if (e instanceof PacError) {
        throw new BadGatewayException({
          message: e.message,
          resultadoIncierto: e.resultadoIncierto,
        });
      }
      throw e;
    }
  }

  private guardarEvidencia(
    uuid: string,
    acuse: AcuseCancelacion,
    base: Record<string, unknown>,
  ): string {
    const raiz = resolve(
      this.config.get<string>('CFDI_EVIDENCIA_DIR') || 'cfdi-timbrados',
    );
    const sello = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..*$/, '');
    const carpeta = join(raiz, 'cancelaciones', `${sello}_${uuid}`);
    mkdirSync(carpeta, { recursive: true });

    if (acuse.acuse) {
      writeFileSync(
        join(carpeta, 'acuse-sat.xml'),
        aUtf8SinBom(decodificarXmlEmbebido(acuse.acuse)),
      );
    }
    // El `.cer` y la llave NUNCA se escriben aqui.
    writeFileSync(
      join(carpeta, 'resultado.json'),
      JSON.stringify(
        { ...base, acuse: { ...acuse, acuse: undefined } },
        null,
        2,
      ),
    );
    return carpeta;
  }
}
