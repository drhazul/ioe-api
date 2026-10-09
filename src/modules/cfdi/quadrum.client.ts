import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { elementos, escaparTexto, existe, valor } from './soap-xml';

/**
 * Cliente SOAP del PAC Quadrum.
 *
 * El contrato se extrajo de `QuadrumSoapClient.cs` del modulo portable, que a
 * su vez lo escribio a mano desde el WSDL. Es document/literal con tres campos;
 * el sobre es trivial y no hace falta ninguna libreria SOAP.
 *
 *   POST <endpoint>
 *   Content-Type: text/xml; charset=utf-8
 *   SOAPAction: "timbrar"
 *
 *   <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 *     <soapenv:Header/>
 *     <soapenv:Body>
 *       <tim:timbrar xmlns:tim="http://ws.cfdiquadrum.com.mx/timbrar">
 *         <tim:xml>BASE64 DEL XML SELLADO</tim:xml>
 *         <tim:usuario>...</tim:usuario>
 *         <tim:contrasena>...</tim:contrasena>
 *       </tim:timbrar>
 *     </soapenv:Body>
 *   </soapenv:Envelope>
 */

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_TIMBRAR = 'http://ws.cfdiquadrum.com.mx/timbrar';

/**
 * Cuenta del PAC con la que se hace una llamada.
 *
 * Cada razon social tiene la suya, dada de alta junto con su certificado.
 * Cuando no se pasa ninguna se usa la del .env.
 */
export interface CuentaPac {
  usuario: string;
  contrasena: string;
}
export interface Incidencia {
  idIncidencia?: string;
  rfcEmisor?: string;
  uuid?: string;
  codigoError?: string;
  mensajeIncidencia?: string;
  extraInfo?: string;
  workProcessId?: string;
  noCertificadoPac?: string;
  fechaRegistro?: string;
}

export interface AcuseRecepcionCfdi {
  /** XML ya timbrado que devuelve el PAC. Esto es lo que se conserva 5 años. */
  xml?: string;
  uuid?: string;
  fecha?: string;
  codEstatus?: string;
  selloSAT?: string;
  noCertificadoSAT?: string;
  faultCode?: string;
  faultString?: string;
  incidencias: Incidencia[];
  /** `true` si trae UUID y no hay incidencias. */
  exitoso: boolean;
}

/** Error del PAC. Se distingue del resto para poder decidir si se reintenta. */
export class PacError extends Error {
  constructor(
    message: string,
    /**
     * `true` cuando NO se sabe si el PAC llego a timbrar (timeout, corte de
     * red). En ese caso esta PROHIBIDO reintentar a ciegas: hay que consultar
     * por UUID primero, o se duplica el CFDI y se quema un timbre.
     */
    readonly resultadoIncierto = false,
  ) {
    super(message);
    this.name = 'PacError';
  }
}

@Injectable()
export class QuadrumClient {
  private readonly logger = new Logger(QuadrumClient.name);

  constructor(private readonly config: ConfigService) {}

  getEndpoint(): string {
    return (
      this.config.get<string>('QUADRUM_ENDPOINT') ||
      'https://devws.cfdiquadrum.com.mx/timbrar'
    );
  }

  private getUsuario(cuenta?: CuentaPac): string {
    return (
      cuenta?.usuario?.trim() ||
      this.config.get<string>('QUADRUM_USUARIO') ||
      ''
    );
  }

  private getContrasena(cuenta?: CuentaPac): string {
    return (
      cuenta?.contrasena || this.config.get<string>('QUADRUM_CONTRASENA') || ''
    );
  }

  private getTimeoutMs(): number {
    const n = Number(this.config.get<string>('QUADRUM_TIMEOUT_MS') ?? 60000);
    return Number.isFinite(n) && n > 0 ? n : 60000;
  }

  /**
   * `true` si el endpoint apunta a produccion.
   *
   * Misma heuristica que el modulo C#: el ambiente de pruebas de Quadrum vive
   * en `devws.`. Sirve para que los logs digan en que ambiente se timbro.
   */
  esProduccion(): boolean {
    return !/dev/i.test(this.getEndpoint());
  }

  hasCredentials(cuenta?: CuentaPac): boolean {
    return Boolean(this.getUsuario(cuenta) && this.getContrasena(cuenta));
  }

  assertCredentials(cuenta?: CuentaPac): void {
    if (!this.hasCredentials(cuenta)) {
      throw new ServiceUnavailableException(
        'Quadrum no configurado: ese RFC no tiene cuenta del PAC y tampoco ' +
          'hay QUADRUM_USUARIO/QUADRUM_CONTRASENA en el .env.',
      );
    }
  }

  /**
   * Envia un CFDI sellado al PAC para que lo timbre.
   *
   * @param xmlSellado XML completo y ya sellado, en UTF-8 **sin BOM**.
   */
  async timbrar(
    xmlSellado: Buffer,
    cuenta?: CuentaPac,
  ): Promise<AcuseRecepcionCfdi> {
    if (!xmlSellado?.length) {
      throw new Error('El XML sellado viene vacio.');
    }
    this.assertCredentials(cuenta);

    // Timbrar en produccion gasta un timbre real y genera un CFDI ante el SAT
    // que ya solo se puede cancelar. Que quede en el log en que ambiente fue.
    if (this.esProduccion()) {
      this.logger.warn(
        `Timbrando contra PRODUCCION (${this.getEndpoint()}) — se consumira un timbre real.`,
      );
    }

    const cuerpo =
      `<tim:timbrar xmlns:tim="${NS_TIMBRAR}">` +
      `<tim:xml>${xmlSellado.toString('base64')}</tim:xml>` +
      `<tim:usuario>${escaparTexto(this.getUsuario(cuenta))}</tim:usuario>` +
      `<tim:contrasena>${escaparTexto(this.getContrasena(cuenta))}</tim:contrasena>` +
      `</tim:timbrar>`;

    return this.enviar('timbrar', cuerpo, 'timbrarResult');
  }

  /**
   * Consulta el estado de un CFDI por UUID.
   *
   * Es la operacion obligatoria despues de un timeout: si `timbrar` truena por
   * tiempo agotado, el PAC PUDO haber timbrado. Reintentar sin consultar
   * duplica el comprobante.
   *
   * Tambien es la forma mas barata de verificar la conexion con el PAC: no
   * necesita CSD ni XML sellado, solo credenciales.
   */
  async consultar(
    uuid: string,
    cuenta?: CuentaPac,
  ): Promise<AcuseRecepcionCfdi> {
    if (!uuid?.trim()) {
      throw new Error('UUID requerido.');
    }
    this.assertCredentials(cuenta);

    const cuerpo =
      `<tim:consulta xmlns:tim="${NS_TIMBRAR}">` +
      `<tim:usuario>${escaparTexto(this.getUsuario(cuenta))}</tim:usuario>` +
      `<tim:contrasena>${escaparTexto(this.getContrasena(cuenta))}</tim:contrasena>` +
      `<tim:uuid>${escaparTexto(uuid.trim())}</tim:uuid>` +
      `</tim:consulta>`;

    return this.enviar('consulta', cuerpo, 'consultaResult');
  }

  /**
   * Representacion impresa del CFDI, generada por el PAC a partir del UUID.
   *
   * Ojo: esta operacion usa `username`/`password`, no `usuario`/`contrasena`
   * como las demas. Asi viene en el WSDL.
   */
  async obtenerPdf(
    uuid: string,
    rfcEmisor: string,
    cuenta?: CuentaPac,
  ): Promise<Buffer> {
    if (!uuid?.trim()) {
      throw new Error('Falta el UUID para pedir el PDF.');
    }
    this.assertCredentials(cuenta);

    const cuerpo =
      `<tim:obtener_pdf xmlns:tim="${NS_TIMBRAR}">` +
      `<tim:username>${escaparTexto(this.getUsuario(cuenta))}</tim:username>` +
      `<tim:password>${escaparTexto(this.getContrasena(cuenta))}</tim:password>` +
      `<tim:uuid>${escaparTexto(uuid.trim())}</tim:uuid>` +
      `<tim:rfc_emisor>${escaparTexto(rfcEmisor.trim().toUpperCase())}</tim:rfc_emisor>` +
      `</tim:obtener_pdf>`;

    const respuesta = await this.enviarTexto('obtener_pdf', cuerpo);

    const error = valor(respuesta, 'error');
    if (error?.trim()) {
      throw new PacError(`El PAC no genero el PDF: ${error.trim()}`, false);
    }

    const base64 = valor(respuesta, 'pdf');
    if (!base64?.trim()) {
      throw new PacError('El PAC respondio sin PDF y sin error.', false);
    }
    return Buffer.from(base64.trim(), 'base64');
  }

  // ---------------------------------------------------------------------

  private async enviar(
    soapAction: string,
    cuerpo: string,
    nombreResultado: string,
  ): Promise<AcuseRecepcionCfdi> {
    return this.parsear(
      await this.enviarTexto(soapAction, cuerpo),
      nombreResultado,
    );
  }

  /** Manda el sobre y devuelve la respuesta tal cual, sin interpretarla. */
  private async enviarTexto(
    soapAction: string,
    cuerpo: string,
  ): Promise<string> {
    const sobre =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}">` +
      `<soapenv:Header/>` +
      `<soapenv:Body>${cuerpo}</soapenv:Body>` +
      `</soapenv:Envelope>`;

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), this.getTimeoutMs());

    let respuestaTexto: string;
    let status: number;
    try {
      const resp = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${soapAction}"`,
        },
        body: sobre,
        signal: control.signal,
      });
      status = resp.status;
      respuestaTexto = await resp.text();
    } catch (e) {
      const abortado = control.signal.aborted;
      const detalle = e instanceof Error ? e.message : String(e);
      throw new PacError(
        abortado
          ? `Se agoto el tiempo de espera con el PAC (${this.getTimeoutMs()} ms). ` +
              `IMPORTANTE: el timbre pudo haberse consumido; consulta por UUID antes de reintentar.`
          : `Error de comunicacion con el PAC: ${detalle}`,
        true, // En ambos casos el resultado es incierto.
      );
    } finally {
      clearTimeout(reloj);
    }

    // Un SOAP Fault llega con HTTP 500 y cuerpo util: hay que leerlo, no
    // descartarlo por el codigo de estado.
    if (!respuestaTexto?.trim()) {
      throw new PacError(`El PAC respondio ${status} sin cuerpo.`, true);
    }

    return respuestaTexto;
  }

  private parsear(xml: string, nombreResultado: string): AcuseRecepcionCfdi {
    if (existe(xml, 'Fault')) {
      const code = valor(xml, 'faultcode') ?? '';
      const str = valor(xml, 'faultstring') ?? '';
      // Un Fault es una respuesta del PAC, no una interrupcion: se sabe que
      // no timbro, asi que reintentar tras corregir es seguro.
      throw new PacError(`SOAP Fault del PAC: ${code} - ${str}`.trim(), false);
    }

    if (!existe(xml, nombreResultado)) {
      throw new PacError(
        `No se encontro el nodo '${nombreResultado}' en la respuesta del PAC.`,
        true,
      );
    }

    const [resultado] = elementos(xml, nombreResultado);

    const incidencias: Incidencia[] = elementos(resultado, 'Incidencia').map(
      (nodo) => ({
        idIncidencia: valor(nodo, 'IdIncidencia'),
        rfcEmisor: valor(nodo, 'RfcEmisor'),
        uuid: valor(nodo, 'Uuid'),
        codigoError: valor(nodo, 'CodigoError'),
        mensajeIncidencia: valor(nodo, 'MensajeIncidencia'),
        extraInfo: valor(nodo, 'ExtraInfo'),
        workProcessId: valor(nodo, 'WorkProcessId'),
        noCertificadoPac: valor(nodo, 'NoCertificadoPac'),
        fechaRegistro: valor(nodo, 'FechaRegistro'),
      }),
    );

    const uuid = valor(resultado, 'UUID') ?? valor(resultado, 'uuid');

    return {
      xml: valor(resultado, 'xml'),
      uuid,
      fecha: valor(resultado, 'Fecha') ?? valor(resultado, 'fecha'),
      codEstatus: valor(resultado, 'CodEstatus'),
      selloSAT: valor(resultado, 'SelloSAT'),
      noCertificadoSAT: valor(resultado, 'NoCertificadoSAT'),
      faultCode: valor(resultado, 'faultcode'),
      faultString: valor(resultado, 'faultstring'),
      incidencias,
      exitoso: Boolean(uuid) && incidencias.length === 0,
    };
  }

  /**
   * Oculta usuario y contrasena de un sobre SOAP para poder registrarlo.
   *
   * Nunca dejar credenciales del PAC en un log. Se expone para que quien
   * agregue trazas tenga la version segura a la mano.
   */
  static censurar(xml: string): string {
    return xml.replace(
      /(<(?:[\w.-]+:)?(?:contrasena|usuario)>)([\s\S]*?)(<\/)/gi,
      '$1***$3',
    );
  }
}
