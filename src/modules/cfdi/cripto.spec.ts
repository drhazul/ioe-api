import { cifrar, CifradoInvalidoError, descifrar } from './cripto';

const SECRETO = 'llave-de-cifrado-de-prueba';
const CONTRASENA = 'contrasena-del-csd-123';

describe('cifrar / descifrar', () => {
  it('lo que se cifra se recupera igual', () => {
    expect(descifrar(cifrar(CONTRASENA, SECRETO), SECRETO)).toBe(CONTRASENA);
  });

  it('el texto cifrado no contiene la contrasena', () => {
    const paquete = cifrar(CONTRASENA, SECRETO);
    expect(paquete).not.toContain(CONTRASENA);
    expect(paquete.startsWith('v1:')).toBe(true);
  });

  it('cifrar dos veces lo mismo da resultados distintos', () => {
    // Cada valor lleva su propia sal e IV: si salieran iguales, se podria
    // saber que dos RFC comparten contrasena con solo mirar la tabla.
    expect(cifrar(CONTRASENA, SECRETO)).not.toBe(cifrar(CONTRASENA, SECRETO));
  });

  it('con la llave equivocada no descifra', () => {
    const paquete = cifrar(CONTRASENA, SECRETO);
    expect(() => descifrar(paquete, 'otra-llave')).toThrow(
      CifradoInvalidoError,
    );
  });

  it('detecta que el dato fue alterado en la base', () => {
    const paquete = cifrar(CONTRASENA, SECRETO);
    const bytes = Buffer.from(paquete.slice(3), 'base64');
    bytes[bytes.length - 1] ^= 0xff;
    const manipulado = `v1:${bytes.toString('base64')}`;

    expect(() => descifrar(manipulado, SECRETO)).toThrow(/alterado/i);
  });

  it('rechaza un formato que no reconoce', () => {
    expect(() => descifrar('texto-plano', SECRETO)).toThrow(/no reconocido/i);
    expect(() => descifrar('v9:abcd', SECRETO)).toThrow(/no reconocido/i);
  });

  it('exige la llave de cifrado', () => {
    expect(() => cifrar(CONTRASENA, '')).toThrow(/CSD_CIFRADO_LLAVE/);
  });
});
