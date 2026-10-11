import {
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
} from 'node:crypto';

/**
 * CSD generado al vuelo para las pruebas. Nunca se usa un certificado en disco.
 *
 * Asi la suite corre en cualquier maquina y en CI sin depender de que exista
 * un certificado, y sin que ninguna llave ni contrasena entre al repositorio.
 */
export function generarCsdDePrueba(
  opciones: {
    noCertificado?: string;
    diasDeVigencia?: number;
    password?: string;
  } = {},
) {
  const {
    noCertificado = '30001000000500003364',
    diasDeVigencia = 365,
    password = 'contrasena-de-prueba',
  } = opciones;

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // El numero de serie de un CSD son 20 digitos ASCII guardados como hex.
  const serialHex = Buffer.from(noCertificado, 'ascii').toString('hex');

  const cer = construirCertificadoX509({
    serialHex,
    publicKey,
    privateKey,
    diasDeVigencia,
  });

  const key = privateKey.export({
    type: 'pkcs8',
    format: 'der',
    cipher: 'aes-256-cbc',
    passphrase: password,
  }) as Buffer;

  return { cer, key, password, privateKey, publicKey };
}

/**
 * Arma un X.509 v3 autofirmado a mano.
 *
 * Node no trae generacion de certificados, y meter una dependencia solo para
 * las pruebas no se justifica. Se construye el DER minimo que
 * `X509Certificate` sabe leer.
 */
function construirCertificadoX509({
  serialHex,
  publicKey,
  privateKey,
  diasDeVigencia,
}: {
  serialHex: string;
  publicKey: ReturnType<typeof createPublicKey>;
  privateKey: ReturnType<typeof createPrivateKey>;
  diasDeVigencia: number;
}): Buffer {
  const der = (tag: number, contenido: Buffer): Buffer => {
    const len = contenido.length;
    let cabecera: Buffer;
    if (len < 0x80) {
      cabecera = Buffer.from([tag, len]);
    } else {
      const bytes: number[] = [];
      let n = len;
      while (n > 0) {
        bytes.unshift(n & 0xff);
        n >>= 8;
      }
      cabecera = Buffer.from([tag, 0x80 | bytes.length, ...bytes]);
    }
    return Buffer.concat([cabecera, contenido]);
  };
  const sec = (...partes: Buffer[]) => der(0x30, Buffer.concat(partes));
  const set = (...partes: Buffer[]) => der(0x31, Buffer.concat(partes));
  const oid = (hex: string) => der(0x06, Buffer.from(hex, 'hex'));
  const utf8 = (s: string) => der(0x0c, Buffer.from(s, 'utf8'));
  const entero = (hex: string) => {
    let b = Buffer.from(hex, 'hex');
    if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
    return der(0x02, b);
  };
  // UTCTime va como YYMMDDHHMMSSZ: sin guiones, sin dos puntos y SIN la `T`
  // del ISO. Dejarla produce una fecha que Node lee como Invalid Date, y
  // entonces toda comparacion de vigencia se vuelve falsa en silencio.
  const tiempo = (d: Date) =>
    der(
      0x17,
      Buffer.from(
        d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z',
        'ascii',
      ),
    );

  const OID_SHA256_RSA = '2a864886f70d01010b';
  const OID_CN = '550403';
  const OID_UNIQUE_ID = '55042d'; // x500UniqueIdentifier, donde vive el RFC
  const OID_O = '55040a';

  const rdn = (oidHex: string, valor: string) =>
    set(sec(oid(oidHex), utf8(valor)));

  const nombre = sec(
    rdn(OID_CN, 'BERENICE XIMO QUEZADA'),
    rdn(OID_O, 'BERENICE XIMO QUEZADA'),
    rdn(OID_UNIQUE_ID, 'XIQB891116QE4'),
  );

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 86400000);
  const hasta = new Date(ahora.getTime() + diasDeVigencia * 86400000);

  const algoritmo = sec(oid(OID_SHA256_RSA), der(0x05, Buffer.alloc(0)));
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const tbs = sec(
    der(0xa0, der(0x02, Buffer.from([2]))), // version v3
    entero(serialHex),
    algoritmo,
    nombre,
    sec(tiempo(desde), tiempo(hasta)),
    nombre,
    spki,
  );

  const firma = createSign('RSA-SHA256').update(tbs).sign(privateKey);
  return sec(
    tbs,
    algoritmo,
    der(0x03, Buffer.concat([Buffer.from([0]), firma])),
  );
}
