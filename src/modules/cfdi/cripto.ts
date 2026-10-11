import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Cifrado de las contrasenas de los CSD que se guardan en la base.
 *
 * AES-256-GCM: ademas de cifrar, detecta manipulacion — si alguien altera un
 * byte del texto cifrado en la tabla, el descifrado truena en vez de devolver
 * basura silenciosa.
 *
 * La llave sale de `CSD_CIFRADO_LLAVE` (.env), nunca de la base. Asi, quien
 * lea la tabla FACT_CSD sin esa variable no puede usar los certificados.
 * Cada valor lleva su propia sal, por lo que cifrar dos veces la misma
 * contrasena produce textos distintos.
 *
 * Formato: `v1:base64(sal[16] | iv[12] | tag[16] | cifrado)`. El prefijo deja
 * la puerta abierta a cambiar de algoritmo sin romper lo ya guardado.
 */

const VERSION = 'v1';
const TAM_SAL = 16;
const TAM_IV = 12;
const TAM_TAG = 16;

export class CifradoInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CifradoInvalidoError';
  }
}

function derivarLlave(secreto: string, sal: Buffer): Buffer {
  if (!secreto) {
    throw new CifradoInvalidoError(
      'Falta la llave de cifrado (CSD_CIFRADO_LLAVE).',
    );
  }
  return scryptSync(secreto, sal, 32);
}

export function cifrar(texto: string, secreto: string): string {
  const sal = randomBytes(TAM_SAL);
  const iv = randomBytes(TAM_IV);
  const cifrador = createCipheriv(
    'aes-256-gcm',
    derivarLlave(secreto, sal),
    iv,
  );
  const cifrado = Buffer.concat([
    cifrador.update(texto, 'utf8'),
    cifrador.final(),
  ]);
  const paquete = Buffer.concat([sal, iv, cifrador.getAuthTag(), cifrado]);
  return `${VERSION}:${paquete.toString('base64')}`;
}

export function descifrar(paquete: string, secreto: string): string {
  const [version, cuerpo] = String(paquete ?? '').split(':');
  if (version !== VERSION || !cuerpo) {
    throw new CifradoInvalidoError(
      `Formato de cifrado no reconocido (se esperaba '${VERSION}:...').`,
    );
  }

  const bytes = Buffer.from(cuerpo, 'base64');
  if (bytes.length <= TAM_SAL + TAM_IV + TAM_TAG) {
    throw new CifradoInvalidoError('El valor cifrado esta incompleto.');
  }

  const sal = bytes.subarray(0, TAM_SAL);
  const iv = bytes.subarray(TAM_SAL, TAM_SAL + TAM_IV);
  const tag = bytes.subarray(TAM_SAL + TAM_IV, TAM_SAL + TAM_IV + TAM_TAG);
  const cifrado = bytes.subarray(TAM_SAL + TAM_IV + TAM_TAG);

  const descifrador = createDecipheriv(
    'aes-256-gcm',
    derivarLlave(secreto, sal),
    iv,
  );
  descifrador.setAuthTag(tag);
  try {
    return Buffer.concat([
      descifrador.update(cifrado),
      descifrador.final(),
    ]).toString('utf8');
  } catch {
    // Pasa con la llave equivocada y tambien si alguien altero la tabla.
    throw new CifradoInvalidoError(
      'No se pudo descifrar: la llave (CSD_CIFRADO_LLAVE) no corresponde o el dato fue alterado.',
    );
  }
}
