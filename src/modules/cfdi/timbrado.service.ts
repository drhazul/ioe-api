import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  aUtf8SinBom,
  CfdiNode,
  descendientes,
  serializarXml,
  SerializarOpciones,
} from './cfdi-node';
import { Csd, sellar, verificarSello } from './cfdi-sellador';
import {
  ComprobanteInvalidoError,
  construirComprobante,
  DatosComprobante,
} from './comprobante';
import {
  comprobantePrueba,
  facturaPpdPrueba,
  notaCreditoPrueba,
  RECEPTOR_PRUEBA_SAT,
  ReceptorPrueba,
  ReciboPagoPruebaInput,
  reciboPagoPrueba,
} from './comprobante-prueba';
import { CsdService } from './csd.service';
import { CsdStore, ResumenCsd } from './csd.store';
import { fechaCfdi } from './fecha-expedicion';
import {
  CuentaPac,
  Incidencia,
  PacError,
  QuadrumClient,
} from './quadrum.client';
import { decodificarXmlEmbebido } from './soap-xml';

export const OPCIONES_XML_CFDI40: SerializarOpciones = {
  namespaces: {
    cfdi: 'http://www.sat.gob.mx/cfd/4',
    xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  },
  schemaLocation:
    'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
};

/**
 * Opciones de serializacion segun lo que traiga el comprobante. Cada
 * complemento declara su namespace y su XSD en la raiz, o el PAC rechaza.
 */
export function opcionesXml(comprobante: CfdiNode): SerializarOpciones {
  if (!descendientes(comprobante, 'pago20:Pagos').length) {
    return OPCIONES_XML_CFDI40;
  }
  return {
    namespaces: {
      ...OPCIONES_XML_CFDI40.namespaces,
      pago20: 'http://www.sat.gob.mx/Pagos20',
    },
    schemaLocation:
      `${OPCIONES_XML_CFDI40.schemaLocation} ` +
      'http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd',
  };
}

/**
 * Una venta lista para facturar. El emisor NO se captura: se identifica por
 * su RFC y sus datos salen del CSD cargado en FACT_CSD.
 */
export type DatosVenta = Omit<DatosComprobante, 'emisor'> & {
  rfcEmisor: string;
};

/** Certificado con el que se sella un comprobante. */
export interface CredencialesSellado {
  csd: Csd;
  cer: Buffer;
  /**
   * Cuenta de Quadrum de esa razon social.
   *
   * Va aqui y no por separado porque el certificado y la cuenta son del
   * mismo contrato: sellar con un CSD y timbrar con la cuenta de otro RFC
   * es un error que el PAC rechaza.
   */
  cuentaPac?: CuentaPac;
}

/** Datos del abono para el recibo de pago de prueba. */
export type DatosPagoPrueba = Pick<
  ReciboPagoPruebaInput,
  | 'uuidFactura'
  | 'serieFactura'
  | 'folioFactura'
  | 'monto'
  | 'parcialidad'
  | 'saldoAnterior'
>;

/** UUID que no existe: sirve para probar conexion y credenciales sin gastar timbre. */
const UUID_INEXISTENTE = '00000000-0000-0000-0000-000000000000';

export type Ambiente = 'PRUEBAS' | 'PRODUCCION';

export interface ComprobanteListo {
  noCertificado: string;
  cadena: string;
  sello: string;
  xml: string;
  /** Lo que se envia al PAC: UTF-8 sin BOM, byte a byte lo que se sello. */
  bytes: Buffer;
}

export interface ResultadoTimbrado {
  exitoso: boolean;
  uuid?: string;
  fecha?: string;
  codEstatus?: string;
  incidencias: Incidencia[];
  ambiente: Ambiente;
  /** Carpeta local con enviado.xml, cadena.txt, acuse.json y timbrado.xml. */
  evidencia: string;
  xmlTimbrado?: string;
}

/**
 * Sella y timbra con Quadrum.
 *
 * Esta etapa solo timbra el comprobante de prueba y se niega a hacerlo contra
 * produccion. Conectarlo a `facturacion.service.ts` (con `toComprobante()` y
 * la bandera `CFDI_PAC`) es el paso siguiente.
 */
@Injectable()
export class TimbradoService {
  private readonly logger = new Logger(TimbradoService.name);

  constructor(
    private readonly quadrum: QuadrumClient,
    private readonly csdStore: CsdStore,
    private readonly config: ConfigService,
    private readonly csdService: CsdService,
  ) {}

  ambiente(): Ambiente {
    return this.quadrum.esProduccion() ? 'PRODUCCION' : 'PRUEBAS';
  }

  async estado() {
    let csd: ResumenCsd | { error: string };
    try {
      csd = this.csdStore.resumen();
    } catch (e) {
      csd = { error: e instanceof Error ? e.message : String(e) };
    }

    return {
      csd,
      pac: {
        endpoint: this.quadrum.getEndpoint(),
        ambiente: this.ambiente(),
        credenciales: this.quadrum.hasCredentials(),
        conexion: await this.probarConexion(),
      },
    };
  }

  comprobanteDePrueba(ahora: Date = new Date()): CfdiNode {
    return comprobantePrueba(this.datosPrueba(ahora));
  }

  /** Nota de credito (egreso) de prueba que acredita la factura indicada. */
  notaCreditoDePrueba(
    uuidRelacionado: string,
    cantidadDevuelta?: number,
    ahora: Date = new Date(),
  ): CfdiNode {
    try {
      return notaCreditoPrueba({
        ...this.datosPrueba(ahora),
        uuidRelacionado,
        cantidadDevuelta,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : e);
    }
  }

  private datosPrueba(ahora: Date) {
    const csd = this.csdStore.obtener();
    if (!csd.rfc || !csd.razonSocial) {
      throw new ServiceUnavailableException(
        'El certificado no trae RFC o razon social en el subject.',
      );
    }
    return {
      rfcEmisor: csd.rfc,
      nombreEmisor: csd.razonSocial,
      lugarExpedicion:
        this.config.get<string>('CFDI_LUGAR_EXPEDICION') || '39000',
      // Un minuto atras: si el reloj del PAC va unos segundos detras del
      // nuestro, una fecha "futura" es rechazo seguro.
      fecha: fechaCfdi(new Date(ahora.getTime() - 60000)),
      folio: String(ahora.getTime()),
    };
  }

  /**
   * Sella y verifica. No sale a internet ni gasta timbre.
   *
   * Sin credenciales usa el CSD del `.env` (el de las pruebas). Las ventas
   * reales pasan el certificado de SU razon social.
   */
  sellarComprobante(
    comprobante: CfdiNode,
    credenciales?: CredencialesSellado,
  ): ComprobanteListo {
    const csd = credenciales?.csd ?? this.csdStore.obtener();
    const cer = credenciales?.cer ?? this.csdStore.certificadoDer();
    const sellado = sellar(comprobante, csd);

    // Ultima barrera antes de gastar un timbre: si el sello no valida aqui,
    // el PAC tambien lo rechaza, y aqui si se sabe por que.
    if (!verificarSello(sellado, cer)) {
      throw new InternalServerErrorException(
        'El sello generado no valida contra el certificado; no se envia al PAC.',
      );
    }

    const xml = serializarXml(
      sellado.comprobante,
      opcionesXml(sellado.comprobante),
    );
    return {
      noCertificado: sellado.noCertificado,
      cadena: sellado.cadena,
      sello: sellado.sello,
      xml,
      bytes: aUtf8SinBom(xml),
    };
  }

  sellarPrueba() {
    const listo = this.sellarComprobante(this.comprobanteDePrueba());
    return {
      noCertificado: listo.noCertificado,
      cadena: listo.cadena,
      sello: listo.sello,
      xml: listo.xml,
      selloVerificado: true,
    };
  }

  timbrarPrueba(): Promise<ResultadoTimbrado> {
    return this.timbrar(this.comprobanteDePrueba());
  }

  /** Timbra una nota de credito de prueba contra la factura indicada. */
  timbrarNotaCreditoPrueba(
    uuidRelacionado: string,
    cantidadDevuelta?: number,
  ): Promise<ResultadoTimbrado> {
    return this.timbrar(
      this.notaCreditoDePrueba(uuidRelacionado, cantidadDevuelta),
    );
  }

  /** Factura a credito (PPD, forma de pago 99) de prueba: la que se paga con un REP. */
  facturaPpdDePrueba(ahora: Date = new Date()): CfdiNode {
    return facturaPpdPrueba({
      ...this.datosPrueba(ahora),
      receptor: this.receptorPrueba(),
    });
  }

  timbrarFacturaPpdPrueba(): Promise<ResultadoTimbrado> {
    return this.timbrar(this.facturaPpdDePrueba());
  }

  /** Recibo electronico de pago (CFDI tipo P) de prueba por un abono a una factura PPD. */
  reciboPagoDePrueba(
    pago: DatosPagoPrueba,
    ahora: Date = new Date(),
  ): CfdiNode {
    try {
      return reciboPagoPrueba({
        ...this.datosPrueba(ahora),
        receptor: this.receptorPrueba(),
        ...pago,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : e);
    }
  }

  timbrarReciboPagoPrueba(pago: DatosPagoPrueba): Promise<ResultadoTimbrado> {
    return this.timbrar(this.reciboPagoDePrueba(pago));
  }

  /**
   * Receptor con RFC propio para las pruebas de credito. Si Quadrum rechaza el
   * nombre, CP o regimen, se corrigen en el .env sin tocar codigo.
   */
  private receptorPrueba(): ReceptorPrueba {
    const env = (clave: string) => this.config.get<string>(clave);
    return {
      rfc: env('CFDI_PRUEBA_RECEPTOR_RFC') || RECEPTOR_PRUEBA_SAT.rfc,
      nombre: env('CFDI_PRUEBA_RECEPTOR_NOMBRE') || RECEPTOR_PRUEBA_SAT.nombre,
      domicilioFiscal:
        env('CFDI_PRUEBA_RECEPTOR_CP') || RECEPTOR_PRUEBA_SAT.domicilioFiscal,
      regimenFiscal:
        env('CFDI_PRUEBA_RECEPTOR_REGIMEN') ||
        RECEPTOR_PRUEBA_SAT.regimenFiscal,
    };
  }

  /**
   * Arma el CFDI de una venta con el CSD de su emisor.
   *
   * El nombre, el regimen y el lugar de expedicion NO vienen de la venta:
   * salen del certificado y de FACT_CSD, que es la fuente confiable.
   */
  async comprobanteDeVenta(
    datos: DatosVenta,
  ): Promise<{ comprobante: CfdiNode; credenciales: CredencialesSellado }> {
    const { rfcEmisor, ...resto } = datos;
    const emisor = await this.csdService.obtenerPorRfc(rfcEmisor);

    try {
      const comprobante = construirComprobante({
        ...resto,
        emisor: {
          rfc: emisor.csd.rfc ?? rfcEmisor,
          nombre: emisor.csd.razonSocial ?? '',
          regimenFiscal: emisor.regimenFiscal,
          lugarExpedicion: emisor.codigoPostal,
        },
      });
      return {
        comprobante,
        credenciales: {
          csd: emisor.csd,
          cer: emisor.cer,
          cuentaPac: emisor.credencialesPac,
        },
      };
    } catch (e) {
      if (e instanceof ComprobanteInvalidoError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /**
   * Sella un comprobante YA armado, sin pasar por `construirComprobante`.
   *
   * Lo necesitan los REP: su estructura no se parece a la de una factura y
   * se arma con su propio constructor.
   */
  async sellarNodo(
    comprobante: CfdiNode,
    rfcEmisor: string,
  ): Promise<{ cadena: string; sello: string; xml: string }> {
    const emisor = await this.csdService.obtenerPorRfc(rfcEmisor);
    return this.sellarComprobante(comprobante, {
      csd: emisor.csd,
      cer: emisor.cer,
    });
  }

  /** Sella un comprobante ya armado y lo timbra. */
  async timbrarNodo(
    comprobante: CfdiNode,
    rfcEmisor: string,
  ): Promise<ResultadoTimbrado> {
    const emisor = await this.csdService.obtenerPorRfc(rfcEmisor);
    return this.timbrar(comprobante, {
      csd: emisor.csd,
      cer: emisor.cer,
      cuentaPac: emisor.credencialesPac,
    });
  }

  /**
   * Arma y sella un comprobante con el CSD de ese RFC, SIN llamar al PAC.
   *
   * Es la simulacion: sirve para ver si el comprobante pasaria las reglas y
   * si el sello cuadra, sin gastar un timbre ni dejar rastro.
   */
  async sellarComprobanteDe(
    datos: DatosComprobante,
    rfcEmisor: string,
  ): Promise<{ cadena: string; sello: string; xml: string; total: string }> {
    const emisor = await this.csdService.obtenerPorRfc(rfcEmisor);

    let comprobante: CfdiNode;
    try {
      comprobante = construirComprobante({
        ...datos,
        emisor: {
          rfc: emisor.csd.rfc ?? rfcEmisor,
          nombre: emisor.csd.razonSocial ?? '',
          regimenFiscal: emisor.regimenFiscal,
          lugarExpedicion: emisor.codigoPostal,
        },
      });
    } catch (e) {
      if (e instanceof ComprobanteInvalidoError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const listo = this.sellarComprobante(comprobante, {
      csd: emisor.csd,
      cer: emisor.cer,
    });
    return { ...listo, total: comprobante.attrs.get('Total') ?? '' };
  }

  /**
   * Timbra un comprobante ya armado, sellando con el CSD de ese RFC.
   *
   * El emisor que venga en `datos` se ignora a proposito: manda el del
   * certificado, que es con el que se firma. Devuelve ademas el total que
   * calculo el constructor, para no recalcularlo por fuera y arriesgar que
   * no cuadre.
   */
  async timbrarComprobante(
    datos: DatosComprobante,
    rfcEmisor: string,
  ): Promise<ResultadoTimbrado & { total: string }> {
    const emisor = await this.csdService.obtenerPorRfc(rfcEmisor);

    let comprobante: CfdiNode;
    try {
      comprobante = construirComprobante({
        ...datos,
        emisor: {
          rfc: emisor.csd.rfc ?? rfcEmisor,
          nombre: emisor.csd.razonSocial ?? '',
          regimenFiscal: emisor.regimenFiscal,
          lugarExpedicion: emisor.codigoPostal,
        },
      });
    } catch (e) {
      if (e instanceof ComprobanteInvalidoError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const resultado = await this.timbrar(comprobante, {
      csd: emisor.csd,
      cer: emisor.cer,
      cuentaPac: emisor.credencialesPac,
    });
    return { ...resultado, total: comprobante.attrs.get('Total') ?? '' };
  }

  /** Sella con el CSD del emisor de la venta y timbra. */
  async timbrarVenta(datos: DatosVenta): Promise<ResultadoTimbrado> {
    const { comprobante, credenciales } = await this.comprobanteDeVenta(datos);
    return this.timbrar(comprobante, credenciales);
  }

  async timbrar(
    comprobante: CfdiNode,
    credenciales?: CredencialesSellado,
  ): Promise<ResultadoTimbrado> {
    if (this.quadrum.esProduccion()) {
      throw new ForbiddenException(
        'QUADRUM_ENDPOINT apunta a produccion. Este camino solo timbra en el ambiente de pruebas.',
      );
    }

    const listo = this.sellarComprobante(comprobante, credenciales);
    const carpeta = this.crearCarpetaEvidencia(comprobante);
    writeFileSync(join(carpeta, 'enviado.xml'), listo.bytes);
    writeFileSync(join(carpeta, 'cadena.txt'), aUtf8SinBom(listo.cadena));

    let acuse: Awaited<ReturnType<QuadrumClient['timbrar']>>;
    try {
      acuse = await this.quadrum.timbrar(listo.bytes, credenciales?.cuentaPac);
    } catch (e) {
      if (!(e instanceof PacError)) throw e;
      writeFileSync(
        join(carpeta, 'error.json'),
        JSON.stringify(
          { mensaje: e.message, resultadoIncierto: e.resultadoIncierto },
          null,
          2,
        ),
      );
      // Resultado incierto: NO se reintenta. El PAC pudo haber timbrado;
      // quien llame debe consultar antes de volver a enviar.
      throw new BadGatewayException({
        message: e.message,
        resultadoIncierto: e.resultadoIncierto,
        evidencia: carpeta,
      });
    }

    const xmlTimbrado = acuse.xml
      ? decodificarXmlEmbebido(acuse.xml)
      : undefined;
    if (xmlTimbrado) {
      writeFileSync(join(carpeta, 'timbrado.xml'), aUtf8SinBom(xmlTimbrado));
    }
    writeFileSync(
      join(carpeta, 'acuse.json'),
      JSON.stringify({ ...acuse, xml: undefined }, null, 2),
    );

    this.logger.log(
      `Timbrado ${acuse.exitoso ? 'OK' : 'con incidencias'} en ${this.ambiente()}: ` +
        `uuid=${acuse.uuid ?? '-'} evidencia=${carpeta}`,
    );

    return {
      exitoso: acuse.exitoso,
      uuid: acuse.uuid,
      fecha: acuse.fecha,
      codEstatus: acuse.codEstatus,
      incidencias: acuse.incidencias,
      ambiente: this.ambiente(),
      evidencia: carpeta,
      xmlTimbrado,
    };
  }

  async consultar(uuid: string) {
    try {
      return await this.quadrum.consultar(uuid);
    } catch (e) {
      if (e instanceof PacError && !e.resultadoIncierto) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof PacError) {
        throw new BadGatewayException({
          message: e.message,
          resultadoIncierto: true,
        });
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------------

  private async probarConexion(): Promise<{
    ok: boolean;
    mensaje: string;
    ms: number;
  }> {
    if (!this.quadrum.hasCredentials()) {
      return {
        ok: false,
        mensaje: 'Faltan QUADRUM_USUARIO / QUADRUM_CONTRASENA',
        ms: 0,
      };
    }
    const t0 = Date.now();
    try {
      await this.quadrum.consultar(UUID_INEXISTENTE);
      return {
        ok: true,
        mensaje: 'El PAC respondio en consultaResult',
        ms: Date.now() - t0,
      };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // Para un UUID inexistente Quadrum contesta un Fault "No econtre
      // informacion de la factura." (el typo es de ellos). Eso prueba que la
      // conexion, el sobre y las credenciales sirven.
      const ok =
        e instanceof PacError &&
        !e.resultadoIncierto &&
        /no\s+e?ncontre|informacion de la factura/i.test(mensaje);
      return { ok, mensaje, ms: Date.now() - t0 };
    }
  }

  private crearCarpetaEvidencia(comprobante: CfdiNode): string {
    const base = resolve(
      this.config.get<string>('CFDI_EVIDENCIA_DIR') || 'cfdi-timbrados',
    );
    const sello = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..*$/, '');
    const serie = comprobante.attrs.get('Serie') ?? 'SIN-SERIE';
    const folio = comprobante.attrs.get('Folio') ?? 'SIN-FOLIO';
    const carpeta = join(base, `${sello}_${serie}-${folio}`);
    mkdirSync(carpeta, { recursive: true });
    return carpeta;
  }
}
