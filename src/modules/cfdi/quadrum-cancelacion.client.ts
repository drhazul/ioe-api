import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PacError } from './quadrum.client';
import { elementos, escaparTexto, existe, valor } from './soap-xml';
import { CuentaPac } from './quadrum.client';

/**
 * Cliente SOAP del servicio de CANCELACION de Quadrum.
 *
 * Vive en otro endpoint que el timbrado (`/cancelar`, no `/timbrar`) y con otro
 * namespace. El contrato se leyo del WSDL publicado en
 * `https://devws.cfdiquadrum.com.mx/cancelar?wsdl`:
 *
 *   cancelar(UUIDS, usuario, contrasena, rfc, cer, key, reintentar)
 *   cancelar_con_certificados(UUIDS, usuario, contrasena, rfc, serial, reintentar)
 *   obtiene_status_sat(usario, password, taxpayer_id, rtaxpayer_id, uuid, total)
 *   acuse(usuario, contrasena, rfc, uuid, tipo)
 *   consulta(usuario, contrasena, uuid)
 *
 * Aqui se usa `cancelar`, que manda el CSD (cer + key SIN cifrar) en cada
 * llamada. La alternativa es `cancelar_con_certificados`, donde Quadrum
 * resguarda el certificado y solo se manda su numero de serie; esa evita
 * mandar la llave privada por la red y conviene evaluarla antes de produccion.
 *
 * OJO: el `key` que espera el PAC va sin contrasena. Nunca registrarlo en
 * logs ni guardarlo en la evidencia.
 */

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_CANCELAR = 'http://ws.cfdiquadrum.com.mx/cancelar';
const NS_VIEWS = 'apps.services.soap.core.views';

/** Codigos del SAT que significan "la solicitud procedio". */
const ESTATUS_UUID_OK = new Set(['201', '202']);

export interface EstatusSat {
  /** "Cancelable sin aceptacion", "Cancelable con aceptacion" o "No cancelable". */
  esCancelable?: string;
  codigoEstatus?: string;
  /** "Vigente" o "Cancelado". */
  estado?: string;
  estatusCancelacion?: string;
  error?: string;
}

export interface FolioCancelado {
  uuid?: string;
  /** 201 = aceptada, 202 = ya estaba cancelado; otro = rechazo. */
  estatusUUID?: string;
}

export interface AcuseCancelacion {
  codEstatus?: string;
  fecha?: string;
  rfcEmisor?: string;
  /** Acuse del SAT, tal como lo manda el PAC (XML o base64). */
  acuse?: string;
  folios: FolioCancelado[];
  /** `true` si todos los folios respondieron 201 o 202. */
  exitoso: boolean;
}

export interface ReciboAcuse {
  uuid?: string;
  fecha?: string;
  recibo?: string;
  rfc?: string;
  error?: string;
  exito?: boolean;
}

export interface CancelarInput {
  uuid: string;
  motivo: string;
  folioSustitucion?: string;
  rfcEmisor: string;
  /** `.cer` en **PEM** (el PAC lo lee como texto, no acepta DER). */
  cer: Buffer;
  /** Llave privada en PKCS#8 **PEM**, sin cifrar. */
  key: Buffer;
  reintentar?: boolean;
  /** Cuenta del PAC de esa razon social. Sin ella se usa la del .env. */
  cuenta?: CuentaPac;
}

@Injectable()
export class QuadrumCancelacionClient {
  private readonly logger = new Logger(QuadrumCancelacionClient.name);

  constructor(private readonly config: ConfigService) {}

  getEndpoint(): string {
    const propio = this.config.get<string>('QUADRUM_CANCELAR_ENDPOINT');
    if (propio) return propio;
    // El de timbrado y el de cancelacion son el mismo host con otra ruta.
    const timbrar = this.config.get<string>('QUADRUM_ENDPOINT');
    if (timbrar) return timbrar.replace(/\/timbrar\/?$/i, '/cancelar');
    return 'https://devws.cfdiquadrum.com.mx/cancelar';
  }

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
   * Pregunta al SAT (via el PAC) si el CFDI se puede cancelar. Solo lectura:
   * es la llamada obligatoria ANTES de cancelar, porque distingue entre
   * "cancelable sin aceptacion", "con aceptacion" (el receptor tiene que
   * aceptar) y "no cancelable".
   */
  async estatusSat(input: {
    uuid: string;
    rfcEmisor: string;
    rfcReceptor: string;
    total: string;
    cuenta?: CuentaPac;
  }): Promise<EstatusSat> {
    this.assertCredentials(input.cuenta);
    const cuerpo =
      `<can:obtiene_status_sat xmlns:can="${NS_CANCELAR}">` +
      `<can:usario>${escaparTexto(this.getUsuario(input.cuenta))}</can:usario>` +
      `<can:password>${escaparTexto(this.getContrasena(input.cuenta))}</can:password>` +
      `<can:taxpayer_id>${escaparTexto(input.rfcEmisor)}</can:taxpayer_id>` +
      `<can:rtaxpayer_id>${escaparTexto(input.rfcReceptor)}</can:rtaxpayer_id>` +
      `<can:uuid>${escaparTexto(input.uuid)}</can:uuid>` +
      `<can:total>${escaparTexto(input.total)}</can:total>` +
      `</can:obtiene_status_sat>`;

    const resultado = await this.enviar(
      'obtiene_status_sat',
      cuerpo,
      'obtiene_status_satResult',
    );
    return {
      esCancelable: valor(resultado, 'EsCancelable'),
      codigoEstatus: valor(resultado, 'CodigoEstatus'),
      estado: valor(resultado, 'Estado'),
      estatusCancelacion: valor(resultado, 'EstatusCancelacion'),
      error: valor(resultado, 'error'),
    };
  }

  /** Solicita la cancelacion de un CFDI. Usa el CSD del emisor. */
  async cancelar(input: CancelarInput): Promise<AcuseCancelacion> {
    this.assertCredentials(input.cuenta);

    const folioSust = input.folioSustitucion
      ? ` FolioSustitucion="${escaparTexto(input.folioSustitucion)}"`
      : '';
    const cuerpo =
      `<can:cancelar xmlns:can="${NS_CANCELAR}">` +
      `<can:UUIDS>` +
      `<vw:UUID xmlns:vw="${NS_VIEWS}" UUID="${escaparTexto(input.uuid)}"` +
      ` Motivo="${escaparTexto(input.motivo)}"${folioSust}/>` +
      `</can:UUIDS>` +
      `<can:usuario>${escaparTexto(this.getUsuario(input.cuenta))}</can:usuario>` +
      `<can:contrasena>${escaparTexto(this.getContrasena(input.cuenta))}</can:contrasena>` +
      `<can:rfc>${escaparTexto(input.rfcEmisor)}</can:rfc>` +
      `<can:cer>${input.cer.toString('base64')}</can:cer>` +
      `<can:key>${input.key.toString('base64')}</can:key>` +
      `<can:reintentar>${input.reintentar ? 'true' : 'false'}</can:reintentar>` +
      `</can:cancelar>`;

    if (this.esProduccion()) {
      this.logger.warn(
        `Cancelando contra PRODUCCION (${this.getEndpoint()}) el UUID ${input.uuid}.`,
      );
    }

    const resultado = await this.enviar('cancelar', cuerpo, 'cancelarResult');
    const folios: FolioCancelado[] = elementos(resultado, 'Folio').map(
      (nodo) => ({
        uuid: valor(nodo, 'UUID'),
        estatusUUID: valor(nodo, 'EstatusUUID'),
      }),
    );

    return {
      codEstatus: valor(resultado, 'CodEstatus'),
      fecha: valor(resultado, 'Fecha'),
      rfcEmisor: valor(resultado, 'RfcEmisor'),
      acuse: valor(resultado, 'Acuse'),
      folios,
      exitoso:
        folios.length > 0 &&
        folios.every((f) =>
          ESTATUS_UUID_OK.has(String(f.estatusUUID ?? '').trim()),
        ),
    };
  }

  /** Acuse del SAT de una cancelacion ya solicitada. */
  async acuse(input: {
    uuid: string;
    rfcEmisor: string;
    tipo?: string;
    cuenta?: CuentaPac;
  }): Promise<ReciboAcuse> {
    this.assertCredentials(input.cuenta);
    const cuerpo =
      `<can:acuse xmlns:can="${NS_CANCELAR}">` +
      `<can:usuario>${escaparTexto(this.getUsuario(input.cuenta))}</can:usuario>` +
      `<can:contrasena>${escaparTexto(this.getContrasena(input.cuenta))}</can:contrasena>` +
      `<can:rfc>${escaparTexto(input.rfcEmisor)}</can:rfc>` +
      `<can:uuid>${escaparTexto(input.uuid)}</can:uuid>` +
      `<can:tipo>${escaparTexto(input.tipo ?? 'cancelacion')}</can:tipo>` +
      `</can:acuse>`;

    const resultado = await this.enviar('acuse', cuerpo, 'acuseResult');
    return {
      uuid: valor(resultado, 'uuid'),
      fecha: valor(resultado, 'fecha'),
      recibo: valor(resultado, 'recibo'),
      rfc: valor(resultado, 'rfc'),
      error: valor(resultado, 'error'),
      exito: valor(resultado, 'exito') === 'true',
    };
  }

  // ---------------------------------------------------------------------

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

  private async enviar(
    soapAction: string,
    cuerpo: string,
    nombreResultado: string,
  ): Promise<string> {
    const sobre =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}">` +
      `<soapenv:Header/><soapenv:Body>${cuerpo}</soapenv:Body>` +
      `</soapenv:Envelope>`;

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), this.getTimeoutMs());

    let texto: string;
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
      texto = await resp.text();
    } catch (e) {
      const abortado = control.signal.aborted;
      const detalle = e instanceof Error ? e.message : String(e);
      throw new PacError(
        abortado
          ? `Se agoto el tiempo de espera con el PAC (${this.getTimeoutMs()} ms) en '${soapAction}'. ` +
              `IMPORTANTE: la solicitud pudo haber llegado al SAT; consulta el estatus antes de reintentar.`
          : `Error de comunicacion con el PAC en '${soapAction}': ${detalle}`,
        true,
      );
    } finally {
      clearTimeout(reloj);
    }

    if (!texto?.trim()) {
      throw new PacError(`El PAC respondio ${status} sin cuerpo.`, true);
    }
    if (existe(texto, 'Fault')) {
      const code = valor(texto, 'faultcode') ?? '';
      const str = valor(texto, 'faultstring') ?? '';
      throw new PacError(`SOAP Fault del PAC: ${code} - ${str}`.trim(), false);
    }
    if (!existe(texto, nombreResultado)) {
      throw new PacError(
        `No se encontro el nodo '${nombreResultado}' en la respuesta del PAC.`,
        true,
      );
    }
    const [resultado] = elementos(texto, nombreResultado);
    return resultado;
  }
}
