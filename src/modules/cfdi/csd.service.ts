import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cargarCsd, Csd, CsdInvalidoError } from './cfdi-sellador';
import { cifrar, CifradoInvalidoError, descifrar } from './cripto';
import { CsdRepositorio, FilaCsd, ResumenFilaCsd } from './csd.repositorio';

export interface AltaCsdInput {
  /** Contenido del `.cer` en Base64. */
  cerBase64: string;
  /** Contenido del `.key` en Base64. */
  keyBase64: string;
  /** Contrasena de la llave privada. */
  password: string;
  /** c_RegimenFiscal del emisor: el certificado no lo trae. */
  regimenFiscal: string;
  /** CP del lugar de expedicion: tampoco viene en el certificado. */
  codigoPostal: string;
  usuario?: string;
  /**
   * Cuenta de Quadrum de esta razon social.
   *
   * Van con el certificado porque son del mismo contrato con el PAC. Si
   * no se capturan, ese RFC timbra con la cuenta del .env.
   */
  quadrumUsuario?: string;
  quadrumPassword?: string;
}

export interface ResumenCsd {
  rfc: string;
  nombre?: string;
  noCertificado: string;
  regimenFiscal: string;
  codigoPostal: string;
  validoDesde: string;
  validoHasta: string;
  diasRestantes: number;
}

/** El CSD listo para sellar, mas los datos que el certificado no trae. */
export interface CredencialesPac {
  usuario: string;
  contrasena: string;
}

export interface CsdEmisor {
  csd: Csd;
  cer: Buffer;
  regimenFiscal: string;
  codigoPostal: string;
  /** Cuenta del PAC de este RFC. Undefined = se usa la del .env. */
  credencialesPac?: CredencialesPac;
}

/** Tamano maximo por archivo: un CSD real ronda los 2 KB. */
const MAX_BYTES = 64 * 1024;

function diasRestantes(hasta: Date): number {
  return Math.floor((hasta.getTime() - Date.now()) / 86400000);
}

/**
 * Custodia de los CSD por RFC emisor.
 *
 * Reemplaza al CSD unico del `.env` (que se queda para las pruebas): cada
 * razon social factura con el suyo, y el RFC del certificado es la llave.
 * Nadie captura el RFC a mano — se lee del `.cer`, asi no hay forma de subir
 * el certificado equivocado bajo otro RFC.
 *
 * Mantiene en memoria los certificados ya abiertos, porque descifrar y abrir
 * la llave en cada factura es caro. La cache se limpia al dar de alta uno
 * nuevo y cuando el certificado vence.
 */
@Injectable()
export class CsdService {
  private readonly logger = new Logger(CsdService.name);
  private readonly cache = new Map<string, CsdEmisor>();

  constructor(
    private readonly repo: CsdRepositorio,
    private readonly config: ConfigService,
  ) {}

  /** Da de alta (o renueva) el certificado de una razon social. */
  async guardar(input: AltaCsdInput): Promise<ResumenCsd> {
    const cer = this.decodificar(input.cerBase64, '.cer');
    const key = this.decodificar(input.keyBase64, '.key');

    let csd: Csd;
    try {
      // Valida vigencia, que sea CSD y no e.firma, y que la llave corresponda
      // al certificado. Si algo esta mal, truena aqui y no se guarda nada.
      csd = cargarCsd({ cer, key, password: input.password ?? '' });
    } catch (e) {
      if (e instanceof CsdInvalidoError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    if (!csd.rfc) {
      throw new BadRequestException(
        'El certificado no trae RFC en el subject; no se puede asociar a una razon social.',
      );
    }

    await this.repo.guardar({
      rfc: csd.rfc,
      nombre: csd.razonSocial,
      noCertificado: csd.noCertificado,
      regimenFiscal: input.regimenFiscal,
      codigoPostal: input.codigoPostal,
      cer,
      llave: key,
      passwordCifrada: cifrar(input.password ?? '', this.secreto()),
      vigenciaDesde: csd.validoDesde,
      vigenciaHasta: csd.validoHasta,
      usuario: input.usuario,
      quadrumUsuario: input.quadrumUsuario?.trim() || null,
      // La contrasena del PAC se cifra igual que la del .key: nunca se
      // guarda en claro.
      quadrumPasswordCifrada: input.quadrumPassword
        ? cifrar(input.quadrumPassword, this.secreto())
        : null,
    });

    this.cache.delete(csd.rfc.toUpperCase());
    this.logger.log(
      `CSD dado de alta: rfc=${csd.rfc} noCertificado=${csd.noCertificado} ` +
        `vence=${csd.validoHasta.toISOString().slice(0, 10)} usuario=${input.usuario ?? '-'}`,
    );

    return this.resumen(csd, input.regimenFiscal, input.codigoPostal);
  }

  /** Certificados cargados. Nunca incluye archivos ni contrasenas. */
  listar(): Promise<ResumenFilaCsd[]> {
    return this.repo.listar();
  }

  /** El CSD con el que se debe sellar una factura de ese RFC. */
  async obtenerPorRfc(rfc: string): Promise<CsdEmisor> {
    const clave = String(rfc ?? '')
      .trim()
      .toUpperCase();
    if (!clave) {
      throw new BadRequestException('Falta el RFC emisor.');
    }

    const enCache = this.cache.get(clave);
    if (enCache && new Date() <= enCache.csd.validoHasta) return enCache;
    this.cache.delete(clave);

    const fila = await this.repo.activoPorRfc(clave);
    if (!fila) {
      throw new NotFoundException(
        `No hay CSD activo para el RFC ${clave}. Cargalo en /cfdi/csd antes de timbrar.`,
      );
    }

    let password: string;
    try {
      password = descifrar(fila.PASSWORD_CIFRADA, this.secreto());
    } catch (e) {
      if (e instanceof CifradoInvalidoError) {
        throw new ServiceUnavailableException(
          `No se pudo descifrar la contrasena del CSD de ${clave}: ${e.message}`,
        );
      }
      throw e;
    }

    let csd: Csd;
    try {
      csd = cargarCsd({ cer: fila.CER, key: fila.LLAVE, password });
    } catch (e) {
      if (e instanceof CsdInvalidoError) {
        // Tipico al vencer el certificado: el alta paso, hoy ya no sirve.
        throw new ServiceUnavailableException(
          `El CSD de ${clave} no se puede usar: ${e.message}`,
        );
      }
      throw e;
    }

    const emisor: CsdEmisor = {
      csd,
      cer: fila.CER,
      regimenFiscal: fila.REGIMEN_FISCAL,
      codigoPostal: fila.CODIGO_POSTAL,
      credencialesPac: this.credencialesDe(fila, clave),
    };
    this.cache.set(clave, emisor);
    return emisor;
  }

  // ---------------------------------------------------------------------

  /**
   * Cuenta del PAC de ese RFC, si se capturo.
   *
   * Si la contrasena no se puede descifrar no se tumba el timbrado: se
   * avisa y se cae a la cuenta del .env, que es el comportamiento previo.
   */
  private credencialesDe(
    fila: FilaCsd,
    clave: string,
  ): CredencialesPac | undefined {
    const usuario = fila.QUADRUM_USUARIO?.trim();
    if (!usuario || !fila.QUADRUM_PASSWORD_CIFRADA) return undefined;

    try {
      return {
        usuario,
        contrasena: descifrar(fila.QUADRUM_PASSWORD_CIFRADA, this.secreto()),
      };
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `No se pudo descifrar la contrasena de Quadrum de ${clave}: ${detalle}. ` +
          `Se usara la cuenta del .env.`,
      );
      return undefined;
    }
  }

  private secreto(): string {
    const llave = this.config.get<string>('CSD_CIFRADO_LLAVE');
    if (!llave) {
      throw new ServiceUnavailableException(
        'Falta CSD_CIFRADO_LLAVE en el .env: sin ella no se pueden guardar ni leer los CSD.',
      );
    }
    return llave;
  }

  private decodificar(base64: string, cual: string): Buffer {
    const bytes = Buffer.from(String(base64 ?? '').trim(), 'base64');
    if (!bytes.length) {
      throw new BadRequestException(`El archivo ${cual} viene vacio.`);
    }
    if (bytes.length > MAX_BYTES) {
      throw new BadRequestException(
        `El archivo ${cual} pesa ${bytes.length} bytes; el limite es ${MAX_BYTES}.`,
      );
    }
    return bytes;
  }

  private resumen(
    csd: Csd,
    regimenFiscal: string,
    codigoPostal: string,
  ): ResumenCsd {
    return {
      rfc: csd.rfc!,
      nombre: csd.razonSocial,
      noCertificado: csd.noCertificado,
      regimenFiscal,
      codigoPostal,
      validoDesde: csd.validoDesde.toISOString(),
      validoHasta: csd.validoHasta.toISOString(),
      diasRestantes: diasRestantes(csd.validoHasta),
    };
  }
}
