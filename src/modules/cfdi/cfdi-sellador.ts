/**
 * Sellado de CFDI 4.0.
 *
 * Reglas del SAT que no se negocian, y que este modulo hace cumplir por codigo:
 *
 *  1. `NoCertificado` y `Certificado` van en el comprobante ANTES de generar la
 *     cadena original — forman parte de lo que se firma.
 *  2. El `Sello` NUNCA forma parte de la cadena original.
 *  3. La cadena se firma en UTF-8 **sin BOM**. Con BOM el PAC rechaza.
 *  4. Algoritmo: SHA256withRSA, resultado en Base64.
 *  5. `NoCertificado` se deriva decodificando el numero de serie hexadecimal
 *     del `.cer` como ASCII. Deben salir 20 digitos; si no, lo que te pasaron
 *     es una e.firma y no un CSD.
 *
 * Todo se hace con `node:crypto`. No hace falta ninguna dependencia.
 */
import {
  createPrivateKey,
  createSign,
  createVerify,
  KeyObject,
  X509Certificate,
} from 'node:crypto';
import { cadenaOriginal } from './cadena-original';
import { aUtf8SinBom, CfdiNode, nodo } from './cfdi-node';

export interface Csd {
  /** 20 digitos, derivado del numero de serie del certificado. */
  readonly noCertificado: string;
  /** El `.cer` en DER, codificado Base64: va tal cual al atributo Certificado. */
  readonly certificadoBase64: string;
  readonly rfc?: string;
  readonly razonSocial?: string;
  readonly validoDesde: Date;
  readonly validoHasta: Date;
  readonly llavePrivada: KeyObject;
}

export class CsdInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsdInvalidoError';
  }
}

/** Extrae un atributo del subject del certificado (`OID=valor`). */
function delSubject(cert: X509Certificate, clave: string): string | undefined {
  for (const linea of cert.subject.split('\n')) {
    const i = linea.indexOf('=');
    if (i < 0) continue;
    if (linea.slice(0, i).trim() === clave) return linea.slice(i + 1).trim();
  }
  return undefined;
}

export interface CargarCsdInput {
  /** Contenido del `.cer` en DER (tal como lo entrega el SAT). */
  cer: Buffer;
  /** Contenido del `.key` en DER, PKCS#8 cifrado. */
  key: Buffer;
  /** Contrasena del `.key`. */
  password: string;
  /** Momento contra el que se valida la vigencia. Inyectable para pruebas. */
  ahora?: Date;
}

/**
 * Carga y valida un CSD.
 *
 * Valida tres cosas antes de dejarte sellar, porque cada una produce un rechazo
 * del PAC que es caro de diagnosticar despues:
 *   - que el certificado este vigente,
 *   - que el `NoCertificado` tenga la forma de un CSD y no de una e.firma,
 *   - que el `.key` realmente corresponda al `.cer`.
 */
export function cargarCsd({
  cer,
  key,
  password,
  ahora = new Date(),
}: CargarCsdInput): Csd {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(cer);
  } catch (e) {
    throw new CsdInvalidoError(
      `No se pudo leer el .cer: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // --- NoCertificado -------------------------------------------------------
  const noCertificado = Buffer.from(cert.serialNumber, 'hex').toString('ascii');
  if (!/^\d{20}$/.test(noCertificado)) {
    throw new CsdInvalidoError(
      `El NoCertificado derivado ('${noCertificado}') no son 20 digitos. ` +
        `Es probable que el archivo sea una e.firma (FIEL) y no un CSD: la ` +
        `e.firma sirve para cancelar y hacer tramites, no para sellar facturas.`,
    );
  }

  // --- Vigencia ------------------------------------------------------------
  const validoDesde = new Date(cert.validFrom);
  const validoHasta = new Date(cert.validTo);
  if (ahora < validoDesde) {
    throw new CsdInvalidoError(
      `El certificado aun no es valido (empieza ${validoDesde.toISOString()}).`,
    );
  }
  if (ahora > validoHasta) {
    throw new CsdInvalidoError(
      `El certificado vencio el ${validoHasta.toISOString()}. Hay que renovarlo ante el SAT.`,
    );
  }

  // --- Llave privada -------------------------------------------------------
  let llavePrivada: KeyObject;
  try {
    llavePrivada = createPrivateKey({
      key,
      format: 'der',
      type: 'pkcs8',
      passphrase: password,
    });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    throw new CsdInvalidoError(
      /bad decrypt|BAD_DECRYPT/i.test(detalle)
        ? 'La contrasena del .key es incorrecta.'
        : `No se pudo abrir el .key: ${detalle}`,
    );
  }

  // --- ¿La llave corresponde al certificado? -------------------------------
  // Se comprueba firmando y verificando: si no son par, la verificacion falla.
  // Sellar con una llave que no corresponde al Certificado publicado produce
  // un rechazo del PAC que no dice cual de los dos archivos esta mal.
  const reto = Buffer.from('prueba-de-correspondencia-csd', 'utf8');
  const firmaReto = createSign('RSA-SHA256').update(reto).sign(llavePrivada);
  const corresponden = createVerify('RSA-SHA256')
    .update(reto)
    .verify(cert.publicKey, firmaReto);
  if (!corresponden) {
    throw new CsdInvalidoError(
      'El .key no corresponde al .cer: son de certificados distintos.',
    );
  }

  return {
    noCertificado,
    certificadoBase64: cer.toString('base64'),
    rfc: delSubject(cert, 'x500UniqueIdentifier'),
    razonSocial: delSubject(cert, 'O') ?? delSubject(cert, 'CN'),
    validoDesde,
    validoHasta,
    llavePrivada,
  };
}

export interface ComprobanteSellado {
  /** El comprobante con NoCertificado, Certificado y Sello ya puestos. */
  readonly comprobante: CfdiNode;
  /** La cadena original exacta que se firmo. Guardala: es oro para depurar. */
  readonly cadena: string;
  /** El sello en Base64. */
  readonly sello: string;
  readonly noCertificado: string;
}

/**
 * Sella un comprobante.
 *
 * @param comprobante Sin `NoCertificado`, `Certificado` ni `Sello`. Este modulo
 *   los pone en el orden correcto; ponerlos antes es justo lo que rompe el
 *   sellado.
 */
export function sellar(comprobante: CfdiNode, csd: Csd): ComprobanteSellado {
  if (comprobante.attrs.has('Sello')) {
    throw new Error(
      'El comprobante ya viene con Sello. Sellar dos veces produce una cadena ' +
        'original distinta a la que valida el SAT.',
    );
  }

  // PASO 1 — NoCertificado y Certificado ANTES de la cadena original.
  const conCertificado = nodo({
    name: comprobante.name,
    attrs: {
      ...Object.fromEntries(comprobante.attrs),
      NoCertificado: csd.noCertificado,
      Certificado: csd.certificadoBase64,
    },
    children: comprobante.children,
  });

  // PASO 2 — Cadena original. El Sello aun NO existe, y asi debe ser.
  const cadena = cadenaOriginal(conCertificado);

  // PASO 3 — Firma SHA256withRSA sobre la cadena en UTF-8 sin BOM.
  const sello = createSign('RSA-SHA256')
    .update(aUtf8SinBom(cadena))
    .sign(csd.llavePrivada, 'base64');

  // PASO 4 — Ahora si, el Sello entra al comprobante.
  const sellado = nodo({
    name: conCertificado.name,
    attrs: { ...Object.fromEntries(conCertificado.attrs), Sello: sello },
    children: conCertificado.children,
  });

  return {
    comprobante: sellado,
    cadena,
    sello,
    noCertificado: csd.noCertificado,
  };
}

/**
 * Verifica un sello contra el certificado, sin salir a internet.
 *
 * Es la comprobacion mas barata que existe antes de gastar un timbre: si esto
 * falla, el PAC tambien va a rechazar, y aqui si sabes por que.
 */
export function verificarSello(
  sellado: ComprobanteSellado,
  cer: Buffer,
): boolean {
  const cert = new X509Certificate(cer);
  return createVerify('RSA-SHA256')
    .update(aUtf8SinBom(sellado.cadena))
    .verify(cert.publicKey, Buffer.from(sellado.sello, 'base64'));
}
