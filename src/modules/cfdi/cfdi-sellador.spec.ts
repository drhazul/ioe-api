import { X509Certificate } from 'node:crypto';
import {
  cargarCsd,
  CsdInvalidoError,
  sellar,
  verificarSello,
} from './cfdi-sellador';
import { nodo } from './cfdi-node';
import { generarCsdDePrueba } from './testing/csd-de-prueba';

function comprobanteBase() {
  return nodo({
    name: 'cfdi:Comprobante',
    attrs: {
      Version: '4.0',
      Fecha: '2026-09-10T12:00:00',
      SubTotal: '100.00',
      Moneda: 'MXN',
      Total: '116.00',
      TipoDeComprobante: 'I',
      Exportacion: '01',
      LugarExpedicion: '39000',
    },
    children: [
      nodo({
        name: 'cfdi:Emisor',
        attrs: {
          Rfc: 'XIQB891116QE4',
          Nombre: 'GRUPO A & B SA DE CV',
          RegimenFiscal: '612',
        },
      }),
      nodo({
        name: 'cfdi:Receptor',
        attrs: {
          Rfc: 'XAXX010101000',
          Nombre: 'PUBLICO EN GENERAL',
          DomicilioFiscalReceptor: '39000',
          RegimenFiscalReceptor: '616',
          UsoCFDI: 'S01',
        },
      }),
      nodo({
        name: 'cfdi:Conceptos',
        children: [
          nodo({
            name: 'cfdi:Concepto',
            attrs: {
              ClaveProdServ: '01010101',
              Cantidad: '1',
              ClaveUnidad: 'H87',
              Descripcion: 'ARTICULO',
              ValorUnitario: '100.00',
              Importe: '100.00',
              ObjetoImp: '02',
            },
          }),
        ],
      }),
    ],
  });
}

describe('cargarCsd', () => {
  it('carga un CSD valido y deriva sus datos', () => {
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });

    expect(csd.noCertificado).toBe('30001000000500003364');
    expect(csd.noCertificado).toHaveLength(20);
    expect(csd.rfc).toBe('XIQB891116QE4');
    expect(csd.certificadoBase64).toBe(cer.toString('base64'));
  });

  it('rechaza una contrasena incorrecta con un mensaje claro', () => {
    const { cer, key } = generarCsdDePrueba();
    expect(() => cargarCsd({ cer, key, password: 'la-que-no-es' })).toThrow(
      /contrasena del .key es incorrecta/i,
    );
  });

  it('rechaza un certificado vencido', () => {
    const { cer, key, password } = generarCsdDePrueba({ diasDeVigencia: 1 });
    const dentroDeUnaSemana = new Date(Date.now() + 7 * 86400000);
    expect(() =>
      cargarCsd({ cer, key, password, ahora: dentroDeUnaSemana }),
    ).toThrow(/vencio/i);
  });

  it('detecta una e.firma disfrazada de CSD', () => {
    // Una e.firma no produce 20 digitos al decodificar su numero de serie.
    const { cer, key, password } = generarCsdDePrueba({
      noCertificado: 'NO-SON-20-DIGITOS',
    });
    expect(() => cargarCsd({ cer, key, password })).toThrow(/e\.?firma/i);
  });

  it('detecta que el .key no corresponde al .cer', () => {
    const a = generarCsdDePrueba();
    const b = generarCsdDePrueba();
    expect(() =>
      cargarCsd({ cer: a.cer, key: b.key, password: b.password }),
    ).toThrow(CsdInvalidoError);
    expect(() =>
      cargarCsd({ cer: a.cer, key: b.key, password: b.password }),
    ).toThrow(/no corresponde/i);
  });
});

describe('sellar', () => {
  it('pone NoCertificado y Certificado ANTES de firmar, y el Sello despues', () => {
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });
    const r = sellar(comprobanteBase(), csd);

    // Certificado y NoCertificado forman parte de lo firmado.
    expect(r.cadena).toContain(csd.noCertificado);
    // El sello, jamas.
    expect(r.cadena).not.toContain(r.sello);
    // Y quedan los tres en el comprobante resultante.
    expect(r.comprobante.attrs.get('NoCertificado')).toBe(csd.noCertificado);
    expect(r.comprobante.attrs.get('Certificado')).toBe(csd.certificadoBase64);
    expect(r.comprobante.attrs.get('Sello')).toBe(r.sello);
  });

  it('produce un sello que valida contra el certificado', () => {
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });
    const r = sellar(comprobanteBase(), csd);

    expect(verificarSello(r, cer)).toBe(true);
  });

  it('el sello NO valida si la cadena cambia aunque sea un caracter', () => {
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });
    const r = sellar(comprobanteBase(), csd);

    const manipulado = { ...r, cadena: r.cadena.replace('100.00', '900.00') };
    expect(verificarSello(manipulado, cer)).toBe(false);
  });

  it('firma el "&" literal, no la entidad escapada', () => {
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });
    const r = sellar(comprobanteBase(), csd);

    expect(r.cadena).toContain('GRUPO A & B SA DE CV');
    expect(r.cadena).not.toContain('&amp;');
    expect(verificarSello(r, cer)).toBe(true);
  });

  it('se niega a sellar dos veces', () => {
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });
    const r = sellar(comprobanteBase(), csd);

    expect(() => sellar(r.comprobante, csd)).toThrow(/ya viene con Sello/i);
  });

  it('sellar dos veces el mismo comprobante da el mismo sello', () => {
    // RSA con relleno PKCS#1 v1.5 es determinista. Si esto cambiara, la
    // deteccion de duplicados por sello dejaria de funcionar.
    const { cer, key, password } = generarCsdDePrueba();
    const csd = cargarCsd({ cer, key, password });

    const a = sellar(comprobanteBase(), csd);
    const b = sellar(comprobanteBase(), csd);
    expect(a.sello).toBe(b.sello);
    expect(a.cadena).toBe(b.cadena);
  });
});

describe('X509Certificate — que el certificado de prueba sea real', () => {
  it('Node lo puede leer como certificado valido', () => {
    const { cer } = generarCsdDePrueba();
    const cert = new X509Certificate(cer);
    expect(cert.publicKey.asymmetricKeyType).toBe('rsa');
    expect(cert.subject).toContain('XIQB891116QE4');
  });
});
