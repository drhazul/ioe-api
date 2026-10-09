import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cargarCsd, Csd, CsdInvalidoError } from './cfdi-sellador';

export interface ResumenCsd {
  noCertificado: string;
  rfc?: string;
  razonSocial?: string;
  validoDesde: string;
  validoHasta: string;
  diasRestantes: number;
}

/**
 * Custodia del CSD dentro de la API.
 *
 * Se carga de forma perezosa (la primera vez que se pide), no al arrancar: la
 * API debe levantar aunque el CSD no este configurado, porque el resto de los
 * modulos no dependen de el.
 *
 * Los archivos y la contrasena vienen SOLO del `.env`. Nunca exponer la llave
 * privada ni la contrasena fuera de esta clase: para mostrar datos del
 * certificado esta `resumen()`.
 */
@Injectable()
export class CsdStore {
  private csd?: Csd;
  private cer?: Buffer;

  constructor(private readonly config: ConfigService) {}

  obtener(): Csd {
    // Si vencio mientras la API estaba arriba, se recarga para que el error
    // de vigencia salga aqui y no como un rechazo del PAC.
    if (this.csd && new Date() > this.csd.validoHasta) {
      this.csd = undefined;
      this.cer = undefined;
    }
    if (!this.csd) this.cargar();
    return this.csd!;
  }

  /** El `.cer` en DER, para verificar sellos localmente. */
  certificadoDer(): Buffer {
    this.obtener();
    return this.cer!;
  }

  /**
   * El `.cer` en PEM.
   *
   * El servicio de cancelacion de Quadrum decodifica lo que recibe como texto:
   * con DER responde un Fault
   * `'ascii' codec can't decode byte 0x82 in position 1` (0x82 es la cabecera
   * DER). Para el sellado, en cambio, se usa `certificadoDer()`.
   */
  certificadoPem(): Buffer {
    return Buffer.from(
      new X509Certificate(this.certificadoDer()).toString(),
      'utf8',
    );
  }

  /**
   * La llave privada en PKCS#8 PEM **sin cifrar**.
   *
   * Solo para el servicio de cancelacion de Quadrum, que pide `cer` y `key` y
   * no tiene campo de contrasena. Es el material mas sensible del sistema:
   * nunca escribirlo en disco, en un log ni en una respuesta HTTP.
   */
  llavePrivadaPem(): Buffer {
    return Buffer.from(
      this.obtener().llavePrivada.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string,
      'utf8',
    );
  }

  resumen(): ResumenCsd {
    const csd = this.obtener();
    return {
      noCertificado: csd.noCertificado,
      rfc: csd.rfc,
      razonSocial: csd.razonSocial,
      validoDesde: csd.validoDesde.toISOString(),
      validoHasta: csd.validoHasta.toISOString(),
      diasRestantes: Math.floor(
        (csd.validoHasta.getTime() - Date.now()) / 86400000,
      ),
    };
  }

  private cargar(): void {
    const cerPath = this.config.get<string>('CSD_CER_PATH');
    const keyPath = this.config.get<string>('CSD_KEY_PATH');
    const password = this.config.get<string>('CSD_PASSWORD');

    if (!cerPath || !keyPath || password === undefined) {
      throw new ServiceUnavailableException(
        'CSD no configurado: faltan CSD_CER_PATH, CSD_KEY_PATH y/o CSD_PASSWORD',
      );
    }

    let cer: Buffer;
    let key: Buffer;
    try {
      cer = readFileSync(resolve(cerPath));
      key = readFileSync(resolve(keyPath));
    } catch (e) {
      throw new ServiceUnavailableException(
        `No se pudieron leer los archivos del CSD: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    try {
      this.csd = cargarCsd({ cer, key, password });
      this.cer = cer;
    } catch (e) {
      if (e instanceof CsdInvalidoError) {
        throw new ServiceUnavailableException(`CSD invalido: ${e.message}`);
      }
      throw e;
    }
  }
}
